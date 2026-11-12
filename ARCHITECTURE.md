# Drop Library — System Architecture & Engineering Deep-Dive

> A technical blueprint detailing the end-to-end architecture, mobile subsystems, serverless scraper waterfall, and multimodal AI pipeline of Drop Library.

---

## 1. System Topology & End-to-End Flow

Drop Library is engineered around a unified TypeScript architecture powering a native Android application (via Capacitor 8), supported by an edge serverless metadata unfurler.

### End-to-End Data Pipeline

```mermaid
flowchart TD
    subgraph Client["1. Android Native Client"]
        A["User shares link / text / image<br/>from Instagram, YouTube, Chrome"] -->|"ACTION_SEND Intent"| B["Native Share Target Bridge<br/>Capacitor Share Target v8"]
        B --> C{"Cold-Start Buffer<br/>React mounted?"}
        C -->|"No"| D["Buffer Intent in Memory"]
        C -->|"Yes"| E["Dispatch to React App.tsx"]
        D -->|"React ready"| E
        
        E --> F["Immediate IndexedDB Write<br/>status: 'pending'"]
        F --> G["Saved ✓ Haptic HUD"]
        G --> H{"Auto-Return?"}
        H -->|"Delay 0s"| I["Minimize App / Return to Source App<br/>~300ms total"]
        H -->|"Delay >0s"| J["Show HUD, then auto-minimize"]
    end

    subgraph SyncEngine["2. Background Queue Worker (Client)"]
        F -.-> K["Queue Worker Awake<br/>Window 'online' / periodic"]
        K --> L{"Payload has URL?"}
        L -->|"Yes"| M["HTTP POST /.netlify/functions/unfurl"]
        L -->|"No - Text/Image"| N["Convert image to Base64 Data URL"]
        M --> O["Receive OpenGraph + Readability Data"]
    end

    subgraph Backend["3. Netlify Edge Serverless Unfurler"]
        M --> P["URL Normalizer<br/>Strip tracking params ?igsh, ?vrfl"]
        P --> Q{"Platform?"}
        Q -->|"Instagram"| R["Crawler Spoofing<br/>facebookexternalhit/1.1"]
        R -->|"Blocked/Login wall"| S["Instagram /embed/captioned/ Fallback"]
        Q -->|"YouTube"| T["oEmbed API + HQ Thumbnail"]
        Q -->|"Web / News"| U["open-graph-scraper + Mozilla Readability"]
        R --> V["Assemble Preview JSON + Cover Thumbnail"]
        S --> V
        T --> V
        U --> V
        V --> O
    end

    subgraph AI["4. Dual-Engine Multimodal Structuring"]
        O --> W["Assemble Payload<br/>Thumbnail Base64 + Article Text + User Intent"]
        N --> W
        W --> EA{"Engine Selection"}
        EA -->|"Default Primary"| X["Google GenAI SDK<br/>Gemini 4 / 3.8 / 3.5"]
        EA -->|"Fallback / Custom"| EB["OpenAI Fetch Client<br/>OpenRouter / NVIDIA NIM / Groq / Ollama"]
        X --> Y["Strict responseSchema<br/>Low Temp 0.2"]
        EB --> EC["Auto-Repair & Vision Filter<br/>Strip <think> & Modality Recheck"]
        Y --> Z["Runtime Zod Validation<br/>FlexibleCategorySchema"]
        EC --> Z
    end

    subgraph Storage["5. Persistent Vault & Fuzzy Search"]
        Z --> AA["Update IndexedDB<br/>status: 'enriched'"]
        AA --> AB["Fuse.js In-Memory Reindex<br/>Title x3, Tags x2, Synonyms x1.5"]
        AB --> AC["Instant Searchable Memory<br/>0ms client latency"]
    end

    classDef client fill:#141414,stroke:#06B6D4,stroke-width:1.5px,color:#fff;
    classDef sync fill:#141414,stroke:#10B981,stroke-width:1.5px,color:#fff;
    classDef backend fill:#141414,stroke:#3B82F6,stroke-width:1.5px,color:#fff;
    classDef ai fill:#141414,stroke:#8B5CF6,stroke-width:1.5px,color:#fff;
    classDef storage fill:#141414,stroke:#F59E0B,stroke-width:1.5px,color:#fff;

    class A,B,C,D,E,F,G,H,I,J client;
    class K,L,M,N,O sync;
    class P,Q,R,S,T,U,V backend;
    class W,X,Y,Z ai;
    class AA,AB,AC storage;
```

---

## 2. Core Architectural Pillars

