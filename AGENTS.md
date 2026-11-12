# AGENTS.md — AI Agent Guidance & Repository Blueprint

> **Notice for AI Coding Agents (Antigravity, Cursor, Windsurf, Claude, Copilot):**
> This document is the definitive operational and architectural guide for developing, refactoring, building, and deploying the **Drop Library** codebase. Read and adhere to these guidelines before executing modifications.

---

## 1. Project Overview & Architecture

**Drop Library** is an ultra-minimalist, zero-friction, offline-first personal media and knowledge vault. It is built as a hybrid cross-platform application:
- **Mobile Client:** Native Android application via **Capacitor 8** (`com.droplibrary.app`), featuring sub-2s capture via Android Share Target (`ACTION_SEND`).
- **Web Client:** Responsive PWA deployed on **Netlify** (`https://drop-vault-pg.netlify.app/`).
- **Edge Functions:** Netlify Serverless Functions for metadata scraping and OpenGraph extraction (`netlify/functions/unfurl.ts`).
- **AI Engine:** Client-side multimodal OCR, summarization, categorization, and fuzzy synonym indexing via the official **Google GenAI SDK** (`@google/genai`) with automatic fallback to **Custom OpenAI-Compatible Providers** (OpenRouter, NVIDIA NIM, Groq, Ollama via `customAi.ts`).

---

## 2. Inviolable Architectural Rules (Non-Negotiables)

### 🔒 1. Strict BYOK (Bring Your Own Key) Model
- **NEVER hardcode, inline, or default Gemini API keys into source code or environment variables.**
- **NEVER** use `VITE_GEMINI_API_KEY`. Any variable prefixed with `VITE_` is baked directly into public client-side JavaScript bundles by Vite during `npm run build`.
- User API keys are stored solely inside the client's isolated device storage (**IndexedDB** via `idb-keyval`).
- Calls to Gemini (`enrichWithGemini`) run **directly from the client browser/device to Google AI Studio**. No intermediate server logs, proxies, or holds user keys.

### 💾 2. Offline-First & Resilient Local Storage
- **IndexedDB** is the single source of truth (`drop_library_items_v1` and `drop_library_settings_v1`).
- The application must always save drops instantly as `pending` before attempting network operations.
- If network, scraping, or Gemini enrichment fails (e.g., quota limits or missing API keys), the app **must never drop data**. It falls back gracefully to `createFallbackMeta()` heuristic metadata so the item remains accessible and searchable.

### 📱 3. Mobile-First & Capacitor Native Boundaries
- Always account for mobile viewport ergonomics: safe area insets (`env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`), touch targets (minimum 44x44px), and OLED True Black (`#000000`) theme support.
- When native share intents arrive via `@capgo/capacitor-share-target`, buffer them if React components are cold-starting.
- Maintain instant haptic feedback via `@capacitor/haptics` and toast feedback via `@capacitor/toast`.

---

## 3. Tech Stack & Dependencies

| Layer | Technologies |
| :--- | :--- |
| **Frontend Framework** | React 19, TypeScript 5, Vite 6 (Rolldown bundler) |
| **Styling** | Tailwind CSS 3, Lucide React icons |
| **Client Storage & Search** | `idb-keyval` (IndexedDB wrapper), `Fuse.js` (client-side fuzzy search) |
| **Validation** | `Zod` (strict schema validation of Gemini & Custom AI structured output) |
| **Mobile Runtime** | Capacitor 8 (`@capacitor/core`, `@capacitor/android`, `@capacitor/app`, `@capacitor/haptics`, `@capacitor/toast`, `@capacitor/status-bar`, `@capgo/capacitor-share-target`, `CapacitorHttp`) |
| **Edge Serverless** | Netlify Functions (`open-graph-scraper`, `linkedom`, `@mozilla/readability`, `aiProxy.ts`) |
| **AI SDK & Providers** | Official `@google/genai` SDK + OpenAI-compatible Fetch client (OpenRouter, NVIDIA NIM, Groq, Ollama) |
| **Linter** | `oxlint` |

---

## 4. Repository Structure

