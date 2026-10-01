# Integration Audit

Source-backed audit of every external integration this application touches.
Written **before** implementation, as required by spec §94 and §157.

- Authored: 2026-09-30
- Rule for this document: never invent API capabilities. Where an official
  capability does not exist, that is recorded as a limitation and no workaround
  is invented (spec §144).
- "Last checked" = date the linked official documentation was read.

Legend for **Plan OAuth?** — whether the provider offers a legitimate way to use
a user's existing *subscription* rather than an API key:

- ✅ Yes (officially supported)
- ⚠️ Partial / limited availability
- ❌ No — API key or app registration required

---

## 1. ChatGPT — Sign in with ChatGPT (open-source / local plan usage)

| Field | Value |
|---|---|
| Purpose | Account sign-in **and** use of the user's ChatGPT Plus/Pro plan allowance for AI requests, with no API key |
| Official documentation | <https://developers.openai.com/siwc/quickstart>, <https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt> |
| Authentication method | OpenID Connect Authorization Code + **PKCE**, loopback callback (`127.0.0.1`), dynamic client registration during browser sign-in |
| Required credentials | **None pre-supplied.** The client registers itself (`client_id=dynamic_agent_client`); OpenAI issues a `client_id` at callback. No client secret, no partner key |
| Plan OAuth? | ✅ for **open-source tools and personal projects that run locally**; ⚠️ commercial/remote-hosted apps need waitlist approval |
| Required scopes | `openid profile email offline_access` (identity + refresh) plus `resource.invoke` with `chatgpt.tokens.use.direct`, resource `https://api.openai.com/v1` (plan usage) |
| Rate limits | Not a public fixed number; governed by the user's ChatGPT plan allowance/credits. Usage-limit errors must surface a "Manage usage" action |
| Relevant endpoints | Authorization: OpenAI authorize endpoint opened in system browser. Token exchange + `https://api.openai.com/v1` Responses API with the OAuth access token |
| Known limitations | Identity-only is a limited partner trial; plan usage is scoped to open-source/local. No access to ChatGPT conversations or the user's API key. Requires an **eligible Plus/Pro account** to actually use the plan. The officially supported path is the OpenAI **devkit SDK** (`@siwc/local`, `@siwc/react`); reimplementing the protocol by hand is fragile |
| Fallback | Show a clear message when a user is ineligible; offer Gemini/local providers as explicit alternatives — **never** silently downgrade to a paid API |
| Last checked | 2026-09-30 |

### 1a. SDK surface (from the official cookbook)

```
createChatGPT({ appName, appId, sendHostId: true })   // main process only
chatgpt.signIn({ newProfile?, profileId? })           // browser sign-in
chatgpt.listProfiles() / selectProfile(id)            // account switching
chatgpt.getSession()                                  // { sharing: boolean }
chatgpt.listModels()                                  // model discovery
chatgpt.streamResponse({ model, input, instructions })// Responses API stream
```

Auth artefacts: `chatgpt-host.json` (installation `ext_agent_host_id`, a
`urn:uuid:` reused across restarts and account switches) and `chatgpt-auth.json`
(issued `client_id` saved **before** the code exchange so an expired code can be
retried). `session.sharing === true` is the only signal that plan usage is
actually granted — identity sign-in alone does not grant AI access.

**Decision:** use the official SDK rather than a hand-rolled OAuth client. If
the devkit is unavailable at build time, the ChatGPT provider is marked
`not configured` with install instructions — it is not faked.

---

## 2. Gemini — via Gemini CLI (Google account sign-in)