### A. Sub-2-Second Capture & Cold-Start Buffering
When an app is cold-started on Android via `ACTION_SEND`, native Capacitor events can fire before the JavaScript bundle initializes and React registers its event handlers. 

```mermaid
sequenceDiagram
    autonumber
    actor User as "User (in Instagram)"
    participant OS as "Android System"
    participant Native as "Capacitor Activity (singleTask)"
    participant Buffer as "coldStartBuffer (native/bridge.ts)"
    participant React as "React (App.tsx)"
    participant IDB as "IndexedDB (idb-keyval)"

    User->>OS: Tap Share -> Drop Library
    OS->>Native: Launch MainActivity with ACTION_SEND Intent
    Native->>Buffer: shareReceived fired (JS booting)
    Note over Buffer: Buffered in memory before React mounts
    Native->>React: React mounts & calls registerShareTarget()
    Buffer->>React: Drain buffered intent immediately
    React->>IDB: set(item.id, { status: 'pending', ... })
    React->>Native: triggerHaptic('success') & showToast('Saved ✓')
    alt autoReturn && returnDelay == 0
        React->>Native: App.minimizeApp()
        Native->>OS: Move task to background (~300ms)
        OS->>User: User stays in Instagram uninterrupted
    end
```

To guarantee zero dropped shares:
1. `coldStartBuffer`: A module-scoped FIFO queue in `src/native/bridge.ts` registers `@capgo/capacitor-share-target` immediately upon bundle evaluation.
2. If `App.tsx` has not mounted yet, incoming intents accumulate safely in the buffer.
3. Upon mounting, `App.tsx` attaches its subscriber, which automatically drains the buffer.
4. `android:launchMode="singleTask"` in `AndroidManifest.xml` prevents Android from spawning multiple duplicate instances of `MainActivity` during rapid sharing.

---

## 3. Netlify Serverless Unfurler Waterfall

Social media platforms (especially Instagram/Meta) actively resist link scrapers by serving login walls to standard crawlers and omitting captions in share intents. 

```mermaid
flowchart TD
    Start["Incoming Share URL"] --> Strip["Strip Query Params<br/>?igsh=, ?vrfl=, ?utm_*, &si="]
    Strip --> Check{"Platform Hostname?"}

    Check -->|"Instagram"| InstaStep1["Fetch with Facebook Crawler UA<br/>facebookexternalhit/1.1"]
    InstaStep1 --> InstaCheck{"Login wall / 401?"}
    InstaCheck -->|"No"| InstaOG["Extract og:title, og:image, og:description"]
    InstaCheck -->|"Yes"| InstaFallback["Fetch Public Embed Endpoint<br/>/reel/code/embed/captioned/"]
    InstaFallback --> InstaParse["Parse caption & poster with linkedom"]

    Check -->|"YouTube"| YTOEmbed["Fetch YouTube oEmbed API<br/>format=json"]
    YTOEmbed --> YTOg["Fetch YouTube High-Res Thumbnail"]

    Check -->|"Generic Web / Blog"| WebOG["Extract OpenGraph via open-graph-scraper"]
    WebOG --> Readability["Parse cleaned article text<br/>via Mozilla Readability + linkedom"]

    InstaOG --> Assemble["Assemble UnfurlResult"]
    InstaParse --> Assemble
    YTOg --> Assemble
    Readability --> Assemble
    Assemble --> Base64Thumb["Fetch cover image & convert to Base64"]
    Base64Thumb --> Return["Return JSON Payload to Client"]
```

### Unfurler Specifications:
- **Instagram Spoofing:** Employs `User-Agent: facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)`. Platforms permit this agent to generate link preview cards on WhatsApp and Messenger.
- **Embed Fallback:** When crawler headers fail, requests are rewritten to the public iframe route: `https://www.instagram.com/p/{shortcode}/embed/captioned/`.
- **Thumbnail Fetching:** Cover images are downloaded in the serverless function and delivered as Base64 strings. This prevents CORS blocks on the client and eliminates broken images caused by Instagram's short-lived temporary CDN signed URLs.

---

## 4. Dual AI Structuring: Gemini Multimodal & Custom Provider Fallback

Creators on Instagram and YouTube often leave caption text minimal, placing the key hook or title directly onto the video cover frame. Passing only textual URLs to an LLM produces generic summaries.

Drop Library solves this by using a **Dual-Engine AI Pipeline** with multimodal vision and automatic fallback:

