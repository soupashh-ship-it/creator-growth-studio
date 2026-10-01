# Privacy Architecture

What is stored, where, what leaves the machine, and how deletion works.
Required by spec §97 (and informs §65, §75, §76, §80, §143).

Principle: **local-first**. There is no backend operated by this project. The app
runs entirely on the user's Windows machine.

---

## 1. What is stored, and where

| Data | Location | Sensitivity |
|---|---|---|
| Creator profile, memory, goals (§56) | SQLite | personal (local only) |
| Channels, videos, snapshots, comments | SQLite | public platform data + locally derived metrics |
| Keywords, trends, competitors, reports | SQLite | research data |
| Projects, calendar, experiments, ideas | SQLite | user content |
| AI sessions/messages, cached AI results | SQLite | may contain user-entered text |
| Knowledge base files + chunks/embeddings (§57) | SQLite + app data dir | user files |
| Settings (incl. workspace layout) | SQLite | low |
| Logs | `%APPDATA%/<app>/logs/` | redacted (§7) |
| **OAuth access/refresh tokens, OBS password** | **OS-encrypted secret file** (DPAPI via Electron `safeStorage`); ciphertext only | **secret — never plaintext, never logged** |
| ChatGPT SIWC profile secrets | OS-encrypted store (SDK-managed) | secret |
| Gemini CLI credentials | Managed by Gemini CLI, outside this app | secret (not ours) |
| Thumbnails / clips / imported files | App data dir (user-chosen) | user media |

The SQLite database lives in `%APPDATA%/<app>/data/creators.db` (or a
user-chosen workspace location). §75 copy in-app: *"Your local analytics database
stays on this computer."*

---

## 2. What leaves the machine

Only what a feature explicitly needs, and only to the provider in use:

| Destination | Sent | When |
|---|---|---|
| OpenAI (Responses API) | prompt text + selected context (channel/video/comment excerpts) | user runs an AI feature with ChatGPT selected |
| Google (Gemini CLI) | prompt text + selected context | user runs an AI feature with Gemini selected |
| Google (YouTube Data/Analytics) | OAuth token + query params (no user PII beyond scope) | user refreshes/reads YouTube data |
| Twitch (Helix) | OAuth/app token + query params | user reads Twitch data |
| Research sources | public query terms only | user runs research |
| Local AI (Ollama/LM Studio) | prompt text | localhost only — never leaves the machine |

**Never sent:** tokens, cookies, passwords, the full SQLite database, or AI
history unless the user includes it as context. The Context Selector (§59)
defaults to explicit, visible checkboxes, and "Local files" is **off** by default.

AI requests carry only the minimum context needed; raw tables are not dumped
(§105). External text is fenced as data (§85).

---

## 3. AI request flow

```
UI action → jobs/ai-queue → providers/router (task→provider)
  → provider.authenticate? (OS-encrypted secret store) 
  → provider.streamText(prompt)
  → validate structured output → persist result to SQLite (ai_messages / reports)
  → UI renders with provenance badge
```

- Choosing a **local** provider keeps the entire flow on-device.
- If the user has **no** AI provider connected, all non-AI features work because
  deterministic engines (score engine, SEO analyzer core, keyword clustering,
  calendar, exports) are local.
- Usage metadata returned by a provider may be stored in `provider_usage` (§86)
  but no hidden telemetry is collected.

---

## 4. OAuth credential storage

1. Tokens are encrypted with **OS secure storage** (Windows DPAPI via Electron
   `safeStorage`) under namespaced keys (e.g. `<app>/youtube/<accountId>`). Only
   ciphertext is persisted; plaintext is never written to SQLite or disk.
2. SQLite stores only non-secret metadata: provider, external account id, label,
   granted scopes, expiry, status.
3. Logging redaction (§7) replaces any field matching
   `token|secret|password|code|cookie|authorization|client_secret`.
4. No cookie/session extraction from browsers; no reading other apps' data
   (spec §1, §144).
5. Refresh tokens are rotated in place; disconnect deletes the stored secret and
   revokes where the provider supports programmatic revocation.

---

## 5. Channel data storage

- Retrieved via official APIs only, stored locally, scoped per workspace (§109).
- Competitor data is **public** only (§27); no private analytics are accessed.
- Snapshots accumulate over time to enable monitoring (§52) and patterns (§29);
  they are derived from official reads and labelled with provenance.

---

## 6. Deletion & user control (§75)

| Action | Effect |
|---|---|
| Clear cached analytics | deletes snapshot/cache rows; keeps profile |
| Clear AI history | deletes `ai_sessions`, `ai_messages`, `ai_result_cache` |
| Disconnect account | removes stored secrets + `platform_connections`/`ai_connections` rows |
| Delete creator profile | removes `creator_profile`, `creator_memory` |
| Delete workspace | removes all `(ws)`-scoped rows |
| Reset application | removes database, cache, logs, knowledge base, stored secrets |
| Backup / restore (§129) | exports workspace **without** credentials; restore requires reauthentication |

Every destructive action is confirmed in the UI and is irreversible by design
(with an optional exported backup beforehand).

---

## 7. Logging

- Levels: Error/Warn/Info/Debug (§87), stored locally, rotated.
- Secrets redacted before write; a debug log must never contain a token,
  authorization code, cookie, password, or client secret.
- "Copy diagnostics" scrubs absolute user paths where practical.
- No telemetry is sent anywhere unless the user explicitly opts in.

---

## 8. Threat model notes

| Risk | Mitigation |
|---|---|
| Secret leak via logs/crash dumps | OS encryption + structured redaction |
| OAuth callback interception | loopback on ephemeral port + PKCE + state + nonce; reject mismatch/replay |
| Prompt injection from public text | untrusted content treated as data; schema-constrained outputs |
| Accidental publishing | no autonomous writes; every platform mutation confirmed (§108) |
| Data exfil via AI | context is user-selected; local provider option; provenance shown |
| Backup leaking credentials | backups exclude secrets; reauth required |
