import { Filesystem } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import * as pdfjsLib from 'pdfjs-dist';
import { cleanExtractedText } from './textDistiller';

// Configure PDF.js worker for offline/Android WebView & Vite bundling
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

const MAX_STORED_TEXT_CHARS = 450_000; // ~450 KB cap to keep IndexedDB fast on mobile
const MAX_PDF_PAGES = 120; // Safety cap for huge PDFs on mobile WebView

export interface ParsedDocumentFile {
  text: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  pageCount?: number;
  wordCount: number;
  isMarkdown: boolean;
}

/**
 * Formats byte size into a compact human-readable label.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Downscales and compresses an image Data URL using an offscreen canvas
 * to prevent Android WebView OOM crashes and IndexedDB bloat.
 */
export function compressImageDataUrl(
  dataUrl: string,
  maxDimension: number = 1280,
  quality: number = 0.82
): Promise<string> {
  return new Promise((resolve) => {
    if (!dataUrl.startsWith('data:image/')) {
      resolve(dataUrl);
      return;
    }

    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        if (width <= maxDimension && height <= maxDimension && dataUrl.length < 350_000) {
          resolve(dataUrl);
          return;
        }

        if (width > height && width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', quality);
        resolve(compressed.length < dataUrl.length ? compressed : dataUrl);
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Extracts text locally from a PDF ArrayBuffer using pdfjs-dist.
 * Never sends raw PDF binaries to the LLM, saving 90%+ tokens.
 */
export async function extractTextFromPdfBuffer(
  buffer: ArrayBuffer
): Promise<{ text: string; pageCount: number }> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;
  const pagesToRead = Math.min(totalPages, MAX_PDF_PAGES);
  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= pagesToRead; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const strings = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .filter(Boolean);
    const pageStr = strings.join(' ').trim();
    if (pageStr) {
      pageTexts.push(pageStr);
    }
  }

  let combined = cleanExtractedText(pageTexts.join('\n\n'));
  if (totalPages > MAX_PDF_PAGES) {
    combined += `\n\n[Truncated after ${MAX_PDF_PAGES} of ${totalPages} pages to preserve device memory]`;
  }
  if (combined.length > MAX_STORED_TEXT_CHARS) {
    combined =
      combined.slice(0, MAX_STORED_TEXT_CHARS) +
      '\n\n[Content truncated at 450 KB for local storage performance]';
  }

  return { text: combined, pageCount: totalPages };
}

/**
 * Reads a user-selected document file (PDF, Markdown, TXT, JSON, CSV, Code, etc.)
 * locally into clean text + metadata.
 */
export async function readFileWithMetadata(file: File): Promise<ParsedDocumentFile> {
  const fileName = file.name || 'document';
  const lower = fileName.toLowerCase();
  const isPdf = file.type === 'application/pdf' || lower.endsWith('.pdf');
  const isMarkdown = lower.endsWith('.md') || lower.endsWith('.markdown') || file.type === 'text/markdown';

  if (isPdf) {
    const buffer = await file.arrayBuffer();
    const { text, pageCount } = await extractTextFromPdfBuffer(buffer);
    const finalText =
      text || `[PDF "${fileName}" (${pageCount} pages) contains no selectable text — it may be scanned images.]`;
    const wordCount = finalText.split(/\s+/).filter(Boolean).length;

    return {
      text: finalText,
      fileName,
      mimeType: 'application/pdf',
      fileSize: file.size,
      pageCount,
      wordCount,
      isMarkdown: false,
    };
  }

  let rawText = await fileToText(file);
  rawText = cleanExtractedText(rawText);
  if (rawText.length > MAX_STORED_TEXT_CHARS) {
    rawText =
      rawText.slice(0, MAX_STORED_TEXT_CHARS) +
      '\n\n[Content truncated at 450 KB for local storage performance]';
  }
  const wordCount = rawText ? rawText.split(/\s+/).filter(Boolean).length : 0;

  return {
    text: rawText,
    fileName,
    mimeType: file.type || 'text/plain',
    fileSize: file.size,
    wordCount,
    isMarkdown,
  };
}

/**
 * Reads an Android / iOS local cached file URI into a compressed base64 Data URL (for images).
 */
export async function readSharedFileAsBase64(
  fileUri: string,
  mimeType: string = 'image/jpeg'
): Promise<string | undefined> {
  if (!fileUri) return undefined;

  if (fileUri.startsWith('data:') || fileUri.startsWith('blob:')) {
    return mimeType.startsWith('image/') ? compressImageDataUrl(fileUri) : fileUri;
  }

  if (Capacitor.isNativePlatform()) {
    try {
      const result = await Filesystem.readFile({
        path: fileUri,
      });

      const base64Data = typeof result.data === 'string' ? result.data : '';
      if (base64Data) {
        const cleanMime = mimeType || 'image/jpeg';
        const dataUrl = `data:${cleanMime};base64,${base64Data}`;
        return cleanMime.startsWith('image/') ? compressImageDataUrl(dataUrl) : dataUrl;
      }
    } catch (err) {
      console.warn('[readSharedFileAsBase64] Filesystem.readFile error, falling back:', err);
      try {
        const webSrc = Capacitor.convertFileSrc(fileUri);
        const res = await fetch(webSrc);
        const blob = await res.blob();
        const dataUrl = await fileToDataUrl(blob);
        return mimeType.startsWith('image/') ? compressImageDataUrl(dataUrl) : dataUrl;
      } catch (e2) {
        console.error('[readSharedFileAsBase64] fetch converted file failed:', e2);
      }
    }
  }

  return undefined;
}

/**
 * Reads a shared native document URI (PDF or text) into an ArrayBuffer.
 */
export async function readSharedFileAsBuffer(fileUri: string): Promise<ArrayBuffer | undefined> {
  if (!fileUri || !Capacitor.isNativePlatform()) return undefined;
  try {
    const webSrc = Capacitor.convertFileSrc(fileUri);
    const res = await fetch(webSrc);
    if (res.ok) {
      return await res.arrayBuffer();
    }
  } catch (err) {
    console.warn('[readSharedFileAsBuffer] convertFileSrc fetch failed:', err);
  }

  try {
    const result = await Filesystem.readFile({ path: fileUri });
    if (typeof result.data === 'string') {
      const binary = atob(result.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    }
  } catch (err) {
    console.error('[readSharedFileAsBuffer] Filesystem.readFile failed:', err);
  }
  return undefined;
}

/**
 * Converts a browser File or Blob into a base64 Data URL.
 */
export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Reads a text or markdown file as plain string.
 */
export function fileToText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