```mermaid
flowchart TD
    In["Drop Input Payload<br/>(URL, Thumbnail Base64, Note, QuickIntent)"] --> CheckEngine{"Active AI Engine"}
    
    CheckEngine -->|"Google Gemini (Default)"| GCall["enrichWithGemini()<br/>Gemini 4 / 3.8 / 3.5 via @google/genai"]
    GCall --> GCheck{"Status / Quota?"}
    GCheck -->|"200 OK"| Parse["Parse Structured JSON"]
    GCheck -->|"429 Rate Limit / Error"| Fallback["Trigger Custom Provider Fallback"]
    
    CheckEngine -->|"Custom Provider"| Fallback
    Fallback --> CCall["enrichWithCustomAi()<br/>OpenRouter / NVIDIA NIM / Groq / Ollama"]
    CCall --> VisionCheck{"isVisionCapableModel?"}
    VisionCheck -->|"Yes (Vision Model)"| VReq["Send multimodal image_url"]
    VisionCheck -->|"No (Text Model)"| TReq["Send sanitized text prompt"]
    VReq --> NetExec["Execute Request via CapacitorHttp / aiProxy"]
    TReq --> NetExec
    NetExec --> AutoRepair{"400 / 422 Error?"}
    AutoRepair -->|"Yes"| Retry["Auto-Repair: Sanitize to plain text without response_format"]
    AutoRepair -->|"No"| CParse["Strip <think> tags & extract JSON"]
    Retry --> CParse
    CParse --> Parse

    Parse --> Zod["Zod Validation & Normalization<br/>FlexibleCategorySchema"]
    Zod --> Update["Save to IndexedDB (status: 'enriched')"]
```

### Multimodal Vision & Auto-Repair Logic:
1. **Vision-Capable Filtering:** Before attaching `image_url` data URLs to OpenAI-compatible payloads, `isVisionCapableModel()` inspects the model ID. If the model is text-only (e.g. `meta-llama/llama-3.3-70b-instruct`, `llama-3.3-70b-versatile`), thumbnail image tokens are omitted to prevent `HTTP 400 Bad Request` modality errors.
2. **Two-Tier Auto-Repair:** If a provider rejects `response_format: { type: "json_object" }` or modality formats, the engine automatically catches the error and resends a simplified plain-text request.
3. **Reasoning Tag Stripping:** DeepSeek R1 and QwQ models frequently wrap chain-of-thought in `<think>...</think>` blocks. The extractor strips reasoning tags before isolating the JSON object.
4. **Flexible Schema Normalization:** Open-source models occasionally emit plural categories (e.g. `"articles"` instead of `"article"`) or comma-separated tag strings. `FlexibleCategorySchema` normalizes these into the canonical schema without throwing Zod errors.

### JSON Schema & Zod Definition:
```typescript
{
  title: string;              // High-clarity, non-clickbait title
  tldr: string;               // 1-2 punchy sentences capturing core insight
  category: 'reel' | 'article' | 'essay' | 'tool' | 'quote' | 'inspo';
  tags: string[];             // 3-5 normalized lowercase tags
  searchSynonyms: string[];   // 5-8 conceptual query equivalents
  authorOrHandle?: string;    // Creator name or publication
  estimatedReadMinutes?: number;
}
```

### Why Search Synonyms Matter:
A reel demonstrating the 50/30/20 budgeting rule might be titled *"Stop doing this in 2026"*. 
The AI generates search synonyms:
`["personal finance", "budgeting method", "saving money", "50 30 20 rule", "wealth building"]`

When a user types **"how to save money"** in Fuse.js, the item matches with high precision even though those words never appeared in the video's original title or caption.

---

## 5. Offline Queue State Machine

The client queue worker operates as an autonomous background reconciliation engine:

```mermaid
stateDiagram-v2
    [*] --> Pending: Share Intent Received (Local IDB Write)
    Pending --> Unfurling: Queue Worker Awake & Online
    Unfurling --> Enriched: Unfurl + Gemini Success (Zod Validated)
    Unfurling --> Failed: Network Error / API Quota Exhausted
    Failed --> Pending: Auto-Retry (Max 3 Attempts)
    Failed --> [*]: Manual Retry / Stays Flagged
    Enriched --> [*]: Stored in IndexedDB & Indexed in Fuse.js
```

- **Zero Data Loss:** Items write to IndexedDB before any network request fires. If the phone loses connectivity, drops remain safe in `pending` state.
- **Auto-Reconciliation:** The worker listens to `window.addEventListener('online')` and triggers sync automatically when connection restores.
- **Concurrency Locks:** Atomic `isProcessing` locks prevent race conditions during rapid multi-item sharing.

---

