# Drop & Forget Universal Library

A personal, zero-friction, offline-first universal knowledge and media vault built for saving content encountered on mobile (**Instagram Reels, YouTube videos, blogs, essays, text quotes, and screenshots**) from a single unified TypeScript codebase.

- **Mobile:** Native Android APK via **Capacitor 8** + `@capgo/capacitor-share-target` (v8)
- **Web:** Desktop & Mobile PWA with Web Share Target API support
- **Backend Unfurler:** Netlify Serverless Function (`open-graph-scraper` + `@mozilla/readability` + `linkedom`)
- **AI Structuring:** Official `@google/genai` SDK with strict JSON `responseSchema` + runtime Zod validation
- **Zero Cost / Zero Infrastructure Overhead:** $0/mo stack with BYOK (Bring Your Own Key) Google AI Studio Gemini free tier

---

## Architecture & Engineering Highlights

```
                                      Android Share Sheet / Web Share / Quick Drop
                                                          │
                                                          ▼
                                            [Cold-Start Buffer Queue]
                                           (src/native/coldStartBuffer)
                                                          │
                                                          ▼
                                              Sub-2s Instant Capture
                                         Persist status: 'pending' to
                                            IndexedDB (idb-keyval)
                                                          │
                                                          ▼
                                               [Saved ✓ Confirmation HUD]
                                           (1-tap optional intent chips)
                                                          │
                                                          ▼
                                             [Background Retry Worker]
                                            (src/services/queueWorker)
                                                          │
                           ┌──────────────────────────────┴──────────────────────────────┐
                           ▼                                                             ▼
              [Netlify Serverless Unfurler]                                     [Gemini AI Structuring]
               (netlify/functions/unfurl)                                      (src/services/gemini)
              - URL parameter stripper (?vrfl, ?igsh)                          - Strict responseSchema
              - Instagram crawler UA + embed fallback                          - Multimodal thumbnail OCR
              - YouTube oEmbed + thumbnail extraction                          - Runtime Zod validation
              - Readability + Linkedom article parser                          - 5-8 search synonyms
                           │                                                             │
                           └──────────────────────────────┬──────────────────────────────┘
                                                          ▼
                                             IndexedDB status: 'enriched'
                                                          │
                                                          ▼
                                           Instant Client-Side Fuzzy Search
                                                (Fuse.js across synonyms)
```

---

## 1. Research & Official SDK Implementations

### A. Capacitor 8 & `@capgo/capacitor-share-target` (v8)
- Configured with `android:launchMode="singleTask"` in `android/app/src/main/AndroidManifest.xml` to prevent multiple activity instances when sharing.
- Handled **Cold-Start Share Buffering**: When the app is launched cold from `ACTION_SEND`, the native `shareReceived` listener is registered in `src/main.tsx` *before* React mounts. Any early intent is safely held in `coldStartBuffer` and delivered as soon as the UI is ready.
- Android intent filters handle `text/*`, `image/*`, and `image/*` multiples.

### B. Official `@google/genai` SDK (v3.2.0)
- Configured with strict `responseSchema` using `Type.OBJECT`, `Type.STRING`, `Type.ARRAY`, and `Type.INTEGER`.
- Low temperature (`0.2`) ensures deterministic, factual metadata generation.
- **Multimodal Thumbnail OCR:** The unfurler fetches and returns the social cover thumbnail as base64 (`inlineData`). Gemini reads on-screen hook text and burned-in subtitles on Instagram Reels and YouTube thumbnails even when caption text is sparse or missing.
- Runtime validated via Zod schema (`GeminiMetaSchema`) before updating records in IndexedDB.

### C. Resilient Unfurler Waterfall (`netlify/functions/unfurl.ts`)
1. **URL Normalizer:** Strips tracking tokens (`?vrfl=`, `?igsh=`, `?utm_*`, `?si=`, `?feature=`, `fbclid`, `gclid`).
2. **Instagram Waterfall:**
   - First attempts crawler spoofing (`User-Agent: facebookexternalhit/1.1; WhatsApp/2.24.0`).
   - If blocked or lacking caption text, falls back to `https://www.instagram.com/reel/{shortcode}/embed/captioned/` and parses caption, author, and poster image via `linkedom`.
