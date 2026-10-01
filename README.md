# Creator Growth Studio (StreamBoost AI)

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](./LICENSE)
![Platform: Windows 10/11](https://img.shields.io/badge/platform-Windows%2010%2F11-0078D4)
[![Latest release](https://img.shields.io/github/v/release/soupashh-ship-it/creator-growth-studio?label=download)](https://github.com/soupashh-ship-it/creator-growth-studio/releases/latest)
![Tests](https://img.shields.io/badge/tests-371%20passing-brightgreen)

A **local-first Windows desktop application** that combines creator growth, SEO,
streaming optimization, analytics, research, and content-intelligence tools into
one app — using **real creator data**, **legitimate public research**, **AI
accounts the user already owns**, and **local processing**.

It aims to replace as much as reasonably possible of the paid functionality
spread across VidIQ, TubeBuddy, trend-research tools, keyword tools, SEO
assistants, title generators, thumbnail analyzers, channel analytics
dashboards, clip ideation, stream planners, content calendars, competitor
trackers, and AI creator assistants.

> **This is a legitimate creator-growth app.** It does **not** bot views,
> followers, or subscribers; automate fake engagement; purchase engagement;
> spam comments; circumvent platform limits; inflate CTR/watch time; scrape
> private credentials; steal browser cookies; or extract session tokens.
> Growth comes from better SEO, content choices, titles, thumbnails, retention,
> scheduling, discoverability, and conversion. See spec §1 and
> `docs/INTEGRATION_AUDIT.md`.

---

## Download & install (Windows)

1. Open the [latest release](https://github.com/soupashh-ship-it/creator-growth-studio/releases/latest).
2. Download **`Creator Growth Studio Setup <version>.exe`**.
3. Run the installer — it installs **per user** (no admin rights needed) and adds Start-menu and desktop shortcuts.

**Requirements:** Windows 10 or 11 (x64). No Node, Python or other runtime is needed to *use* the app.

> The installer is **not code-signed**, so Windows SmartScreen may show _"Windows protected your PC"_ the
> first time. Choose **More info → Run anyway**. Each release page also lists the installer's
> SHA-256 so you can verify the download before running it.

---

## Status

| Phase | State |
|---|---|
| 0 — Documentation & architecture | ✅ complete |
| 1 — App scaffold (Electron + React + TS + Vite) | ✅ complete |
| 2 — SQLite schema, migrations, repositories | ✅ complete |
| 3 — Auth foundation (PKCE, state, loopback, OS-encrypted secrets) | ✅ complete |
| 4 — AI provider system (router + 4 providers + prompt-versioned result cache) | ✅ complete |
| 5 — YouTube (OAuth/Data/Analytics) + Twitch (Helix/device flow) + OBS + IG/TikTok stubs | ✅ complete |
| 6 — Engines (scoring, SEO, thumbnail pixels, batch optimizer, keyword, trend, gap, analytics, comments) | ✅ complete |
| 7 — UI pages (all 36 nav pages implemented: shell, palette, wizard, connections, dashboard, analytics, research, competitors, copilot, ideas, experiments, exports, data, advanced, appearance, stream optimizer + title assistant + checklist, twitch research, brief/hooks/scripts/shorts, conversion studio, community planner, AI research, creator memory + knowledge base, developer tools) | ✅ complete |
| 8 — Ops (jobs, scheduler, cache, notifications, rate limits, backup, exports) | ✅ complete |
| 9 — Tests & packaging | ✅ tests done; installer builds and launches |

The implementation order is fixed by spec §92: architecture → database → auth →
AI providers → YouTube → Twitch → analytics → engines → research → AI workflows
→ UI polish → tests → packaging. **Real functionality is built before UI
polish.** See [`TODO.md`](./TODO.md) for the live task list.

> Shell note: the build uses **Electron**, not Tauri, because no Rust toolchain
> is available in the build environment and OpenAI's official sign-in SDK is
> Node-only. See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) §2.

Verified so far: `npm run typecheck`, `npm run lint`, `npm test` (371 tests) and
`npm run build` all pass; the Electron app launches; and `npm run package:dir`
produces a Windows executable that launches successfully.

The packaged smoke test also runs a real image round-trip (`nativeImage` encode
→ decode → pixel analysis → score) and prints
`[smoke] thumbnail decode+score ok`. Thumbnail analysis reads the image's actual
pixels locally; face/text detection is not bundled and is reported as
"Not available" rather than guessed.

**Live platform sign-in** is implemented against the real Google and Twitch
endpoints; it needs the user's own OAuth client id (entered on the Connections
page, kept in OS-encrypted storage). YouTube uses loopback + PKCE, Twitch uses
the Device Code grant. Syncing then populates the Dashboard from real account
data. Nothing is fabricated when an account is not connected.

---

## Documentation

| Document | Contents |
|---|---|
| [`docs/INTEGRATION_AUDIT.md`](./docs/INTEGRATION_AUDIT.md) | Every external integration: official docs, auth method, scopes, limits, limitations, fallbacks, last-checked |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Shell decision, process topology, module map, DB schema, interfaces, prompts, jobs |
| [`docs/FEATURE_MATRIX.md`](./docs/FEATURE_MATRIX.md) | Feature coverage + implemented/tested state |
| [`docs/SCORING.md`](./docs/SCORING.md) | Every score: inputs, weights, normalization, missing-value behaviour, confidence, limitations |
| [`docs/PRIVACY_ARCHITECTURE.md`](./docs/PRIVACY_ARCHITECTURE.md) | What is stored, where, what leaves the machine, deletion |
| [`docs/SETUP.md`](./docs/SETUP.md) | Install prerequisites and run the app |
| [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md) | Dev workflow, conventions, testing, acceptance script |
| [`docs/TROUBLESHOOTING.md`](./docs/TROUBLESHOOTING.md) | Common failures and their fixes |

## Core rules

1. **No fake data.** No hard-coded analytics, no random scores, no fabricated
   search volume. Missing data shows "Not available" (§10, §64, §66, §93).
2. **Provenance.** Every metric shows its source and freshness (§65, §137).
3. **Explain every score.** Every score offers "Why this score?" with its
   calculation (§11, §96) — see `docs/SCORING.md`.
4. **Account login where supported.** ChatGPT plan access and Google/Gemini
   sign-in are used instead of API keys when the provider officially supports
   it; where it does not, the app says so plainly rather than faking it (§144).
5. **Secrets never in plaintext.** OS credential storage only (§76).

## Intended product flow

```
"What should I make?"
  → Research → Opportunity → Video Idea → SEO → Title → Thumbnail
  → Script/Brief → Schedule → Livestream/Publish → Analytics → Retention
  → Comments → Subscriber/member conversion → Next content decision
```

All inside one local application.

## Build from source

Requires Node.js 24+ on Windows.

```bash
npm ci
npm run dev       # run the app in development (electron-vite)
npm run typecheck && npm run lint && npm test   # verify
npm run package   # build the Windows installer into ./release
```

See [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md) for the full workflow.

## License

Licensed under the **GNU General Public License v3.0** — see [`LICENSE`](./LICENSE).
You may use, study and share the app; **derivatives must remain open source under the
same license**, so the project cannot be taken closed-source.
