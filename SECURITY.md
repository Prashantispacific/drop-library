# Security Policy

## 🔒 Security Architecture (Strict BYOK)

Drop Library is designed from the ground up to be **100% public-repo safe** and private by default.

### Key Security Principles

1. **Client-Isolated Storage (Bring Your Own Key):**
   - No API keys, credentials, or personal tokens are ever stored in source control, environment files, or server configurations.
   - User Google AI Studio and Custom AI Provider API keys (OpenRouter, NVIDIA NIM, Groq, Ollama) are stored exclusively on the user's local device inside **IndexedDB** (`idb-keyval`).
   - IndexedDB is sandboxed by the operating system and browser under the Same-Origin Policy.

2. **Direct-to-Provider Communication & Native Networking:**
   - On Android devices, LLM requests (via `@google/genai` or `customAi.ts`) communicate directly from the device via native `CapacitorHttp` (OkHttp) to the respective provider endpoints (`generativelanguage.googleapis.com`, `openrouter.ai`, etc.).
   - There is no intermediary database, telemetry tracker, or logging proxy collecting user keys or request contents.

3. **Stateless Public Unfurler & Web CORS Proxy:**
   - The Netlify serverless functions (`netlify/functions/unfurl.ts` and `netlify/functions/aiProxy.ts`) are completely stateless.
   - `unfurl.ts` queries OpenGraph and Readability HTML for public URLs with zero credentials.
   - `aiProxy.ts` provides a transparent pass-through for Web PWA browsers encountering strict CORS boundaries, without logging headers, payloads, or credentials.

---

## 🛡️ Reporting a Vulnerability

If you discover a potential security vulnerability within Drop Library, please do **NOT** open a public issue.

Instead, please report it privately:
- **Email:** `prashantgautam9140@gmail.com`
- **Subject:** `[SECURITY] Drop Library Vulnerability Report`

Please include:
- A description of the issue and potential impact
- Steps to reproduce or proof-of-concept
- Suggested remediation (if known)

We will review reports promptly and publish patches responsibly.
