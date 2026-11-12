import type { UnfurlResult } from '../types/library';
import { storage } from './storage';

/**
 * Resolves the unfurl endpoint taking into account:
 * 1. User configured override in Settings
 * 2. Vite environment variable: VITE_UNFURL_ENDPOINT
 * 3. Relative Netlify function path fallback: /.netlify/functions/unfurl
 */
export async function getUnfurlEndpoint(): Promise<string> {
  const settings = await storage.getSettings();
  if (settings.unfurlEndpoint?.trim()) {
    return settings.unfurlEndpoint.trim();
  }

  const envEndpoint = import.meta.env.VITE_UNFURL_ENDPOINT;
  if (envEndpoint && envEndpoint.trim()) {
    return envEndpoint.trim();
  }

  return '/.netlify/functions/unfurl';
}

/**
 * Fetches unfurled metadata for a target URL.
 */
export async function fetchUnfurl(targetUrl: string): Promise<UnfurlResult> {
  const endpoint = await getUnfurlEndpoint();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: targetUrl }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`Unfurl server returned HTTP ${res.status}: ${res.statusText}`);
    }

    const data = (await res.json()) as UnfurlResult;
    return data;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unfurl request failed';
    return {
      success: false,
      url: targetUrl,
      error: message,
    };
  }
}
