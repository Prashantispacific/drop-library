import { GoogleGenAI, Type } from '@google/genai';
import type { LibraryItemMeta, PlatformType, UnfurlResult } from '../types/library';
import { GeminiMetaSchema } from '../types/schema';
import { storage } from './storage';

export interface EnrichInput {
  platform: PlatformType;
  url?: string;
  rawShareText?: string;
  quickNote?: string;
  thumbnailUrl?: string;
  imageBase64?: string;
  unfurlData?: Partial<UnfurlResult>;
}

/**
 * Builds the multimodal content payload for the Gemini SDK.
 * Includes thumbnail base64 as inlineData if available to read on-screen hook text.
 */
function buildGeminiContents(input: EnrichInput) {
  const parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  > = [];

  // 1. Pass image inlineData if available (from unfurl thumbnail, imageBase64, or data: URL)
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

  const isTextNote = input.platform === 'text';
  const isImage = input.platform === 'image';

  const promptText = `
You are the AI Librarian for "Drop Library", an ultra-minimalist personal knowledge vault.
Analyze the provided content and extract strictly structured metadata.

Input details:
- Platform: ${input.platform}
- URL: ${input.url || 'None'}
- Raw Note / Text Content: ${input.rawShareText ? input.rawShareText.slice(0, 3000) : 'None'}
- User Intent Tag: ${input.quickNote || 'None'}
- Extracted Page Title: ${input.unfurlData?.title || 'None'}
- Extracted Description / Caption: ${input.unfurlData?.description || 'None'}
- Extracted Author: ${input.unfurlData?.author || 'None'}

INSTRUCTIONS FOR METADATA EXTRACTION:
${
  isTextNote
    ? `The content is a personal note, code snippet, or Markdown document created by the user. Do NOT invent a fake narrative.
1. Title: Use the first heading (# Title) or the first line/phrase of the note (max 70 chars).
2. TLDR: Exactly 1–2 crisp sentences capturing what the note or quote covers. (The user's original note text is kept in full separately).
3. Category: Choose "quote", "essay", "inspo", or "tool".
4. Tags: 3 to 5 lowercase normalized tags categorizing this note (e.g. ["ideas", "markdown", "architecture"]).
5. Search Synonyms: 5 to 8 conceptual synonyms and search terms that will help find this note in fuzzy search.`
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
}
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
 */
async function callGemini(
  apiKey: string,
  modelName: string,
  contents: ReturnType<typeof buildGeminiContents>,
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

  const response = await ai.models.generateContent({
    model: modelName,
    contents,
    config: {
      responseMimeType: 'application/json',
      responseSchema: GEMINI_RESPONSE_SCHEMA,
      temperature: 0.2, // Low temperature for consistent, factual structuring
    },
  });

  const responseText = response.text;
  if (!responseText) {
    throw new Error('Empty response received from Gemini');
  }
  return responseText;
}

/**
 * Enriches a library item using Google AI Studio Gemini API with strict structured JSON output.
 * Supports custom base URLs (proxies, Cloudflare AI Gateway, LiteLLM) and automatic fallback.
 */
export async function enrichWithGemini(input: EnrichInput): Promise<LibraryItemMeta> {
  const settings = await storage.getSettings();
  const apiKey = settings.geminiApiKey?.trim();

  if (!apiKey) {
    throw new Error('MISSING_API_KEY: Please configure your Google AI Studio API key in Settings.');
  }

  // Use configured model and optional custom URL
  const primaryModel = settings.geminiModel || 'gemini-2.5-flash';
  const customBaseUrl = settings.geminiBaseUrl?.trim();
  const contents = buildGeminiContents(input);

  let responseText: string | undefined;

  // 1. Primary Attempt (custom proxy/URL if set, otherwise official Google endpoint)
  try {
    responseText = await callGemini(apiKey, primaryModel, contents, customBaseUrl);
  } catch (primaryErr: unknown) {
    console.warn(
      `[Gemini] Primary request failed (model: ${primaryModel}, url: ${customBaseUrl || 'default'}):`,
      primaryErr
    );

    // Fallback 1: If custom URL was configured and failed (e.g. gateway down, proxy error),
    // automatically fall back to the official Google AI Studio endpoint
    if (customBaseUrl) {
      console.info(
        `[Gemini] Custom API URL failed. Automatically falling back to official Google AI Studio endpoint...`
      );
      try {
        responseText = await callGemini(apiKey, primaryModel, contents, undefined);
      } catch (officialErr) {
        console.warn(`[Gemini] Fallback to official endpoint also failed:`, officialErr);
      }
    }

    // Fallback 2: If primary model failed (quota / rate limit 429 / 503) and model is not 'gemini-2.0-flash',
    // attempt resilient fallback to stable 'gemini-2.0-flash'
    if (!responseText && primaryModel !== 'gemini-2.0-flash') {
      const fallbackModel = 'gemini-2.0-flash';
      console.info(`[Gemini] Attempting fallback model: ${fallbackModel}...`);
      try {
        responseText = await callGemini(apiKey, fallbackModel, contents, customBaseUrl);
      } catch {
        if (customBaseUrl) {
          try {
            responseText = await callGemini(apiKey, fallbackModel, contents, undefined);
          } catch {
            // Keep original error
          }
        }
      }
    }

    // If all attempts failed, throw the primary error so queueWorker can create heuristic fallback
    if (!responseText) {
      throw primaryErr;
    }
  }

  // Parse and validate with runtime Zod schema
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(responseText);
  } catch {
    throw new Error(`Failed to parse Gemini output as JSON: ${responseText.slice(0, 100)}`);
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
