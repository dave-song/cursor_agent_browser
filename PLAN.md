# Karet Extension: Settings & Security Plan

Plan for the agent customization panel, secure API key handling, custom shortcuts, and provider choice (OpenAI / local). Target: public release.

---

## Progress vs initial plan

| Step | Status | Notes |
|------|--------|--------|
| **1a** | ✅ Done | Popup shell: `popup/popup.html`, `popup/popup.js`, manifest `action.default_popup`, API key input + Save → `chrome.storage.local`. |
| **1b** | ✅ Done | Background reads key from `chrome.storage.local` first; falls back to `CONFIG.OPENAI_API_KEY` (config.js) for dev. |
| **2a** | ⬜ Not started | API key scoping: in-popup note + “How to create a limited key” link. |
| **2b** | ⬜ Not started | Passphrase: optional encrypt-at-rest with PBKDF2 + AES-GCM. |
| **2c** | ⬜ Not started | Unlock flow: background keeps decrypted key in memory after unlock. |
| **3** | ⬜ Not started | Custom shortcuts in popup and in bubble. |
| **4** | ⬜ Not started | Provider (OpenAI / Local) + local URL in popup and background. |
| **5** | ⬜ Not started | Persistent conversation memory: per-tab sliding window of last N messages, sent with each API call. |

**Current state:** Steps 1a and 1b are implemented (popup + API key in storage). Bubble UX additions (pin, resize, shortcut-hint hotkey on hover) are in place. All later plan steps (scoping, passphrase, custom shortcuts, provider choice, persistent memory) are still to do.

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

## 6. Persistent conversation memory (few-turn history)

**Goal:** Make interactions multi-turn instead of one-off. The agent should have access to recent chat history when answering so it can reference prior questions and answers. This matches the common approach used by products that call external reasoning/chat APIs.

**Approach: sliding window of messages (industry standard)**

- **Stateless API:** The external API (e.g. OpenAI) does not store conversation; it only receives a `messages` array per request. Our app is responsible for keeping and trimming history.
- **Where to store:** In the **background script**, keyed by **tab** (e.g. `tabId → array of { role, content }`). Use `sender.tab.id` in the message listener to get the current tab.
- **What to store:** For each turn, append:
  - `{ role: 'user', content: '<what we sent for this turn>' }`
  - `{ role: 'assistant', content: '<model reply>' }`
- **What to send each request:** Build `messages = [ systemMessage, ...last N history messages, currentUserMessage ]`, then call the API. Current user message continues to include page context + new query (unchanged format).
- **Limit:** Keep a **sliding window** of the last **N messages** (e.g. 10–20 messages = 5–10 exchanges). When adding a new pair, drop the oldest so the list never exceeds the cap. This balances context quality, cost, and context-window limits.
- **When to clear:** Option A: clear that tab’s history when the bubble is closed (fresh conversation each open). Option B (recommended): don’t clear on bubble close; clear when the **tab is closed** (e.g. listen to `chrome.tabs.onRemoved`) or when the user explicitly starts a “New conversation” (optional UI later). That way reopening the bubble in the same tab continues the thread.
- **Optional later:** Token/character budget instead of message count; or summarize older turns and send “conversation summary” + recent messages for very long sessions.

**Implementation outline**

- **Background:** Maintain `chatHistoryByTab = new Map()` (tabId → array). On `QUERY_AI`: get history for `sender.tab.id`, build messages with system + last N of history + current user message, call API, append user and assistant to history, trim to last N, store back, send response to content script. Optionally clear entry in `chrome.tabs.onRemoved`.
- **Content script:** No change to how the current message is built (context + prompt). Keep sending a single `QUERY_AI` with prompt and context; the background adds history and returns the reply.

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
| **5** | Persistent memory: background keeps per-tab sliding window of last N messages (e.g. 10–20); send with each QUERY_AI; clear on tab close (optional: “New conversation” in UI). |

---

## Summary for Public Release

- **Popup:** Single place for API key, optional passphrase, scoping guidance, custom shortcuts, and provider/URL.
- **Security:** Key not in repo; key only in background (and briefly in popup for encrypt/decrypt); optional passphrase encrypts key at rest; guidance for scoped keys and rate limits.
- **UX:** Users who don’t set a passphrase keep the simple “paste key and save” flow; users who want encryption set a passphrase and unlock once per session (or after restart) in the popup.
