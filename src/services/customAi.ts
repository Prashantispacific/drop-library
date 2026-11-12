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
 * Resolves standard OpenAI-compatible /chat/completions endpoint.
 */
function resolveChatCompletionsUrl(baseUrl: string): string {
  let clean = baseUrl.trim().replace(/\/+$/, '');
  if (clean.endsWith('/chat/completions')) {
    return clean;
  }
  return `${clean}/chat/completions`;
}

/**
 * Extracts and parses JSON from model output, handling optional markdown code fences.
 */
function extractJson(rawText: string): unknown {
  let clean = rawText.trim();
  const fenceMatch = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    clean = fenceMatch[1].trim();
  }
  return JSON.parse(clean);
}

/**
 * Builds standard system prompt for universal knowledge vault structuring.
 */
function buildSystemPrompt(isTextNote: boolean): string {
  return `You are the AI Librarian for "Drop Library", a personal knowledge vault.
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

CRITICAL: Return ONLY a valid JSON object matching this exact schema:
{
  "title": "string",
  "tldr": "string",
  "category": "reel" | "article" | "essay" | "tool" | "quote" | "inspo",
  "tags": ["tag1", "tag2"],
  "searchSynonyms": ["synonym1", "synonym2"],
  "authorOrHandle": "string (optional)",
  "estimatedReadMinutes": 2 (optional number)
}`;
}

/**
 * Calls any OpenAI-compatible API endpoint (OpenRouter, NVIDIA NIM, Groq, Ollama, Together, etc.)
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
- Raw Content / Note: ${input.rawShareText ? input.rawShareText.slice(0, 3000) : 'None'}
- User Intent Tag: ${input.quickNote || 'None'}
- Page Title: ${input.unfurlData?.title || 'None'}
- Description: ${input.unfurlData?.description || 'None'}
- Author: ${input.unfurlData?.author || 'None'}`;

  // Assemble user message (multimodal if image exists, text-only otherwise)
  let userContent: unknown;
  if (base64Data) {
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

  const requestPayload = {
    model: model || 'meta-llama/llama-3.3-70b-instruct',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0.2,
    response_format: { type: 'json_object' },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestPayload),
      signal: controller.signal,
    });
  } catch (fetchErr: unknown) {
    clearTimeout(timeoutId);
    // If response_format failed (some providers reject it), retry without response_format
    throw new Error(`Failed to connect to Custom API at ${endpoint}: ${(fetchErr as Error)?.message || String(fetchErr)}`);
  }

  // Fallback: If 400 Bad Request mentions response_format, retry once without response_format
  if (response.status === 400) {
    const errorText = await response.text();
    if (errorText.toLowerCase().includes('response_format')) {
      const fallbackPayload = {
        model: requestPayload.model,
        messages: requestPayload.messages,
        temperature: 0.2,
      };
      response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(fallbackPayload),
        signal: controller.signal,
      });
    } else {
      clearTimeout(timeoutId);
      throw new Error(`Custom API returned 400: ${errorText.slice(0, 200)}`);
    }
  }

  clearTimeout(timeoutId);

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`Custom API returned HTTP ${response.status}: ${errBody.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response content received from Custom AI provider');
  }

  let parsedJson: unknown;
  try {
    parsedJson = extractJson(content);
  } catch {
    throw new Error(`Failed to parse Custom AI output as JSON: ${content.slice(0, 100)}`);
  }

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
