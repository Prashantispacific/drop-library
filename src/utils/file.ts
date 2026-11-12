import { Filesystem } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

/**
 * Reads an Android / iOS local cached file URI into a base64 Data URL.
 */
export async function readSharedFileAsBase64(
  fileUri: string,
  mimeType: string = 'image/jpeg'
): Promise<string | undefined> {
  if (!fileUri) return undefined;

  // 1. If already a data URL or blob URL
  if (fileUri.startsWith('data:') || fileUri.startsWith('blob:')) {
    return fileUri;
  }

  // 2. Native Capacitor Android / iOS
  if (Capacitor.isNativePlatform()) {
    try {
      const result = await Filesystem.readFile({
        path: fileUri,
      });

      const base64Data = typeof result.data === 'string' ? result.data : '';
      if (base64Data) {
        const cleanMime = mimeType || 'image/jpeg';
        return `data:${cleanMime};base64,${base64Data}`;
      }
    } catch (err) {
      console.warn('[readSharedFileAsBase64] Filesystem.readFile error, falling back:', err);
      try {
        const webSrc = Capacitor.convertFileSrc(fileUri);
        const res = await fetch(webSrc);
        const blob = await res.blob();
        return await fileToDataUrl(blob);
      } catch (e2) {
        console.error('[readSharedFileAsBase64] fetch converted file failed:', e2);
      }
    }
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