| Field | Value |
|---|---|
| Purpose | Google-account-based AI without manually copying an API key; preferred for Google AI Pro/Ultra users |
| Official documentation | <https://geminicli.com/docs/cli/headless/> (headless), <https://github.com/google-gemini/gemini-cli> (repo/auth) |
| Authentication method | Gemini CLI's own delegated **Google OAuth** sign-in; credentials cached by the CLI (outside our app). We never see tokens |
| Required credentials | None — the CLI manages them. We detect, launch, and invoke |
| Plan OAuth? | ✅ where Gemini CLI's Google sign-in is used with a Google AI Pro/Ultra account |
| Required scopes | Managed entirely by Gemini CLI; opaque to this app |
| Rate limits | Exposed by the CLI via usage stats in JSON output; not a documented fixed number |
| Relevant endpoints | Local process invocation only (`gemini`), no direct HTTP to Google |
| Invocation contract | Headless is triggered by a non-TTY environment or `-p`/`--prompt`. `--output-format json` → one JSON object `{ response, stats, error? }`. `--output-format stream-json` → JSONL events: `init`, `message`, `tool_use`, `tool_result`, `error`, `result`. Exit codes: `0` success, `1` general/API failure, `42` input error, `53` turn limit exceeded |
| Known limitations | `--model`/`GEMINI_MODEL` behaviour has been reported inconsistent in non-interactive mode (community reports) — must be probed at runtime, not assumed. CLI must be installed separately. Requires internet |
| Fallback | If CLI absent → show "Gemini CLI not installed + Install instructions + Detect Again". If invocation fails, fall back per the provider chain |
| Last checked | 2026-09-30 |

**Cancellation/timeout:** the CLI is a child process; cancellation = kill child,
timeout = per-invocation budget with `AbortSignal`-equivalent kill. Stream-json
gives incremental progress so long jobs are observable.

---

## 3. OpenAI Responses API (underlying inference)

| Field | Value |
|---|---|
| Purpose | The actual model calls for provider `ChatGPT` |
| Official documentation | <https://developers.openai.com/> (Responses API + SIWC cookbook §4–5) |
| Authentication method | Bearer = the OAuth access token from §1 (via `streamResponse`), **not** an API key |
| Required credentials | From the SIWC profile |
| Plan OAuth? | ✅ (plan usage path) |
| Required scopes | `chatgpt.tokens.use.direct` on resource `https://api.openai.com/v1` |
| Rate limits | Plan/credit governed |
| Relevant endpoints | `POST https://api.openai.com/v1/responses` (streaming) |
| Known limitations | Request only completes when `response.completed`; empty completion must be treated as an error. Model list comes from `listModels()` |
| Fallback | Provider router falls through to Gemini → local |
| Last checked | 2026-09-30 |

---

## 4. YouTube Data API v3

| Field | Value |
|---|---|
| Purpose | Channel/video/playlist metadata, public search, comments (when authorized), live metadata, uploads |
| Official documentation | <https://developers.google.com/youtube/v3/guides/auth/installed-apps> |
| Authentication method | OAuth 2.0 for **installed apps**: system browser + **loopback IP redirect** (`http://127.0.0.1:<port>`), PKCE (`S256`) |
| Required credentials | A Google Cloud **OAuth client** (Desktop/installed type) + enabled YouTube Data API. Custom URI schemes are no longer supported on Android/Chrome; loopback is the recommended redirect for desktop |
| Plan OAuth? | ❌ — free, but requires a registered OAuth client. Documented, not worked around |
| Required scopes (minimal) | `youtube.readonly` (view channel), `youtube.force-ssl` (comments/captions), `youtube.channel-memberships.creator` (members). Request the minimum per feature and show scopes before login |
| Rate limits | Default **10,000 quota units/day per project**. Reads are 1 unit/call; a **search costs 100 units**; writes/comments more. Max **100 refresh tokens per Google account per OAuth client** (exceeding invalidates the oldest) |
| Relevant endpoints | `channels`, `playlistItems`, `videos`, `search`, `commentThreads`, `comments`, `liveBroadcasts`, `liveStreams`, `playlists` |
| Known limitations | Quota is project-wide and shared across our test/prod clients; search is expensive; incremental authorization is **not** supported for installed apps, so all scopes must be requested up front; unverified public apps show an "unverified app" screen and need Google verification for sensitive scopes |
| Fallback | Read from cache; show "quota reached / auth expired" states; support manual CSV import (§128) for historical data APIs don't expose |
| Last checked | 2026-09-30 |

---

## 5. YouTube Analytics API

| Field | Value |
|---|---|
| Purpose | Views, watch time, CTR/impressions, retention, traffic sources, subscriber conversion, revenue |
| Official documentation | <https://developers.google.com/youtube/reporting/guides/authorization> |
| Authentication method | OAuth 2.0 (same installed-app flow as §4) |
| Required credentials | Same Google OAuth client; YouTube Analytics API enabled |
| Plan OAuth? | ❌ |
| Required scopes | `yt-analytics.readonly`; `yt-analytics-monetary.readonly` only if revenue/economics views are requested |
| Rate limits | Separate Analytics quota (per-day, per-project); be conservative and cache |
| Relevant endpoints | `reports.query` (metrics/dimensions/filters) |
| Known limitations | **Does not support** the device flow **or** service accounts. Needs an owned/authorized channel. Data has reporting latency (not real-time). Some metrics unavailable for some channels |
| Fallback | "Not available" / cached values with a freshness badge. Never substitute estimated numbers for official ones — label source explicitly (§65–66) |
| Last checked | 2026-09-30 |

