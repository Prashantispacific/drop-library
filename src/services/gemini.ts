import { GoogleGenAI, Type } from '@google/genai';
import type { LibraryItemMeta, PlatformType, UnfurlResult } from '../types/library';
import { GeminiMetaSchema } from '../types/schema';
import { storage } from './storage';
import { enrichWithCustomAi } from './customAi';
import { distillTextForLlm } from '../utils/textDistiller';

export interface EnrichInput {
  platform: PlatformType;
  url?: string;
  rawShareText?: string;
  quickNote?: string;
  thumbnailUrl?: string;
  imageBase64?: string;
  unfurlData?: Partial<UnfurlResult>;
}

const DEFAULT_GEMMA_MODEL = 'gemma-3-27b-it';

/**
 * Checks whether the target model is an open-weight Gemma model hosted on Gemini API.
 * Per official ai.google.dev docs, Gemma models do not support responseMimeType/responseSchema
 * or systemInstruction in GenerateContentConfig.
 */
function isGemmaModel(modelName: string): boolean {
  return /^gemma-/i.test(modelName.trim());
}

/**
 * Gemma 3 1B and Gemma 2 are text-only; Gemma 3 (4B/12B/27B) and Gemma 4 support multimodal images.
 */
function isTextOnlyModel(modelName: string): boolean {
  const m = modelName.trim().toLowerCase();
  return m.startsWith('gemma-3-1b') || m.startsWith('gemma-2');
}

/**
 * Robust JSON extractor for Gemma / reasoning models (handles <think> blocks and ```json fences).
 */
function extractJsonFromText(rawText: string): unknown {
  let clean = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  const fenceMatch = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    clean = fenceMatch[1].trim();
  }

  try {
    return JSON.parse(clean);
  } catch {
    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(clean.slice(firstBrace, lastBrace + 1));
    }
    throw new Error(`Failed to parse AI output as JSON: ${clean.slice(0, 150)}`);
  }
}

/**
 * Builds the multimodal content payload for the Gemini / Gemma SDK.
 * Uses token-efficient local distillation for long PDFs/documents.
 */
function buildGeminiContents(
  input: EnrichInput,
  options: { includeJsonPrompt: boolean; allowImage: boolean }
) {
  const parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  > = [];

  // 1. Pass image inlineData if available and model supports vision
  if (options.allowImage) {
    let base64Data: string | undefined = input.imageBase64 || input.unfurlData?.thumbnailBase64;
    let mimeType = 'image/jpeg';

    if (!base64Data && input.thumbnailUrl?.startsWith('data:')) {
      const match = input.thumbnailUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      }
    }

    if (base64Data) {
      parts.push({
        inlineData: {
          mimeType,
          data: base64Data,
        },
      });
    }
  }

  const isTextNote = input.platform === 'text';
  const isImage = input.platform === 'image';
  const distilled = input.rawShareText ? distillTextForLlm(input.rawShareText, 4500) : null;

  const jsonContractSuffix = options.includeJsonPrompt
    ? `\n\nCRITICAL OUTPUT FORMAT:
Return ONLY a single valid JSON object (no markdown commentary outside JSON) matching this exact schema:
{
  "title": "string (max 70 chars)",
  "tldr": "string (1-2 punchy sentences)",
  "category": "reel" | "article" | "essay" | "tool" | "quote" | "inspo",
  "tags": ["tag1", "tag2", "tag3"],
  "searchSynonyms": ["synonym1", "synonym2", "synonym3", "synonym4", "synonym5"],
  "authorOrHandle": "string (optional)",
  "estimatedReadMinutes": ${distilled?.estimatedReadMinutes ?? 2}
}`
    : '';

  const promptText = `
You are the AI Librarian for "Drop Library", an ultra-minimalist personal knowledge vault.
Analyze the provided content and extract strictly structured metadata.

Input details:
- Platform: ${input.platform}
- URL: ${input.url || 'None'}
- Raw Note / Document Content: ${distilled ? distilled.distilledText : 'None'}
- User Intent Tag: ${input.quickNote || 'None'}
- Extracted Page Title: ${input.unfurlData?.title || 'None'}
- Extracted Description / Caption: ${input.unfurlData?.description || 'None'}
- Extracted Author: ${input.unfurlData?.author || 'None'}

INSTRUCTIONS FOR METADATA EXTRACTION:
${
  isTextNote
    ? `The content is a personal note, document, PDF, code snippet, or Markdown file created or saved by the user. Do NOT invent a fake narrative.