3. **YouTube Direct oEmbed:**
   - Calls `https://www.youtube.com/oembed?url=...&format=json` for 100% reliable, zero-auth, rate-limit immune metadata.
   - Extracts canonical thumbnail from `https://img.youtube.com/vi/{videoId}/hqdefault.jpg`.
4. **General Web Readability:**
   - Uses `open-graph-scraper` for metadata and `@mozilla/readability` + `linkedom` for clean article text extraction (truncated to 4,000 characters for sub-second processing).

### D. Expiring CDN Thumbnail Graceful Degradation
- Instagram and Meta CDN URLs expire after several days.
- `ImageWithFallback.tsx` detects `onError` and immediately displays sleek typography, category badges, and platform branding with zero broken image layout shifts.

### E. Public-Repo Safe (BYOK)
- No API keys or environment secrets are committed in source code.
- Users input their own free-tier Google AI Studio API key in the on-device Settings modal.
- Key is stored exclusively in client-side IndexedDB (`idb-keyval`).

---

## 2. Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4 |
| **Native Bridge** | Capacitor 8 (`core`, `app`, `browser`, `status-bar`, `haptics`, `@capgo/capacitor-share-target`) |
| **Storage & Search** | `idb-keyval` (IndexedDB), `Fuse.js` (fuzzy search across synonyms, tags, and titles) |
| **Backend Unfurler** | Netlify Functions, `open-graph-scraper`, `@mozilla/readability`, `linkedom` |
| **AI Engine** | `@google/genai` (Gemini 2.5 Flash, 3.5 Flash Lite, 3.8 Flash) with strict JSON Schema |
| **Design** | Ultra-minimalist OLED (`#0A0A0A` default, toggleable `#000000` True Black) |

---

## 3. Getting Started

### Prerequisites
- Node.js 18+ (tested on Node 24)
- Android Studio / Android SDK (for building the Android APK)

### Installation
```bash
# Clone the repository
git clone https://github.com/your-username/drop-library.git
cd drop-library

# Install dependencies
npm install
```

### Local Development (Web PWA)
```bash
npm run dev
```

### Building Web PWA & Syncing Native Capacitor
```bash
# 1. Build production web bundle
npm run build

# 2. Sync web bundle to Android platform
npx cap sync
```

### Building the Android APK
```bash
cd android
.\gradlew.bat assembleDebug
```
The output APK is generated at:
`android/app/build/outputs/apk/debug/app-debug.apk`

---

## 4. Deploying to Netlify

1. Push your repository to GitHub.
2. In Netlify, import the repository with:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
   - **Functions directory:** `netlify/functions`
3. Netlify automatically deploys `netlify/functions/unfurl.ts` as a serverless endpoint.
4. Set `VITE_UNFURL_ENDPOINT` in your environment or enter your deployed URL into the Settings modal in the app.

---

## 5. Data Schema

Stored in IndexedDB under `drop_library_items_v1`:

```typescript
export interface LibraryItem {
  id: string;                     // crypto.randomUUID()
  schemaVersion: 1;
  createdAt: number;
  updatedAt: number;
  status: 'pending' | 'unfurling' | 'enriched' | 'failed';
  retryCount: number;
  errorMessage?: string;

  // 1. Raw Capture (Saved immediately offline)
  url?: string;                   // Canonical URL stripped of tracking params
  platform: 'instagram' | 'youtube' | 'web' | 'text' | 'image';
  rawShareText?: string;          // Raw text/title from Android Share Sheet
  quickNote?: string;             // Optional 1-tap tag/note added on capture
  thumbnailUrl?: string;          // Extracted og:image URL

  // 2. AI-Structured Metadata (Validated JSON from Gemini)
  meta?: {
    title: string;
    tldr: string;
    category: 'reel' | 'article' | 'essay' | 'tool' | 'quote' | 'inspo';
    tags: string[];               // 3–5 normalized lowercase tags
    searchSynonyms: string[];     // Related concepts so vague queries match
    authorOrHandle?: string;
    estimatedReadMinutes?: number;
  };
}
```

---

## 6. License
MIT
