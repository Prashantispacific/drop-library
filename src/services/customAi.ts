import type { LibraryItemMeta, PlatformType, UnfurlResult } from '../types/library';
import { GeminiMetaSchema } from '../types/schema';

export interface CustomAiInput {
  platform: PlatformType;
  url?: string;
  rawShareText?: string;
  quickNote?: string;
  thumbnailUrl?: string;
  imageBase64?: string;
  unfurlData?: Partial<UnfurlResult>;
}

export interface CustomAiConfig {
  apiUrl: string;
  apiKey?: string;
  model: string;
}

/**
 * Normalizes OpenAI-compatible /chat/completions endpoint.
 */
function resolveChatCompletionsUrl(baseUrl: string): string {
  let clean = baseUrl.trim().replace(/\/+$/, '');
  if (clean.endsWith('/chat/completions')) {
    return clean;
  }
  return `${clean}/chat/completions`;
}

/**
 * Checks if a model ID is known to support multimodal image inputs.
 */
function isVisionCapableModel(modelId: string): boolean {
  return /vision|vl|gpt-4|gemini|claude|pixtral|llava|qwen.*vl/i.test(modelId);
}

/**
 * Extracts and cleans JSON from AI outputs, removing <think> tags and markdown code blocks.
 */
function extractJson(rawText: string): unknown {
  // 1. Strip reasoning blocks (DeepSeek R1, QwQ, etc.)
  let clean = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // 2. Extract from markdown code fences (```json ... ```)
  const fenceMatch = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    clean = fenceMatch[1].trim();
  }

  // 3. Direct JSON parse
  try {
    return JSON.parse(clean);
  } catch {
    // 4. Bracket search fallback
    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(clean.slice(firstBrace, lastBrace + 1));
    }
    throw new Error(`Failed to parse AI output as JSON: ${clean.slice(0, 150)}`);
  }
}

/**
 * Builds universal system prompt enforcing valid JSON output.
 */
function buildSystemPrompt(isTextNote: boolean): string {
  return `You are the AI Librarian for "Drop Library", a minimalist personal knowledge vault.
Analyze the provided content and extract strictly structured metadata.

INSTRUCTIONS:
${
  isTextNote
    ? `The content is a personal note, code snippet, or Markdown document created by the user. Do NOT invent a fake narrative.
1. title: First heading or first line/phrase of note (max 70 chars).
2. tldr: Exactly 1-2 crisp sentences capturing what the note covers.
3. category: Choose one of: "quote", "essay", "inspo", "tool", "article".
4. tags: 3 to 5 lowercase normalized tags (e.g. ["ideas", "markdown"]).
5. searchSynonyms: 5 to 8 lowercase search query variations.`
    : `Extract clear, accurate metadata from the drop.
1. title: Crisp, clickbait-free, hook-focused title (max 70 chars). Read on-screen video cover text if available.
2. tldr: 1-2 concise, high-signal sentences summarizing the core idea or practical takeaway.
3. category: Choose exactly one: "reel", "article", "essay", "tool", "quote", "inspo".
4. tags: 3 to 5 lowercase normalized tags categorizing topic/stack/domain.
5. searchSynonyms: 5 to 8 lowercase search query variations a user might type when looking for this.`
}

CRITICAL: Return ONLY a valid JSON object matching this schema:
{
  "title": "string",
  "tldr": "string",
  "category": "reel" | "article" | "essay" | "tool" | "quote" | "inspo",
  "tags": ["tag1", "tag2"],
  "searchSynonyms": ["synonym1", "synonym2"]
}`;
}

/**
 * Sends HTTP request to OpenAI-compatible endpoint with automatic fallback to serverless proxy if CORS fails.
 */
async function postOpenAiRequest(
  endpoint: string,
  headers: Record<string, string>,
  payload: unknown
): Promise<string> {
  const payloadString = JSON.stringify(payload);

  // Attempt 1: Direct client request
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: payloadString,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    return text;
  } catch (directErr: unknown) {
    const errString = String(directErr);
    const isCorsOrNetwork =
      errString.includes('Failed to fetch') ||
      errString.includes('NetworkError') ||
      errString.includes('CORS');

    // Attempt 2: If on Web and hit CORS error, route through Netlify proxy function
    if (isCorsOrNetwork && typeof window !== 'undefined' && !window.location.hostname.includes('localhost')) {
      console.warn(`[Custom AI] Direct fetch failed with CORS/network error. Retrying via Netlify serverless proxy...`);
      try {
        const proxyRes = await fetch('/.netlify/functions/aiProxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint,
            headers,
            body: payload,
          }),
        });

        const proxyText = await proxyRes.text();
        if (!proxyRes.ok) {
          throw new Error(`Proxy HTTP ${proxyRes.status}: ${proxyText.slice(0, 300)}`);
        }
        return proxyText;
      } catch (proxyErr) {
        console.error(`[Custom AI] Proxy request also failed:`, proxyErr);
        throw directErr;
      }
    }

    throw directErr;
  }
}

