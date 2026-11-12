import { GoogleGenAI, Type } from '@google/genai';
import type { LibraryItemMeta, PlatformType, UnfurlResult } from '../types/library';
import { GeminiMetaSchema } from '../types/schema';
import { storage } from './storage';

export interface EnrichInput {
  platform: PlatformType;
  url?: string;
  rawShareText?: string;
  quickNote?: string;
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

  // If thumbnail base64 is available (e.g. from unfurler), pass it as multimodal input
  if (input.unfurlData?.thumbnailBase64) {
    parts.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: input.unfurlData.thumbnailBase64,
      },
    });
  }

  const promptText = `
You are the AI Librarian for "Drop Library", an ultra-minimalist personal knowledge vault.
Analyze the provided content and extract strictly structured metadata.

Input details:
- Platform: ${input.platform}
- URL: ${input.url || 'None'}
- Raw Share Text / Title: ${input.rawShareText || 'None'}
- User Quick Note / Intent: ${input.quickNote || 'None'}
- Extracted Page Title: ${input.unfurlData?.title || 'None'}
- Extracted Description / Caption: ${input.unfurlData?.description || 'None'}
- Extracted Author: ${input.unfurlData?.author || 'None'}
- Extracted Content Snippet: ${input.unfurlData?.content ? input.unfurlData.content.slice(0, 1500) : 'None'}

INSTRUCTIONS:
1. Title: A clean, concise, descriptive title (max 70 chars). Strip clickbait punctuation.
2. TLDR: Exactly 1–2 punchy sentences summarizing the core takeaway, insight, or thesis.
3. Category: Choose exactly one of: "reel", "article", "essay", "tool", "quote", "inspo".
   - If platform is Instagram reel or YouTube short, default to "reel" or "inspo".
   - If interactive utility or software repo, use "tool".
   - If philosophical quote or brief excerpt, use "quote".
   - If in-depth read, use "essay" or "article".
4. Tags: 3 to 5 lowercase normalized tags (e.g. ["ai", "prompting", "typescript"]).
5. Search Synonyms: 5 to 8 conceptually related search queries, synonyms, or alternative phrases that someone might search for in the future to find this item even if those exact words are not in the title.
6. AuthorOrHandle: The creator's name, handle, or domain (e.g. "@karpathy", "Paul Graham", "Fireship").
7. EstimatedReadMinutes: Approximate reading/watching duration in minutes (1 for short reels/quotes).
8. If an image thumbnail was provided, transcribe and integrate any hook text, diagrams, or subtitles burned onto the cover image.
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
 * Enriches a library item using Google AI Studio Gemini API with strict structured JSON output.
 */
export async function enrichWithGemini(input: EnrichInput): Promise<LibraryItemMeta> {
  const settings = await storage.getSettings();
  const apiKey = settings.geminiApiKey?.trim();

  if (!apiKey) {
    throw new Error('MISSING_API_KEY: Please configure your Google AI Studio API key in Settings.');
  }

  // Use configured model or fallback
  const modelName = settings.geminiModel || 'gemini-2.5-flash';

  const ai = new GoogleGenAI({ apiKey });
  const contents = buildGeminiContents(input);

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

  const title = unfurl.title || input.rawShareText || input.url || 'Saved Item';
  const tldr = unfurl.description || input.quickNote || (input.url ? `Saved from ${input.url}` : 'No description available');

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
