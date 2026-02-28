# Karet Extension: Settings & Security Plan

Plan for the agent customization panel, secure API key handling, custom shortcuts, and provider choice (OpenAI / local). Target: public release.

---

## 1. Popup Shell and API Key in Storage

- **Add** `popup/popup.html` and `popup/popup.js`; set `action.default_popup` in `manifest.json` so clicking the extension icon opens the settings card.
- **Popup:** Single “API key” input + Save; on save write to `chrome.storage.local`.
- **Background:** Prefer key from `chrome.storage.local`; if missing, optionally fall back to `CONFIG.OPENAI_API_KEY` from `config.js` for dev only. API key is never passed to the content script.

---

## 2. API Key Scoping (Hardening for Public Release)

**Goal:** Reduce impact if a key ever leaks (e.g. profile copied, malware). We can’t enforce OpenAI permissions in code; we guide users.

**Actions:**

- **In the popup** (near the API key field): Short note such as “Use a key with limited permissions and spending limits to reduce risk.” Link: “How to create a limited key” → e.g. OpenAI docs (API keys / organization / project-level keys, usage limits).
- **In README and/or extension description:** Recommend creating a key under a dedicated project with usage caps and, if possible, restricted to the APIs the extension needs (e.g. Chat Completions only).
- **Optional:** “I’ve set usage limits” checkbox in popup (reminder only; no technical effect).

**Outcome:** Users are directed to use minimal permissions and rate/usage limits so leakage is less impactful.

---

## 3. User Passphrase – Encrypt Key at Rest (Hardening for Public Release)

**Goal:** Protect the key against someone reading Chrome’s profile (e.g. stolen laptop, backup). Key is stored encrypted; decryption only in the extension with the user’s passphrase.

**Storage shape (when passphrase is set):**

- Store: `apiKeyEncrypted` (ciphertext), `apiKeySalt` (for PBKDF2), `apiKeyIV` (for AES-GCM).
- Do **not** store the passphrase or the plaintext key.
- If the user leaves passphrase empty: keep storing the plain key in `chrome.storage.local` (current simple flow).

**Crypto (Web Crypto in extension):**

- **Encrypt (popup, on Save):** Generate random salt (e.g. 16 bytes) and IV (12 bytes for GCM). Derive key with PBKDF2(passphrase, salt, { iterations: 100000+, hash: 'SHA-256' }) and use for AES-GCM. Encrypt the API key; store salt, IV, and ciphertext (e.g. base64 or typed arrays).
- **Decrypt (service worker or popup):** Same PBKDF2 + AES-GCM; run only when the user has provided the passphrase (unlock flow).

**Unlock flow:**

- **Option A (recommended):** On Save with passphrase, popup encrypts and saves; optionally sends the decrypted key once to the service worker; service worker keeps it in a module-level variable (never in storage). When the service worker wakes for a request, it uses that in-memory key if present. After extension reload / browser restart, in-memory key is gone: background responds to `QUERY_AI` with e.g. `{ result: "Please open the extension and enter your passphrase to unlock." }`; content script shows that message. User opens popup → enters passphrase → popup decrypts and sends plain key to background → background stores in memory and (optionally) shows “Unlocked.”
- **Option B:** Popup always asks for passphrase when opened if storage has `apiKeyEncrypted`; decrypt and send to background; same in-memory usage in background.

**UX:** Popup: “API key” + “Passphrase (optional, encrypts key on this device)”. If passphrase is set, “Unlock” or “Save” decrypts and sends key to background. First request after restart: if encrypted and not yet unlocked, show “Open extension and unlock with your passphrase.”

**Security:** Plaintext key exists only in memory (popup once, then service worker). Storage and profile see only encrypted blob + salt + IV. Passphrase is never stored.

---

## 4. Custom Shortcuts

- **Popup:** List of shortcuts (label + prompt), with Add / Edit / Remove; persist to `chrome.storage.local` with a default list (e.g. Summarize, Refine).
- **Content script:** On load and when opening the bubble, `chrome.storage.local.get("shortcuts")` and render shortcut buttons from that list; each button sends the stored prompt in the existing `QUERY_AI` flow.
- **Safety:** Validate and length-limit label and prompt; when building the bubble UI, escape/sanitize so prompt text is never executed as HTML/script.

---

## 5. Model Choice + Local Endpoint

- **Popup:** “Provider” dropdown (OpenAI / Local) + conditional “Local endpoint URL” field; save to storage.
- **Background:** Branch on provider; for local, use stored URL and optional `host_permissions`; API key used only for OpenAI.
- **Security:** Local = user’s responsibility; document that the extension sends content to the URL they configure. Only allow `http`/`https` and restrict to localhost or a configurable allowlist to avoid leaking to arbitrary servers.

---

## Implementation Order

| Step | What |
|------|------|
| **1a** | Popup shell: HTML + JS, manifest `default_popup`, API key input + Save → `chrome.storage.local` (plain key for now). |
| **1b** | Background: read key from `chrome.storage.local` first; fall back to CONFIG for dev. |
| **2a** | API key scoping: add short note + “How to create a limited key” link in popup and in README/description. |
| **2b** | Passphrase: in popup, add optional passphrase field; implement encrypt (on Save) and decrypt (on Unlock) with Web Crypto (PBKDF2 + AES-GCM); store only encrypted blob + salt + IV; when passphrase empty, keep storing plain key. |
| **2c** | Unlock flow: background keeps decrypted key in memory when popup sends it after unlock; if storage has encrypted key and no in-memory key, return “Please open extension and unlock”; content script shows that message. |
| **3** | Custom shortcuts in popup and in bubble. |
| **4** | Provider (OpenAI / Local) + local URL in popup and background. |

---

## Summary for Public Release

- **Popup:** Single place for API key, optional passphrase, scoping guidance, custom shortcuts, and provider/URL.
- **Security:** Key not in repo; key only in background (and briefly in popup for encrypt/decrypt); optional passphrase encrypts key at rest; guidance for scoped keys and rate limits.
- **UX:** Users who don’t set a passphrase keep the simple “paste key and save” flow; users who want encryption set a passphrase and unlock once per session (or after restart) in the popup.
