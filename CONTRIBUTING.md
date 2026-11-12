# Contributing to Drop Library

Thank you for your interest in contributing to **Drop Library**! We welcome bug reports, feature suggestions, architectural improvements, and pull requests.

---

## 🛠️ Development Setup

### Prerequisites
- **Node.js**: v20 or higher
- **npm**: v10 or higher
- **Java Development Kit (JDK)**: JDK 17 (Required for Android Gradle build)
- **Android Studio / Android SDK**: Platform Tools & Build Tools 34+ (for Android builds)

### Quick Start
```bash
# 1. Clone the repository
git clone https://github.com/Prashantispacific/drop-library.git
cd drop-library

# 2. Install dependencies
npm install

# 3. Start local development server
npm run dev

# 4. (Optional) Run Netlify Functions locally
npx netlify dev
```

---

## 📱 Mobile Android Development

To run or build the native Android app:

```bash
# Build Vite web assets and sync with Capacitor
npm run build
npx cap sync android

# Open project in Android Studio
npx cap open android

# Or build the debug APK directly via command line
cd android
./gradlew assembleDebug
cd ..

# Install onto your connected Android device via ADB
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 📐 Architecture & Guidelines

Before submitting PRs, please review [ARCHITECTURE.md](./ARCHITECTURE.md) and [guide.html](./guide.html) to understand the core principles:

1. **Zero Video Downloads:** Never introduce dependencies or logic that downloads heavy media or video files. Drop Library stores only canonical URLs, preview metadata, and AI JSON.
2. **Sub-2-Second Capture:** Never block the native share receiver with network calls or blocking UI. Write to IndexedDB first (`status: 'pending'`), provide immediate haptic feedback, and return cleanly.
3. **Public-Repo Safe (BYOK):** Never commit secrets, environment keys, or hardcoded tokens. All API keys (Google AI Studio, OpenRouter, NVIDIA NIM, Groq) belong exclusively in client IndexedDB.
4. **Multi-AI & Fallback Resilience:** When writing enrichment or parsing features, ensure compatibility with both `@google/genai` and OpenAI-compatible endpoints (`customAi.ts`), handling text-only models and `<think>` reasoning tags gracefully.
5. **Mobile Ergonomics & OLED Aesthetic:** Follow the `#0A0A0A` canvas, 1px hairline borders (`border-white/[0.08]`), off-white typography (`#E2E2E2`), `#000000` True Black compatibility, and collapsible panels to prevent mobile screen bloat.

---

## 📝 Commit Conventions

We follow the [Conventional Commits](https://www.conventionalcommits.org/) standard:
- `feat(scope)`: A new feature
- `fix(scope)`: A bug fix
- `docs(scope)`: Documentation only changes
- `refactor(scope)`: Code changes that neither fix a bug nor add a feature
- `perf(scope)`: Code changes that improve performance
- `chore(scope)`: Changes to build process or tooling

---

## 📄 License
By contributing to Drop Library, you agree that your contributions will be licensed under the project's [MIT License](./LICENSE).