```
Drop-Library/
├── .env.example               # Template environment configuration
├── ARCHITECTURE.md            # In-depth architectural blueprint and Mermaid workflows
├── AGENTS.md                  # This AI agent reference manual
├── README.md                  # User-facing features and BYOK documentation
├── guide.html                 # Comprehensive interactive engineering & decision matrix manual
├── netlify.toml               # Netlify build, redirects, and function bundler configuration
├── capacitor.config.ts        # Capacitor project configuration (with CapacitorHttp)
├── package.json               # Dependencies and scripts
│
├── src/
│   ├── components/            # React UI components (DropInput, LibraryCard, SettingsModal, etc.)
│   ├── native/                # Capacitor platform bridge & share-target listeners (bridge.ts)
│   ├── services/
│   │   ├── gemini.ts          # Multimodal payload assembler, Gemini SDK caller & Zod parser
│   │   ├── customAi.ts        # OpenAI-compatible API client, vision-capability gate & auto-repair loop
│   │   ├── queueWorker.ts     # Offline-first reconciliation loop with dual-engine AI fallback
│   │   ├── storage.ts         # IndexedDB persistence (items, user settings, stored custom models)
│   │   └── unfurlClient.ts    # Client for Netlify serverless scraper
│   └── types/
│       ├── library.ts         # Core TypeScript interfaces (LibraryItem, UserSettings, etc.)
│       └── schema.ts          # Runtime Zod validation schemas (FlexibleCategorySchema, etc.)
│
├── netlify/
│   └── functions/
│       ├── unfurl.ts          # Serverless link scraper, image fetcher, and Readability extractor
│       └── aiProxy.ts         # Transparent web CORS proxy for OpenAI-compatible providers
│
└── android/                   # Native Android studio project (Gradle, AndroidManifest, assets)
    ├── app/
    │   └── src/main/assets/public/  # Synced web assets from dist/
    └── gradlew.bat            # Android Gradle build wrapper
```

---

## 5. Development & Build Workflows

When performing tasks in this repository, always run commands from the project root (`D:\DEV\Drop-Library`):

### 1. Code Quality & Linting
```bash
npm run lint         # Runs oxlint
```

### 2. Web Build (Vite + TypeScript)
```bash
npm run build        # Compiles TypeScript (tsc -b) and bundles to dist/ via Vite
```

### 3. Deploying to Netlify
```bash
# Ensure build passes first
npm run build
# Deploy to production site
netlify deploy --prod --dir=dist
```

### 4. Syncing & Building Android APK
```bash
# 1. Build client bundle
npm run build

# 2. Sync web assets into Android project
npx cap sync android

# 3. Build debug APK using Gradle wrapper
cd android
.\gradlew.bat assembleDebug
cd ..

# 4. Copy generated APK to root for distribution (optional)
Copy-Item "android\app\build\outputs\apk\debug\app-debug.apk" "drop-library-v1.0.0.apk" -Force
```

### 5. Installing on Connected Android Device (ADB)
```powershell
& "C:\Users\prash\AppData\Local\Android\Sdk\platform-tools\adb.exe" install -r "drop-library-v1.0.0.apk"
```

---

## 6. Coding Standards & Conventions

1. **TypeScript Strictness**:
   - Do not use `any`. Use strict interfaces from `src/types/library.ts` or Zod inferences from `src/types/schema.ts`.
   - Ensure all Gemini LLM outputs pass runtime Zod validation (`GeminiMetaSchema.parse()`).

2. **UI & Design Philosophy**:
   - Dark aesthetic: `#0A0A0A` default background, optional `#000000` True Black for OLED power savings.
   - Neutral zinc/neutral text scales with subtle border opacity (`border-white/[0.08]`).
   - Clean micro-animations: scale transitions on press, minimal motion for maximum performance.

3. **Safe Environment Variables**:
   - `VITE_UNFURL_ENDPOINT`: Safe to configure public URL (e.g. `https://drop-vault-pg.netlify.app/.netlify/functions/unfurl`).
   - Any secret or token must **never** be added as a `VITE_` variable.

4. **Git Hygiene**:
   - Never commit `.env`, `.env.local`, or keystore files.
   - Keep commits structured (e.g., `feat: ...`, `fix: ...`, `chore: ...`, `security: ...`).
