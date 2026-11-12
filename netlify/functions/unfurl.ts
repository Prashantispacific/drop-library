import ogs from 'open-graph-scraper';
import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';

const CRAWLER_USER_AGENT =
  'facebookexternalhit/1.1 (+https://www.facebook.com/externalhit_uatext.php); Facebot; Twitterbot/1.0; WhatsApp/2.24.0';

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

// URL tracking params to strip
const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'igsh',
  'igshid',
  'vrfl',
  'fbclid',
  'gclid',
  'si',
  'feature',
];

function cleanUrl(rawUrl: string): string {
  try {
    let clean = rawUrl.trim();
    if (!/^https?:\/\//i.test(clean)) clean = 'https://' + clean;
    const parsed = new URL(clean);

    // Instagram normalization
    if (parsed.hostname.includes('instagram.com')) {
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length >= 2 && ['p', 'reel', 'reels', 'tv'].includes(parts[0])) {
        const type = parts[0] === 'reels' ? 'reel' : parts[0];
        return `https://www.instagram.com/${type}/${parts[1]}/`;
      }
    }

    // YouTube normalization
    if (parsed.hostname.includes('youtu.be')) {
      const id = parsed.pathname.replace(/^\//, '').split('/')[0];
      return `https://www.youtube.com/watch?v=${id}`;
    }
    if (parsed.hostname.includes('youtube.com') && parsed.pathname.startsWith('/shorts/')) {
      const id = parsed.pathname.replace('/shorts/', '').split('/')[0];
      return `https://www.youtube.com/watch?v=${id}`;
    }

    // Strip tracking
    for (const p of TRACKING_PARAMS) {
      parsed.searchParams.delete(p);
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * Fetch and convert image to base64 for Gemini multimodal input.
 */
async function fetchImageAsBase64(imageUrl: string): Promise<string | undefined> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(imageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    });
    clearTimeout(timeout);

    if (!res.ok) return undefined;

    const arrayBuffer = await res.arrayBuffer();
    // Cap image size to 2.5MB to keep serverless function fast and lightweight
    if (arrayBuffer.byteLength > 2.5 * 1024 * 1024) return undefined;

    const buffer = Buffer.from(arrayBuffer);
    return buffer.toString('base64');
  } catch {
    return undefined;
  }
}

/**
 * Instagram extraction waterfall:
 * 1. Social preview crawler (facebookexternalhit) for og:title, og:description, og:image
 * 2. Instagram public embed fallback: /embed/captioned/
 */
async function unfurlInstagram(canonicalUrl: string) {
  let title = 'Instagram Post';
  let description = '';
  let author = '';
  let thumbnailUrl = '';

  // 1. First attempt: Crawler spoof
  try {
    const data = await ogs({
      url: canonicalUrl,
      timeout: 6,
      fetchOptions: {
        headers: {
          'User-Agent': CRAWLER_USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      },
    });

    if (data.result?.success) {
      const res = data.result;
      if (res.ogTitle) title = res.ogTitle;
      if (res.ogDescription) description = res.ogDescription;
      if (res.ogImage && res.ogImage.length > 0) {
        thumbnailUrl = res.ogImage[0].url;
      }
    }
  } catch {
    // Continue to fallback
  }

  // 2. Check if metadata was blocked or empty; try Instagram embed endpoint
  const shortcodeMatch = canonicalUrl.match(/\/(reel|reels|p|tv)\/([a-zA-Z0-9_-]+)/);
  const shortcode = shortcodeMatch ? shortcodeMatch[2] : null;

  if (shortcode && (!description || description.toLowerCase().includes('welcome back to instagram'))) {
    try {
      const embedUrl = `https://www.instagram.com/reel/${shortcode}/embed/captioned/`;
      const res = await fetch(embedUrl, {
        headers: { 'User-Agent': BROWSER_USER_AGENT },
      });

      if (res.ok) {
        const html = await res.text();
        const { document } = parseHTML(html);

        // Find caption text
        const captionElem = document.querySelector('.Caption, .CaptionComments, .caption');
        const captionText = captionElem?.textContent?.trim();
        if (captionText) {
          description = captionText;
        }

        // Find username
        const usernameElem = document.querySelector('.CaptionUsername, .username, a[href*="instagram.com/"]');
        if (usernameElem?.textContent?.trim()) {
          author = usernameElem.textContent.trim().replace(/^@/, '');
        }

        // Find thumbnail poster
        const posterImg = document.querySelector('img.EmbeddedMediaImage, .PosterImage, img');
        if (posterImg) {
          const src = posterImg.getAttribute('src');
          if (src && !thumbnailUrl) {
            thumbnailUrl = src;
          }
        }
      }
    } catch {
      // Ignore embed failure
    }
  }

  // Author extraction from ogTitle format e.g. "Author on Instagram: '...'"
  if (!author && title.includes(' on Instagram')) {
    const parts = title.split(' on Instagram');
    author = parts[0].trim();
  }

  return {
    platform: 'instagram' as const,
    title: title || 'Instagram Reel',
    description: description || '',
    author: author || undefined,
    thumbnailUrl: thumbnailUrl || undefined,
  };
}

/**
 * YouTube extraction:
 * Uses YouTube oEmbed API for zero-cost, zero-auth, rate-limit resilient metadata.
 */
async function unfurlYouTube(canonicalUrl: string) {
  let title = 'YouTube Video';
  let description = '';
  let author = '';
  let thumbnailUrl = '';

  const parsed = new URL(canonicalUrl);
  let videoId = parsed.searchParams.get('v');
  if (!videoId && parsed.hostname.includes('youtu.be')) {
    videoId = parsed.pathname.replace(/^\//, '').split('/')[0];
  }

  if (videoId) {
    thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  }

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`;
    const res = await fetch(oembedUrl);
    if (res.ok) {
      const data = (await res.json()) as {
        title?: string;
        author_name?: string;
        thumbnail_url?: string;
      };
      if (data.title) title = data.title;
      if (data.author_name) author = data.author_name;
      if (data.thumbnail_url) thumbnailUrl = data.thumbnail_url;
    }
  } catch {
    // Fall back to ogs
    try {
      const ogData = await ogs({ url: canonicalUrl, timeout: 5 });
      if (ogData.result?.success) {
        if (ogData.result.ogTitle) title = ogData.result.ogTitle;
        if (ogData.result.ogDescription) description = ogData.result.ogDescription;
      }
    } catch {
      // Continue with defaults
    }
  }

  return {
    platform: 'youtube' as const,
    title,
    description,
    author: author || undefined,
    thumbnailUrl: thumbnailUrl || undefined,
  };
}

/**
 * Generic Web Article/Blog extraction using ogs + Readability.
 */
async function unfurlWeb(canonicalUrl: string) {
  let title = '';
  let description = '';
  let content = '';
  let author = '';
  let thumbnailUrl = '';
  let siteName = '';

  try {
    // 1. Open Graph Scraper
    const ogData = await ogs({
      url: canonicalUrl,
      timeout: 8,
      fetchOptions: {
        headers: { 'User-Agent': BROWSER_USER_AGENT },
      },
    });

    if (ogData.result?.success) {
      const res = ogData.result;
      title = res.ogTitle || '';
      description = res.ogDescription || '';
      siteName = res.ogSiteName || '';
      if (res.ogImage && res.ogImage.length > 0) {
        thumbnailUrl = res.ogImage[0].url;
      }
    }
  } catch {
    // Continue to readability
  }

  // 2. Readability for full clean text extraction
  try {
    const res = await fetch(canonicalUrl, {
      headers: { 'User-Agent': BROWSER_USER_AGENT },
    });

    if (res.ok) {
      const html = await res.text();
      const { document } = parseHTML(html);
      const reader = new Readability(document);
      const article = reader.parse();

      if (article) {
        if (!title && article.title) title = article.title;
        if (!description && article.excerpt) description = article.excerpt;
        if (article.byline && !author) author = article.byline;
        if (article.textContent) {
          // Truncate to first 4000 characters to keep payload compact and fast for Gemini
          content = article.textContent.trim().replace(/\s+/g, ' ').slice(0, 4000);
        }
      }
    }
  } catch {
    // Continue
  }

  return {
    platform: 'web' as const,
    title: title || new URL(canonicalUrl).hostname,
    description: description || '',
    content: content || undefined,
    author: author || undefined,
    thumbnailUrl: thumbnailUrl || undefined,
    siteName: siteName || undefined,
  };
}

export async function handler(event: {
  httpMethod: string;
  queryStringParameters?: Record<string, string>;
  body?: string | null;
}) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  let rawUrl: string | undefined;

  if (event.httpMethod === 'GET') {
    rawUrl = event.queryStringParameters?.url;
  } else if (event.httpMethod === 'POST' && event.body) {
    try {
      const parsedBody = JSON.parse(event.body);
      rawUrl = parsedBody.url;
    } catch {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ success: false, error: 'Invalid JSON request body' }),
      };
    }
  }

  if (!rawUrl) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: false, error: 'Missing "url" parameter' }),
    };
  }

  const canonicalUrl = cleanUrl(rawUrl);

  try {
    const parsed = new URL(canonicalUrl);
    const host = parsed.hostname.toLowerCase();
    let result: {
      platform: 'instagram' | 'youtube' | 'web';
      title: string;
      description: string;
      content?: string;
      author?: string;
      thumbnailUrl?: string;
      siteName?: string;
    };

    if (host.includes('instagram.com')) {
      result = await unfurlInstagram(canonicalUrl);
    } else if (host.includes('youtube.com') || host.includes('youtu.be')) {
      result = await unfurlYouTube(canonicalUrl);
    } else {
      result = await unfurlWeb(canonicalUrl);
    }

    // Optional multimodal base64 image fetching
    let thumbnailBase64: string | undefined;
    if (result.thumbnailUrl) {
      thumbnailBase64 = await fetchImageAsBase64(result.thumbnailUrl);
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: true,
        url: rawUrl,
        canonicalUrl,
        platform: result.platform,
        title: result.title,
        description: result.description,
        content: result.content,
        author: result.author,
        thumbnailUrl: result.thumbnailUrl,
        thumbnailBase64,
        siteName: result.siteName,
      }),
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown unfurl error';
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        url: rawUrl,
        canonicalUrl,
        error: errorMsg,
      }),
    };
  }
}