---

## 6. Google OAuth (desktop / installed app) — shared foundation

| Field | Value |
|---|---|
| Purpose | Shared auth for YouTube Data + Analytics |
| Official documentation | <https://developers.google.com/youtube/v3/guides/auth/installed-apps> |
| Authentication method | Authorization Code + PKCE, loopback redirect |
| Required credentials | Google Cloud OAuth client (installed type) |
| Plan OAuth? | n/a |
| Required scopes | See §4/§5 |
| Rate limits | Token endpoint per IP/client; refresh-token cap 100/account/client |
| Relevant endpoints | `https://accounts.google.com/o/oauth2/v2/auth`, `https://oauth2.googleapis.com/token` |
| Known limitations | `redirect_uri_mismatch` unless the exact loopback URI is registered; refresh tokens can be invalidated by password change/revocation; rotate only the token, never log it |
| Fallback | Detect 400/401 → surface "Authentication expired" + reconnect |
| Last checked | 2026-09-30 |

---

## 7. Twitch Helix API + OAuth

| Field | Value |
|---|---|
| Purpose | Broadcaster info, live status, categories, followers/subscriptions (authorized), clips, VODs, schedules, chat statistics, public category research |
| Official documentation | <https://dev.twitch.tv/docs/authentication/>, <https://dev.twitch.tv/docs/api/> |
| Authentication method | User Access Token. Three flows: Implicit, **Authorization Code Grant** (needs server + client secret), **Device Code Grant**. Twitch explicitly recommends **Device Code Grant** for Electron/limited-input apps |
| Required credentials | A registered Twitch application (client ID; secret only if using auth-code grant). Device flow avoids shipping a secret |
| Plan OAuth? | ❌ (free, app registration + OAuth) |
| Required scopes (minimal) | `user:read:email`, `channel:read:subscriptions`, `channel:read:stream_key` (only if needed), `moderator:read:followers`, `clips:edit` only for write actions. Public data (categories/streams/clips) uses an **app access token** or the user token |
| Rate limits | Helix token-bucket: ~**800 points/minute per client**, `Ratelimit-*` headers, `429` on exceed. EventSub separate |
| Relevant endpoints | `helix/users`, `helix/streams`, `helix/games`, `helix/channels`, `helix/clips`, `helix/videos`, `helix/schedule`, `helix/subscriptions`, `helix/followers`, `/oauth2/validate` |
| Known limitations | Some metrics require the broadcaster's authorization. Third-party apps must call `/validate` to check token health. ID token cannot be used as an access token |
| Fallback | App-level token for public research when the user is not connected; cached results; 401 → re-auth prompt |
| Last checked | 2026-09-30 |

---

## 8. OBS WebSocket

| Field | Value |
|---|---|
| Purpose | Stream health panel: running state, scene, streaming/recording, dropped frames, bitrate, FPS |
| Official documentation | <https://github.com/obsproject/obs-websocket>, npm `obs-websocket-js` (5.0.7) |
| Authentication method | Local WebSocket with a password set in OBS (`ws://127.0.0.1:4455`) |
| Required credentials | The OBS WebSocket password the user sets — stored in Credential Manager |
| Plan OAuth? | n/a |
| Required scopes | n/a |
| Rate limits | Local; still throttle polling (§101) |
| Relevant endpoints | WebSocket v5 events/requests (`GetStreamStatus`, `GetRecordStatus`, `GetCurrentProgramScene`, stats requests) |
| Known limitations | **obs-websocket v5 is bundled only with OBS 28+**. v4 protocol is incompatible. Optional dependency — core app must run without it |
| Fallback | OBS card shows "Not running"; feature hidden when disconnected |
| Last checked | 2026-09-30 |

---

## 9. Local AI — Ollama

