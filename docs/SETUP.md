# Setup

How to install and run Creator Growth Studio.

> Current state: **Phase 0**. The app scaffold arrives in Phase 1 — until then
> there is nothing to run. This page documents the intended end-state setup so a
> normal user can install and run it (spec §98, §99).

---

## 1. End-user install (target)

1. Download `CreatorGrowthStudio-x.y.z-setup.exe`.
2. Run the installer (per-user install; no admin required).
3. Launch from the Start menu. Windows WebView2 is present on Windows 11; the
   installer will offer to install it if missing.
4. Complete the **first-run wizard** (spec §74). Every connection is skippable —
   the app is useful with no accounts connected.

Requirements: **Windows 11** (Windows 10 21H2+ best-effort), 64-bit, ~300 MB disk.

---

## 2. Optional dependencies

Only needed for the features that use them (spec §100). The core app starts
without any of them.

| Dependency | Needed for | How to get it |
|---|---|---|
| **Gemini CLI** | Gemini AI via Google sign-in | Install per Google's instructions, then run `gemini` once and complete Google sign-in. Detect again in Settings → Connections |
| **Ollama** | Offline AI | Install Ollama, then `ollama pull <model>`; serves `http://localhost:11434` |
| **LM Studio** | Offline AI (OpenAI-compatible) | Install, load a model, start the local server on `http://localhost:1234/v1` |
| **OBS Studio 28+** | Stream health panel | OBS ships `obs-websocket` v5 built-in; enable it and set a password |
| **FFmpeg** | Local clip export | Add `ffmpeg`/`ffprobe` to PATH |

---

## 3. Required registrations (documented, not avoidable)

Some official APIs require a registered application. The app cannot invent a
workaround for these (spec §143–144); it guides you through them.

### 3.1 Google / YouTube OAuth client
1. Create a Google Cloud project.
2. Enable **YouTube Data API v3** and **YouTube Analytics API**.
3. Create an **OAuth client** of type *Desktop app* (installed app).
4. Add the loopback redirect URI the app shows you (e.g.
   `http://127.0.0.1:<port>`; the app uses an ephemeral port and shows the exact
   value to register).
5. Paste the **client ID** into Settings → Connections → YouTube.

Note: installed apps use **PKCE** and a **loopback** redirect; incremental
authorization is not supported, so all needed scopes are requested in one go.
See `INTEGRATION_AUDIT.md` §4.

### 3.2 Twitch application
1. Register an app at the Twitch developer console to get a **client ID**.
2. The app uses the **Device Code Grant** (recommended by Twitch for
   limited-input/Electron-class apps), so **no client secret is stored**.

### 3.3 ChatGPT
1. Settings → Connections → **Continue with ChatGPT**.
2. Requires an **eligible ChatGPT Plus/Pro** account for plan usage (the app
   tells you clearly if you are not eligible — it never silently falls back to a
   paid API). Uses the official OpenAI open-source sign-in flow.

---

## 4. Developer setup

See [`DEVELOPMENT.md`](./DEVELOPMENT.md).

Target commands once Phase 1 lands:

```bash
npm install
npm run dev        # electron-vite dev, no manual backend servers
npm run build      # production build → installer
npm run typecheck
npm run lint
npm test
```

---

## 5. Where your data lives

- Database: `%APPDATA%\<app>\data\creators.db`
- Logs: `%APPDATA%\<app>\logs\`
- Secrets: **Windows Credential Manager** (never in files)

See [`PRIVACY_ARCHITECTURE.md`](./PRIVACY_ARCHITECTURE.md).