1. Title: Use the first heading (# Title), document title, or first line/phrase (max 70 chars).
2. TLDR: Exactly 1–2 crisp sentences capturing what the note or document covers.
3. Category: Choose "quote", "essay", "inspo", "tool", or "article".
4. Tags: 3 to 5 lowercase normalized tags categorizing this note/document (e.g. ["ideas", "markdown", "architecture"]).
5. Search Synonyms: 5 to 8 conceptual synonyms and search terms that will help find this item in fuzzy search.`
    : isImage
    ? `The content is an image or screenshot uploaded by the user.
1. Title: A concise, descriptive title describing what is depicted or shown in the image (max 70 chars).
2. TLDR: 1–2 punchy sentences describing the core visual elements, OCR text, diagrams, or context in the screenshot.
3. Category: Choose "inspo", "tool", "quote", or "article".
4. Tags: 3 to 5 lowercase tags describing the visual topic, tools, or ideas shown.
5. Search Synonyms: 5 to 8 related search terms and queries someone would type to find this screenshot.`
    : `1. Title: A clean, concise, descriptive title (max 70 chars). Strip clickbait punctuation.
2. TLDR: Exactly 1–2 punchy sentences summarizing the core takeaway, insight, or thesis.
3. Category: Choose exactly one of: "reel", "article", "essay", "tool", "quote", "inspo".
   - If platform is Instagram reel or YouTube short, default to "reel" or "inspo".
   - If interactive utility or software repo, use "tool".
   - If philosophical quote or brief excerpt, use "quote".
   - If in-depth read, use "essay" or "article".
4. Tags: 3 to 5 lowercase normalized tags (e.g. ["ai", "prompting", "typescript"]).
5. Search Synonyms: 5 to 8 conceptually related search queries, synonyms, or alternative phrases.
6. AuthorOrHandle: The creator's name, handle, or domain (e.g. "@karpathy", "Paul Graham", "Fireship").
7. EstimatedReadMinutes: Approximate reading/watching duration in minutes.
8. If an image thumbnail was provided, transcribe and integrate any hook text, diagrams, or subtitles burned onto the cover image.`
}${jsonContractSuffix}
`;

  parts.push({ text: promptText });
  return parts;
}

/**
 * Strict JSON Schema for Gemini structured output.
 */
const GEMINI_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: 'Clean, descriptive title without clickbait punctuation',
    },
    tldr: {
      type: Type.STRING,
      description: '1-2 punchy sentences capturing the core takeaway',
    },
    category: {
      type: Type.STRING,
      enum: ['reel', 'article', 'essay', 'tool', 'quote', 'inspo'],
      description: 'Content category',
    },
    tags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '3 to 5 lowercase tags',
    },
    searchSynonyms: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '5 to 8 conceptual search synonyms and queries',
    },
    authorOrHandle: {
      type: Type.STRING,
      description: 'Author name, social handle, or domain',
    },
    estimatedReadMinutes: {
      type: Type.INTEGER,
      description: 'Estimated minutes to read or watch',
    },
  },
  required: ['title', 'tldr', 'category', 'tags', 'searchSynonyms'],
};

/**
 * Strips trailing slashes from custom API URL.
 */
function cleanBaseUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/\/+$/, '');
}