/**
 * Calls any OpenAI-compatible API endpoint (OpenRouter, NVIDIA NIM, Groq, Ollama, Together, etc.)
 * with auto-repair for vision vs text-only models and response_format compatibility.
 */
export async function enrichWithCustomAi(
  input: CustomAiInput,
  config: CustomAiConfig
): Promise<LibraryItemMeta> {
  const { apiUrl, apiKey, model } = config;
  if (!apiUrl?.trim()) {
    throw new Error('MISSING_CUSTOM_URL: Custom API URL is required.');
  }

  const endpoint = resolveChatCompletionsUrl(apiUrl);
  const modelName = model?.trim() || 'meta-llama/llama-3.3-70b-instruct';
  const isTextNote = input.platform === 'text';
  const systemPrompt = buildSystemPrompt(isTextNote);

  // Extract base64 image if available (from image drop or video thumbnail)
  let base64Data = input.imageBase64 || input.unfurlData?.thumbnailBase64;
  let mimeType = 'image/jpeg';

  if (!base64Data && input.thumbnailUrl?.startsWith('data:')) {
    const match = input.thumbnailUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      mimeType = match[1];
      base64Data = match[2];
    }
  }

  const promptText = `Content details:
- Platform: ${input.platform}
- URL: ${input.url || 'None'}
- Raw Note / Content: ${input.rawShareText ? input.rawShareText.slice(0, 3000) : 'None'}
- User Intent Tag: ${input.quickNote || 'None'}
- Page Title: ${input.unfurlData?.title || 'None'}
- Description: ${input.unfurlData?.description || 'None'}
- Author: ${input.unfurlData?.author || 'None'}`;

  // Check if model supports vision before sending image_url
  const canSendVision = Boolean(base64Data && isVisionCapableModel(modelName));

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey?.trim()) {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
  }
  if (endpoint.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = 'https://drop-vault-pg.netlify.app';
    headers['X-Title'] = 'Drop Library';
  }

  // Construct message payload
  const buildPayload = (includeVision: boolean, includeJsonFormat: boolean) => {
    let userContent: unknown;
    if (includeVision && base64Data) {
      userContent = [
        { type: 'text', text: promptText },
        {
          type: 'image_url',
          image_url: {
            url: `data:${mimeType};base64,${base64Data}`,
          },
        },
      ];
    } else {
      userContent = promptText;
    }

    const payload: Record<string, unknown> = {
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.2,
    };

    if (includeJsonFormat) {
      payload.response_format = { type: 'json_object' };
    }

    return payload;
  };

  let rawResponseBody: string;

  // Attempt 1: Optimal request (multimodal if vision model, with json_object format)
  try {
    const payload1 = buildPayload(canSendVision, true);
    rawResponseBody = await postOpenAiRequest(endpoint, headers, payload1);
  } catch (err1: unknown) {
    console.warn(`[Custom AI] Attempt 1 failed (${(err1 as Error)?.message}). Trying Auto-Repair (text-only & standard JSON)...`);

    // Attempt 2: Auto-Repair (text-only prompt without response_format to support models that reject vision or json_object)
    try {
      const payload2 = buildPayload(false, false);
      rawResponseBody = await postOpenAiRequest(endpoint, headers, payload2);
    } catch (err2: unknown) {
      console.error(`[Custom AI] Auto-Repair request also failed:`, err2);
      throw err2;
    }
  }

  const data = JSON.parse(rawResponseBody);
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response content received from Custom AI provider');
  }

  const parsedJson = extractJson(content);
  const validated = GeminiMetaSchema.parse(parsedJson);

  return {
    title: validated.title,
    tldr: validated.tldr,
    category: validated.category,
    tags: validated.tags,
    searchSynonyms: validated.searchSynonyms,
    authorOrHandle: validated.authorOrHandle,
    estimatedReadMinutes: validated.estimatedReadMinutes,
  };
}
