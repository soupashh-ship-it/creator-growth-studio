# Development

Engineering guide for Creator Growth Studio. Read `ARCHITECTURE.md` first.

> Current state: **Phase 0 (documentation)**. The scaffold lands in Phase 1; the
> commands below are the target contract.

---

## 1. Prerequisites

- Node.js LTS (≥ 20) with `npm`
- (No Rust toolchain required — the shell is Electron; see ARCHITECTURE §2)
- Windows 11 with WebView2
- Optional: `ffmpeg`, `gemini` CLI, Ollama, LM Studio, OBS

## 2. Commands (target)

```bash
npm install          # install JS deps
npm run dev          # electron-vite dev: main + preload + renderer
npm run build        # production bundle + installer
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run format       # prettier
npm test             # vitest (unit/integration)
npm run test:e2e     # UI smoke (Playwright/WebDriver)
npm run db:migrate   # apply SQLite migrations
npm run db:reset     # dev-only drop + recreate
```

Rule (spec §99): the end user must never have to start a backend manually. Dev
mode must not need a separate server process either.

## 3. Conventions

- **TypeScript strict.** No `any` in `core/`, `providers/`, `platforms/`.
- **Feature slices** (spec §152): build one vertical slice at a time
  (e.g. YouTube login → fetch channel → persist → dashboard → refresh → test)
  before touching an unrelated area.
- **No UI in adapters.** `core/`, `providers/`, `platforms/` never import React.
- **No direct API calls from the UI.** UI → IPC (`desktop/preload.ts`) → adapter.
- **Pure score engine.** `core/scores/*` are pure functions, unit-tested against
  the formulas in `docs/SCORING.md`. UI never computes a score itself.
- **Named errors.** Every integration returns a typed state
  (`not_configured | auth_expired | rate_limited | offline | unavailable |
  permission_missing | quota_reached | api_changed`), never a raw throw to the UI.
- **Prompts in `/prompts`.** Never inline prompt strings in components (§83).
- **Provenance required.** Any value shown to the user carries
  `{ source, updatedAt, kind }` (§65).

## 4. Adding a new integration

1. Research the current **official** documentation; do not assume (spec §144).
2. Add/refresh its row in `docs/INTEGRATION_AUDIT.md` with a `Last checked` date.
3. Implement behind the correct interface (`AIProvider` or `CreatorPlatform`).
4. Declare capabilities; the UI hides unsupported actions (§131).
5. Add mocked fixtures + tests; no live network in CI.
6. Update `docs/FEATURE_MATRIX.md`.

## 5. Security requirements in code

- OAuth: PKCE `S256`, random `state`, `nonce`; loopback on an ephemeral port;
  reject wrong callback / expired code / replayed code / state mismatch.
- Secrets → OS-encrypted store only (`safeStorage`). Never `console.log` a token (§76, §87).
- Redaction is structural (key-name based), not best-effort.
- AI write actions require explicit UI confirmation before any platform call
  (§108). AI never publishes autonomously.
- Treat all external text as **data**, fenced in prompts (§85).

## 6. Testing

| Layer | Tool | What |
|---|---|---|
| Unit | Vitest | score engine, formatters, parsers, clustering |
| DB | Rust tests / Vitest | migrations idempotency, repositories, FTS |
| Provider | Vitest + mocks | router, fallback, structured-output retry |
| Auth | Vitest | PKCE vector, state/nonce, expiry, refresh, wrong callback, cancel, replay, multi-account, disconnect (§91) |
| UI smoke | Playwright | shell renders, routes, empty/loading/error states |

Mock all external APIs. Tests must pass offline.

## 7. Verifying a feature (spec §153)

Do **not** mark a feature complete on a clean compile. Run:

```text
build → lint → typecheck → test → launch → exercise feature → inspect logs → fix
```

Then check the UI at 1366×768, 1920×1080, 2560×1440 and at 125%/150% scaling
(§127, §154): overflow, clipping, scrolling, dark/light, loading/empty/error
states, modal sizing.

## 8. Final acceptance script (spec §155)

Run this end-to-end before declaring the project complete:

```
install app → launch → create workspace → Continue with ChatGPT
→ connect Gemini (Google login) → connect YouTube → connect Twitch
→ retrieve real creator data → dashboard populates → research keyword
→ generate content idea → create video project → generate titles
→ analyze thumbnail → generate brief → add project to calendar
→ analyze a published video → view analytics → ask Copilot why it performed
→ generate follow-up → disconnect accounts → restart app
→ local data persists → reconnect works
```

Steps gated by permissions unavailable to the test account must have a tested
mock boundary, but the production path stays real.

## 9. Definition of Done (spec §156)

The checklist in the specification is the gate for "complete": app launches,
production build + installer work, migrations and secure storage work, official
ChatGPT/Gemini/YouTube/Twitch auth work, real data loads, AI routing + graceful
errors work, all engines work, exports work, **no fake production analytics**,
**no credentials in logs**, tests + lint + typecheck pass, docs exist, and a
fresh install is reproducible.