/**
 * Executes a structured content generation call with GoogleGenAI SDK.
 * Automatically adapts config for Gemma models (which disallow responseMimeType/responseSchema).
 */
async function callGemini(
  apiKey: string,
  modelName: string,
  input: EnrichInput,
  baseUrl?: string
): Promise<string> {
  const httpOptions: { apiVersion: string; baseUrl?: string } = {
    apiVersion: 'v1beta',
  };
  const cleanedUrl = cleanBaseUrl(baseUrl);
  if (cleanedUrl) {
    httpOptions.baseUrl = cleanedUrl;
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions,
  });

  const gemma = isGemmaModel(modelName);
  const contents = buildGeminiContents(input, {
    includeJsonPrompt: gemma,
    allowImage: !isTextOnlyModel(modelName),
  });

  const config = gemma
    ? {
        temperature: 0.2,
      }
    : {
        responseMimeType: 'application/json',
        responseSchema: GEMINI_RESPONSE_SCHEMA,
        temperature: 0.2,
      };

  const response = await ai.models.generateContent({
    model: modelName,
    contents,
    config,
  });

  const responseText = response.text;
  if (!responseText) {
    throw new Error('Empty response received from AI model');
  }
  return responseText;
}

/**
 * Enriches a library item using either Google Gemini or Custom OpenAI-compatible AI
 * (OpenRouter, NVIDIA NIM, Groq, Ollama, Llama), featuring automatic cross-provider fallback.
 */
export async function enrichWithGemini(input: EnrichInput): Promise<LibraryItemMeta> {
  const settings = await storage.getSettings();
  const activeProvider = settings.aiProvider || 'gemini';
  const hasGeminiKey = Boolean(settings.geminiApiKey?.trim());
  const hasCustomConfig = Boolean(settings.customApiUrl?.trim());

  if (!hasGeminiKey && !hasCustomConfig) {
    throw new Error(
      'MISSING_API_KEY: Please configure your Gemini API key or Custom API Provider in Settings.'
    );
  }

  // Pipeline 1: Google Gemini / Gemma (with custom proxy & resilient model fallbacks)
  const executeGeminiPipeline = async (): Promise<LibraryItemMeta> => {
    const apiKey = settings.geminiApiKey?.trim();
    if (!apiKey) throw new Error('MISSING_GEMINI_KEY');

    const primaryModel = settings.geminiModel || DEFAULT_GEMMA_MODEL;
    const customBaseUrl = settings.geminiBaseUrl?.trim();

    let responseText: string | undefined;

    try {
      responseText = await callGemini(apiKey, primaryModel, input, customBaseUrl);
    } catch (primaryErr: unknown) {
      console.warn(
        `[Gemini] Primary request failed (model: ${primaryModel}, url: ${customBaseUrl || 'default'}):`,
        primaryErr
      );

      // Retry 1: Official endpoint fallback if custom URL failed
      if (customBaseUrl) {
        console.info(`[Gemini] Custom proxy failed. Falling back to official Google AI Studio endpoint...`);
        try {
          responseText = await callGemini(apiKey, primaryModel, input, undefined);
        } catch (officialErr) {
          console.warn(`[Gemini] Official endpoint also failed:`, officialErr);
        }
      }

      // Retry 2: Resilient model fallback (try gemma-3-12b-it, then gemini-3.5-flash-lite)
      const fallbackCandidates = [DEFAULT_GEMMA_MODEL, 'gemma-3-12b-it', 'gemini-3.5-flash-lite'].filter(
        (m) => m !== primaryModel
      );
      for (const fallbackModel of fallbackCandidates) {
        if (responseText) break;
        console.info(`[Gemini] Attempting fallback model: ${fallbackModel}...`);
        try {
          responseText = await callGemini(apiKey, fallbackModel, input, customBaseUrl);
        } catch {
          if (customBaseUrl) {
            try {
              responseText = await callGemini(apiKey, fallbackModel, input, undefined);
            } catch {
              // Ignore
            }
          }
        }
      }

      if (!responseText) throw primaryErr;
    }

    const parsedJson = extractJsonFromText(responseText);
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
  };

  // Pipeline 2: Custom OpenAI-compatible Provider (OpenRouter, NVIDIA NIM, Groq, Ollama, Llama)
  const executeCustomPipeline = async (): Promise<LibraryItemMeta> => {
    return enrichWithCustomAi(input, {
      apiUrl: settings.customApiUrl,
      apiKey: settings.customApiKey,
      model: settings.customModel || 'meta-llama/llama-3.3-70b-instruct',
    });
  };

  // Branch A: User set Custom Provider as primary
  if (activeProvider === 'custom') {
    if (hasCustomConfig) {
      try {
        return await executeCustomPipeline();
      } catch (customErr) {
        console.warn(`[AI Engine] Custom AI provider failed:`, customErr);
        if (hasGeminiKey) {
          console.info(`[AI Engine] Automatically falling back to Google Gemini...`);
          try {
            return await executeGeminiPipeline();
          } catch (geminiErr) {
            console.warn(`[AI Engine] Fallback to Gemini also failed:`, geminiErr);
          }
        }
        throw customErr;
      }
    } else if (hasGeminiKey) {
      return await executeGeminiPipeline();
    }
  }

  // Branch B: Default Google Gemini as primary
  if (hasGeminiKey) {
    try {
      return await executeGeminiPipeline();
    } catch (geminiErr) {
      console.warn(`[AI Engine] Google Gemini failed:`, geminiErr);
      if (hasCustomConfig) {
        console.info(
          `[AI Engine] Automatically falling back to Custom Provider (${settings.customModel || settings.customApiUrl})...`
        );
        try {
          return await executeCustomPipeline();
        } catch (customErr) {
          console.warn(`[AI Engine] Fallback to Custom Provider also failed:`, customErr);
        }
      }
      throw geminiErr;
    }
  }

  // Branch C: Only custom provider is configured
  if (hasCustomConfig) {
    return await executeCustomPipeline();
  }

  throw new Error('MISSING_API_KEY: Please configure an AI provider in Settings.');
}

