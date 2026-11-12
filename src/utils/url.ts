import type { PlatformType } from '../types/library';

// Tracking parameter blocklist for aggressive URL cleanup
const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'igsh',
  'igshid',
  'vrfl',
  'fbclid',
  'gclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  '_hsenc',
  '_hsmi',
  'ref',
  'ref_src',
  'si', // YouTube share token
  'feature', // YouTube share feature
]);

const URL_REGEX = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/i;

/**
 * Extracts the first valid HTTP/HTTPS URL from arbitrary shared text.
 */
export function extractUrlFromText(text: string): { url?: string; remainingText?: string } {
  if (!text) return {};
  const match = text.match(URL_REGEX);
  if (!match) return { remainingText: text.trim() };

  const rawUrl = match[0].trim();
  const remainingText = text.replace(rawUrl, '').trim();
  return { url: rawUrl, remainingText: remainingText || undefined };
}

/**
 * Normalizes URLs by removing tracking parameters, canonicalizing shortlinks,
 * and stripping superfluous trailing slashes or anchor hashes where appropriate.
 */
export function normalizeUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  let urlStr = rawUrl.trim();

  // If missing protocol, prepend https://
  if (!/^https?:\/\//i.test(urlStr)) {
    urlStr = 'https://' + urlStr;
  }

  try {
    const parsed = new URL(urlStr);

    // Normalize hostname: lowercase, remove leading www. for uniform matching
    const host = parsed.hostname.toLowerCase();

    // 1. YouTube canonicalization
    if (host.includes('youtu.be')) {
      const videoId = parsed.pathname.replace(/^\//, '').split('/')[0];
      if (videoId) {
        const timeParam = parsed.searchParams.get('t');
        const canonical = new URL('https://www.youtube.com/watch');
        canonical.searchParams.set('v', videoId);
        if (timeParam) canonical.searchParams.set('t', timeParam);
        return canonical.toString();
      }
    }

    if (host.includes('youtube.com')) {
      // If shorts: /shorts/ID -> /watch?v=ID
      if (parsed.pathname.startsWith('/shorts/')) {
        const videoId = parsed.pathname.replace('/shorts/', '').split('/')[0];
        if (videoId) {
          const canonical = new URL('https://www.youtube.com/watch');
          canonical.searchParams.set('v', videoId);
          return canonical.toString();
        }
      }

      // If watch url, strip all params except 'v' and 't'
      if (parsed.pathname === '/watch') {
        const v = parsed.searchParams.get('v');
        const t = parsed.searchParams.get('t');
        const canonical = new URL('https://www.youtube.com/watch');
        if (v) canonical.searchParams.set('v', v);
        if (t) canonical.searchParams.set('t', t);
        return canonical.toString();
      }
    }

    // 2. Instagram canonicalization
    if (host.includes('instagram.com')) {
      // Keep only /p/SHORTCODE, /reel/SHORTCODE, /reels/SHORTCODE, /tv/SHORTCODE
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      if (pathParts.length >= 2 && ['p', 'reel', 'reels', 'tv'].includes(pathParts[0])) {
        const type = pathParts[0] === 'reels' ? 'reel' : pathParts[0];
        const shortcode = pathParts[1];
        return `https://www.instagram.com/${type}/${shortcode}/`;
      }
    }

    // 3. General tracking parameter removal
    const keysToDelete: string[] = [];
    parsed.searchParams.forEach((_, key) => {
      const lowerKey = key.toLowerCase();
      if (
        TRACKING_PARAMS.has(lowerKey) ||
        lowerKey.startsWith('utm_') ||
        lowerKey.startsWith('ig_')
      ) {
        keysToDelete.push(key);
      }
    });

    for (const key of keysToDelete) {
      parsed.searchParams.delete(key);
    }

    // Remove empty hash
    if (parsed.hash === '#') {
      parsed.hash = '';
    }

    return parsed.toString();
  } catch {
    // If URL parsing fails, return original trimmed string
    return rawUrl.trim();
  }
}

/**
 * Detects the platform type from raw text, file URI, or URL.
 */
export function detectPlatform(input: {
  url?: string;
  rawText?: string;
  fileMimeType?: string;
}): PlatformType {
  const { url, rawText, fileMimeType } = input;

  if (fileMimeType && fileMimeType.startsWith('image/')) {
    return 'image';
  }

  const targetUrl = url || (rawText ? extractUrlFromText(rawText).url : undefined);

  if (!targetUrl) {
    return 'text';
  }

  try {
    const parsed = new URL(targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`);
    const host = parsed.hostname.toLowerCase();

    if (host.includes('instagram.com') || host.includes('instagr.am')) {
      return 'instagram';
    }
    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      return 'youtube';
    }
    return 'web';
  } catch {
    return 'text';
  }
}

/**
 * Extracts Instagram shortcode from normalized or raw URL.
 */
export function getInstagramShortcode(url: string): string | null {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && ['p', 'reel', 'reels', 'tv'].includes(parts[0])) {
      return parts[1];
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Extracts YouTube video ID from URL.
 */
export function getYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.replace(/^\//, '').split('/')[0] || null;
    }
    if (parsed.searchParams.has('v')) {
      return parsed.searchParams.get('v');
    }
    if (parsed.pathname.startsWith('/shorts/')) {
      return parsed.pathname.replace('/shorts/', '').split('/')[0] || null;
    }
  } catch {
    // fall through
  }
  return null;
}