| Field | Value |
|---|---|
| Purpose | Fully offline AI; bulk/cheap tasks |
| Official documentation | <https://github.com/ollama/ollama> |
| Authentication method | None (localhost) |
| Required credentials | None |
| Plan OAuth? | n/a |
| Required scopes | n/a |
| Rate limits | Local hardware |
| Relevant endpoints | `http://localhost:11434` — `/api/tags` (models), `/api/chat`, `/api/generate`, OpenAI-compatible `/v1` |
| Known limitations | User must install + pull models; availability differs by hardware |
| Fallback | Detect → if absent show "Not detected" |
| Last checked | 2026-09-30 |

---

## 10. Local AI — LM Studio

| Field | Value |
|---|---|
| Purpose | Fully offline AI via an OpenAI-compatible server |
| Official documentation | <https://lmstudio.ai/docs> |
| Authentication method | None (localhost) |
| Required credentials | None |
| Plan OAuth? | n/a |
| Required scopes | n/a |
| Rate limits | Local hardware |
| Relevant endpoints | `http://localhost:1234/v1` — `/models`, `/chat/completions` |
| Known limitations | Server must be started manually in LM Studio |
| Fallback | Detect → if absent show "Not running" |
| Last checked | 2026-09-30 |

---

## 11. FFmpeg (local clipping, §38)

| Field | Value |
|---|---|
| Purpose | Local clip export; transcript/subtitle processing |
| Official documentation | <https://ffmpeg.org/documentation.html> |
| Authentication method | None (local binary) |
| Required credentials | None |
| Plan OAuth? | n/a |
| Required scopes | n/a |
| Rate limits | CPU-bound |
| Relevant endpoints | CLI (`ffmpeg`, `ffprobe`) |
| Known limitations | Optional dependency; must be user-installed. Presets: Shorts 9:16, TikTok, Reels, 16:9 |
| Fallback | Feature disabled with install instructions |
| Last checked | 2026-09-30 |

---

## 12. Research data sources

| Source | Method | Plan OAuth? | Limitations / Last checked |
|---|---|---|---|
| YouTube public search | YouTube Data API v3 `search` (100 units) | ❌ | Official; quota-limited. 2026-09-30 |
| Google Trends | **No official public API.** Legitimate access only via approved/partner access or manual CSV import | ❌ | Do **not** scrape. Until an approved access path exists, Trends is import-only and labelled "user-provided / manual". 2026-09-30 |
| YouTube search suggestions | **Undocumented.** Not relied upon | ❌ | Only used if an approved endpoint exists; otherwise unavailable. 2026-09-30 |
| Twitch categories/streams | Helix public endpoints (app token) | ❌ | Official. 2026-09-30 |
| Reddit | Official OAuth API (app registration) | ❌ | Requires registration + rate-limit compliance. 2026-09-30 |
| RSS / news | Public feeds | n/a | Fetch + cache with attribution. 2026-09-30 |

**Prohibited (spec §1, §144):** cookie/session-token extraction, scraping
authenticated surfaces, bypassing anti-bot protections. None are used as a
primary source, and no workaround is built if a legitimate path is absent.

---

## Summary matrix

| Integration | Plan OAuth | Credentials required | Offline usable |
|---|---|---|---|
| ChatGPT (SIWC) | ✅ open-source/local | None (dynamic client) | ❌ |
| Gemini (CLI) | ✅ Google account | None (CLI-managed) | ❌ |
| OpenAI Responses | ✅ via SIWC | From SIWC profile | ❌ |
| YouTube Data | ❌ | Google OAuth client | cached only |
| YouTube Analytics | ❌ | Google OAuth client | cached only |
| Twitch Helix | ❌ | Twitch app + OAuth | cached only |
| OBS WebSocket | n/a | OBS password | ✅ (local) |
| Ollama | n/a | None | ✅ |
| LM Studio | n/a | None | ✅ |
| FFmpeg | n/a | None | ✅ |

## Requirements this app cannot avoid (documented, not hacked)

1. **Google Cloud OAuth client** for YouTube. There is no legitimate
   zero-registration path; the app ships instructions and accepts a user-provided
   client ID/secret (desktop clients are considered non-secret, but the
   registration step is unavoidable).
2. **Twitch application** registration for a client ID.
3. **Eligible ChatGPT Plus/Pro account** for ChatGPT plan usage; otherwise the
   user is told plainly.
4. **Gemini CLI installed** for the Gemini account path.