/**
 * Creates heuristic fallback metadata when offline or when no Gemini API key is configured.
 */
export function createFallbackMeta(input: EnrichInput): LibraryItemMeta {
  const unfurl = input.unfurlData || {};
  let category: LibraryItemMeta['category'] = 'web' as unknown as LibraryItemMeta['category'];

  if (input.platform === 'instagram' || input.platform === 'youtube') {
    category = 'reel';
  } else if (input.platform === 'image') {
    category = 'inspo';
  } else if (input.platform === 'text') {
    category = 'quote';
  } else {
    category = 'article';
  }

  let title: string;
  let tldr: string;

  if (input.platform === 'text') {
    const firstLine = (input.rawShareText || '').trim().split('\n')[0].replace(/^#+\s*/, '');
    title = firstLine.slice(0, 70) || 'Personal Note';
    tldr = (input.rawShareText || '').slice(0, 150) || 'User note saved to library';
  } else if (input.platform === 'image') {
    title = input.rawShareText || 'Saved Image';
    tldr = input.quickNote || 'Screenshot / Image stored in library';
  } else {
    title = unfurl.title || input.rawShareText || input.url || 'Saved Item';
    tldr = unfurl.description || input.quickNote || (input.url ? `Saved from ${input.url}` : 'No description available');
  }

  const tags: string[] = [input.platform];
  if (input.quickNote) {
    tags.push(input.quickNote.toLowerCase().replace(/^#/, ''));
  }

  return {
    title: title.slice(0, 100),
    tldr: tldr.slice(0, 300),
    category,
    tags,
    searchSynonyms: [title.toLowerCase()],
    authorOrHandle: unfurl.author,
    estimatedReadMinutes: 1,
  };
}