## 6. Android WebView & Hardware Quirks Solved

Building high-performance hybrid applications requires overcoming subtle OS-level quirks:

| Issue / Hardware Bug | Root Cause | Engineering Solution |
| :--- | :--- | :--- |
| **Gboard Autocomplete & Paste Missing** | Setting `android.captureInput: true` in `capacitor.config.ts` forced `CapacitorWebView` to return a dummy `BaseInputConnection(this, false)`, disabling Chromium's native IME bridge. | Removed `captureInput` completely. Android Gboard autocorrect, predictions, and clipboard paste drawer resumed native operation. |
| **Blinding White Model Selector** | Native HTML `<select>` triggers Android's OS-level `AlertDialog` spinner. On custom skins (Vivo OriginOS/FuntouchOS), the system style overrides web dark mode, causing white-on-white text clipping. | Built a custom OLED card component with glowing neon borders, radio indicators, and haptic feedback. Zero native OS dialogs. |
| **Expiring Shared Media Files** | `@capgo/capacitor-share-target` writes shared images to Android's temporary cache (`/data/user/0/.../cache`), which the OS deletes after hours or days. | Read file bytes through `@capacitor/filesystem` immediately upon share and persist as persistent Base64 Data URLs in IndexedDB. |
| **Kotlin JDK Toolchain Failure** | `@capacitor/filesystem` v8 defaults to Kotlin `jvmToolchain(21)`, failing on development machines configured with JDK 17. | Added a project-level override in `android/build.gradle`: `project.kotlin { jvmToolchain(17) }`. |
| **Hardware Back Button Traps** | Android's hardware back gesture was either closing the entire application or behaving inconsistently with modals open. | Implemented hierarchical back-stack handlers via `@capacitor/app`. Pressing back closes sub-modals (e.g. Delete Confirm) &rarr; closes Detail Drawer &rarr; minimizes app. |
| **CORS on Custom AI Endpoints (NVIDIA NIM)** | Browser fetch from Web client rejected by NVIDIA NIM due to missing CORS headers. | Enabled native `CapacitorHttp` (OkHttp) in `capacitor.config.ts` on Android, and transparent serverless proxy `netlify/functions/aiProxy.ts` on Web. |
| **Vision Modality Rejection on Llama 3.3** | Sending image payloads to text-only LLMs resulted in `HTTP 400: Model does not support image input`. | Added `isVisionCapableModel` gate and two-tier Auto-Repair retry logic in `src/services/customAi.ts`. |
| **Mobile Model Picker Screen Bloat** | Displaying full model cards permanently created excessive vertical scrolling on phones. | Added collapsible/expandable accordion panels (~44px collapsed) and stored custom models in IndexedDB (`savedGeminiModels`, `savedCustomModels`) for 1-tap switching. |

---

## 7. Security, Privacy & $0 Infrastructure Model

```
+-------------------------------------------------------------+
|                     Public GitHub Repo                      |
|                (Zero hardcoded API secrets)                 |
+-------------------------------------------------------------+
                              │
                              ▼
+-------------------------------------------------------------+
|                    Client Device (Phone)                    |
|  - Gemini & Custom AI Keys stored in sandboxed IndexedDB    |
|  - Content stored locally on-device                         |
|  - Direct to Google API or OpenAI-Compatible Endpoints      |
+-------------------------------------------------------------+
                              │
                (Anonymous URL unfurl & Web CORS only)
                              ▼
+-------------------------------------------------------------+
|            Netlify Edge Serverless (unfurl & aiProxy)       |
|  - Crawls public OpenGraph metadata & Readability HTML      |
|  - Transparent AI CORS proxy for web clients                |
|  - Zero credentials logged, zero database, zero telemetry   |
+-------------------------------------------------------------+
```

1. **Strict BYOK (Bring Your Own Key):** Each user enters their personal free-tier Google AI Studio API key and/or Custom Provider key (OpenRouter, NVIDIA, Groq) in settings. Keys are stored solely in client-side IndexedDB.
2. **Direct-to-Provider Communication:** On Android, `CapacitorHttp` connects directly from the device to Google or custom AI providers via native OkHttp.
3. **Stateless Edge Crawling & Web Proxy:** Netlify serverless functions (`unfurl.ts` and `aiProxy.ts`) are completely stateless, logging no keys and storing zero user data.
4. **$0 Operating Cost:**
   - Netlify Functions: 125,000 free requests/month.
   - Google AI Studio: Free tier for Gemini models (15 RPM).
   - Storage: Local IndexedDB (unlimited within device capacity).
