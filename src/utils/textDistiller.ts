export interface DistilledTextResult {
  distilledText: string;
  originalChars: number;
  wordCount: number;
  estimatedReadMinutes: number;
  wasDistilled: boolean;
}

/**
 * Cleans boilerplate whitespace, repeated page markers, and control characters
 * from extracted PDF or document text.
 */
export function cleanExtractedText(raw: string): string {
  // Strip non-printable ASCII control chars except \n (10), \r (13), \t (9)
  let sanitized = '';
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code >= 32 || code === 9 || code === 10 || code === 13) {
      sanitized += raw[i];
    }
  }
  return sanitized
    .replace(/\r\n/g, '\n')
    .replace(/^\s*(?:page\s+\d+(?:\s+of\s+\d+)?|\d{1,4})\s*$/gim, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extracts likely section headings or structural lines from long text.
 */
function extractHeadings(text: string, maxChars: number): string {
  const lines = text.split('\n');
  const headings: string[] = [];
  let total = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.length < 4 || line.length > 90) continue;

    const isMarkdownHeading = /^#{1,4}\s+\S/.test(line);
    const isNumberedSection = /^(?:\d+\.){1,3}\s+[A-Z]/.test(line);
    const isAllCapsHeader =
      line.length >= 6 &&
      line.length <= 60 &&
      /^[A-Z0-9\s\-:&/]+$/.test(line) &&
      /[A-Z]{3,}/.test(line);

    if (isMarkdownHeading || isNumberedSection || isAllCapsHeader) {
      if (total + line.length + 1 > maxChars) break;
      headings.push(line);
      total += line.length + 1;
    }
  }

  return headings.join('\n');
}

/**
 * Samples representative high-signal sentences from the middle of a long document.
 */
function sampleMiddleSentences(middleText: string, maxChars: number): string {
  if (!middleText || maxChars <= 0) return '';
  const sentences = middleText
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 45 && s.length <= 280);

  if (sentences.length === 0) {
    return middleText.slice(0, maxChars).trim();
  }

  const targetCount = Math.min(sentences.length, 8);
  const step = Math.max(1, Math.floor(sentences.length / targetCount));
  const picked: string[] = [];
  let total = 0;

  for (let i = 0; i < sentences.length && picked.length < targetCount; i += step) {
    const s = sentences[i];
    if (total + s.length + 2 > maxChars) break;
    picked.push(s);
    total += s.length + 2;
  }

  return picked.join(' ');
}

/**
 * Compresses long documents/PDFs into a strict token-budgeted digest (~1,100 tokens max)
 * using Head + Outline/Headings + Middle Key-Sentence Sampling + Tail.
 * Prevents massive token spend when enriching long files with Gemma or Gemini.
 */
export function distillTextForLlm(
  rawText: string,
  maxChars: number = 4500
): DistilledTextResult {
  const cleaned = cleanExtractedText(rawText || '');
  const originalChars = cleaned.length;
  const words = cleaned ? cleaned.split(/\s+/).filter(Boolean) : [];
  const wordCount = words.length;
  const estimatedReadMinutes = Math.max(1, Math.round(wordCount / 220));

  if (originalChars <= maxChars) {
    return {
      distilledText: cleaned,
      originalChars,
      wordCount,
      estimatedReadMinutes,
      wasDistilled: false,
    };
  }

  const headBudget = Math.floor(maxChars * 0.4); // ~1800 chars
  const outlineBudget = Math.floor(maxChars * 0.2); // ~900 chars
  const middleBudget = Math.floor(maxChars * 0.2); // ~900 chars
  const tailBudget = Math.floor(maxChars * 0.2); // ~900 chars

  const head = cleaned.slice(0, headBudget).trim();
  const tail = cleaned.slice(Math.max(headBudget, originalChars - tailBudget)).trim();
  const middleSlice = cleaned.slice(
    headBudget,
    Math.max(headBudget, originalChars - tailBudget)
  );

  const outline = extractHeadings(cleaned, outlineBudget);
  const middleSamples = sampleMiddleSentences(middleSlice, middleBudget);

  const sections: string[] = [
    `[DOCUMENT DIGEST — ${wordCount.toLocaleString()} words, ~${estimatedReadMinutes} min read. Distilled locally to save tokens]`,
    `--- OPENING ---\n${head}`,
  ];

  if (outline) {
    sections.push(`--- OUTLINE / SECTIONS ---\n${outline}`);
  }
  if (middleSamples) {
    sections.push(`--- KEY EXCERPTS ---\n${middleSamples}`);
  }
  sections.push(`--- CONCLUSION / END ---\n${tail}`);

  const distilledText = sections.join('\n\n').slice(0, maxChars + 300);

  return {
    distilledText,
    originalChars,
    wordCount,
    estimatedReadMinutes,
    wasDistilled: true,
  };
}
