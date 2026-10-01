# Creator Growth Studio — TODO

Status legend: `Done` · `In Progress` · `Blocked` · `Future`

Implementation order per spec §92: Architecture → Database → Auth → AI providers →
YouTube → Twitch → Data normalization → Analytics → SEO engines → Research →
AI workflows → UI polish → Tests → Packaging.

Last updated: 2026-10-01

**Verification at this commit:** `typecheck ✓ lint ✓ 371 tests ✓ build ✓`
packaged app launches (`npx electron . --smoke-test` → `[smoke] renderer ready` and
`[smoke] thumbnail decode+score ok`).
`npm run package:dir` produces `release/win-unpacked/Creator Growth Studio.exe`.

Updated after the 2026-10-01 audit sweep: 393 tests, typecheck/lint/build/smoke green.

---

## Phase 0 — Foundation & Documentation ✅

| # | Task | Status | Notes |
|---|------|--------|-------|
| 0.1–0.9 | Docs: integration audit, architecture, feature matrix, scoring, privacy, setup, development, troubleshooting, README | Done | Source-backed, with last-checked dates |

## Phase 1 — Scaffold ✅

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1.1 | Shell decision | Done | **Electron** (no Rust toolchain; OpenAI SIWC SDK is Node-only) — ARCHITECTURE §2 |
| 1.2 | Scaffold | Done | electron-vite + React 19 + TS + Vite 7 |
| 1.3 | Tailwind + tokens | Done | dark-first |
| 1.4 | Directory layout | Done | `/core /providers /platforms /analytics /research /seo /ai /database /auth /jobs /export /prompts` |
| 1.5 | Tooling | Done | ESLint, Prettier, Vitest, typecheck |

## Phase 2 — Database ✅

| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.1 | SQLite + migration runner | Done | `node:sqlite`, no native build |
| 2.2 | Core schema | Done | 40+ tables |
| 2.3 | FTS5 search | Done | + repository index/search |
| 2.4 | Repository layer | Done | workspaces, settings, connections, channels, videos, projects, calendar, comments, ideas, keywords, AI cache, notifications |
| 2.5 | DB tests | Done | migrations + repositories + cache |

## Phase 3 — Auth foundation ✅

| # | Task | Status | Notes |
|---|------|--------|-------|
| 3.1 | OS-encrypted secret store | Done | Electron `safeStorage` (DPAPI) |
| 3.2 | PKCE / state / nonce | Done | RFC 7636 vector |
| 3.3 | Loopback callback server | Done | ephemeral port, state validation, timeout |
| 3.4 | Token refresh + expiry | Done | YouTube (implemented), Twitch (implemented) |
| 3.5 | Auth security tests | Done | PKCE, state mismatch, cancel, timeout, replay, no-plaintext, refresh |

## Phase 4 — AI provider system ✅

| # | Task | Status | Notes |
|---|------|--------|-------|
| 4.1 | `AIProvider` + registry | Done | |
| 4.2 | ChatGPT (official SIWC SDK) | Done | dynamic load; never faked |
| 4.3 | Gemini via CLI headless | Done | json + stream-json, exit codes |
| 4.4 | Ollama + LM Studio | Done | HTTP + streaming |
| 4.5 | Router + fallback chain | Done | capability gating |
| 4.6 | Prompt registry + versioning + result cache | Done | `ai/result-cache.ts`; keyed by input hash + prompt name/version; Regenerate + clear |
| 4.7 | Structured output + retry | Done | zod validation |
| 4.8 | AI Providers page | Done | live health, run a prompt, provider-tried detail |

## Phase 5 — Platforms

| # | Task | Status | Notes |
|---|------|--------|-------|
| 5.1 | `CreatorPlatform` interface | Done | |
| 5.2 | YouTube Data + Analytics | Done | OAuth+PKCE+loopback, refresh, client, analytics URL builder; live connect + sync wired into Connections |
| 5.3 | Twitch Helix (device flow) | Done | device code, refresh, validate, categories, clips, VODs, schedule, followers; live connect UI |
| 5.4 | Instagram / TikTok architecture-ready stubs | Done | typed `not_configured`, no fabricated data |
| 5.5 | OBS WebSocket | Done | v5 client + health panel |
| 5.6 | Platform connection service | Done | `desktop/platform-service.ts` (configure/connect/complete/disconnect/sync) |

## Phase 6 — Engines

| # | Task | Status | Notes |
|---|------|--------|-------|
| 6.1 | Score engine | Done | channel health, SEO, opportunity, title, thumbnail, stream discovery |
| 6.2 | SEO analyzer + batch optimizer | Done | `core/seo/optimizer.ts` deterministic "Optimize everything" pass (title/description/tags) + re-score, applied in SEO Studio |
| 6.3 | Title A/B lab | Done | generator via AI Providers page |
| 6.4 | Thumbnail intelligence | Done | pixel extraction (`core/thumbnail/pixels.ts`) + feature scorer + pair analyzer + Thumbnails page; face/OCR honestly unavailable |
| 6.5 | Keyword engine | Done | clustering, intent, opportunity, content plan (no fake volume) |
| 6.6 | Trend / gap / series engines | Done | velocity, content gaps, series detection |
| 6.7 | Analytics query engine | Done | comparison, median/baseline, outliers, winning patterns |
| 6.8 | Comment intelligence | Done | classification + repeated requests |

## Phase 7 — UI ✅

| # | Task | Status | Notes |
|---|------|--------|-------|
| 7.1 | Shell + navigation | Done | sidebar shell, grouped nav |
| 7.2 | First-run wizard | Done | 3-step onboarding, skip allowed, remembered locally |
| 7.3 | Connection Center | Done | platform configure/connect/sync + live provider health |
| 7.4 | Dashboard | Done | real channel/video data with honest empty states |
| 7.5 | Feature pages | Done | SEO Studio, Titles, Thumbnails, Keywords, Comments, Projects, Calendar, Stream Health, Connections, AI Providers, Data, Advanced |
| 7.8 | Analytics pages | Done | Channel (overview, outliers, patterns, series), Videos, Retention, Audience |
| 7.9 | Research pages | Done | Trends (own publishing momentum), Content Gaps, Opportunities |
| 7.10 | Experiments log | Done | `experiments` table + Experiments page (packaging changes) |
| 7.11 | Competitor research | Done | official channel-handle lookup + uploads playlist; own snapshot, never mixed into your analytics |
| 7.12 | Creator Copilot | Done | grounded in a locally computed aggregated briefing; cannot see raw tables |
| 7.13 | Video Ideas | Done | manual ideas + deterministic content plan from saved keywords |
| 7.14 | Reports & exports | Done | Markdown monthly review + CSV export via OS save dialog |
| 7.15 | Appearance | Done | dark/light theme with shared tokens, persisted in settings |
| 7.6 | Command palette + shortcuts | Done | Ctrl/Cmd+K; navigation + backup/clear-cache actions |
| 7.7 | Notifications | Done | sidebar bell backed by the `notifications` table |
| 7.16 | Stream Optimizer + Twitch Research | Done | official Helix live sample (paginated, labelled as observed lower bound); discovery score + personal fit from stored sessions; `streams` table wired via live-session sync |
| 7.17 | Video Brief | Done | deterministic completeness check + versioned AI draft prompt that only fills empty sections |
| 7.18 | Hooks | Done | deterministic hook engine scores; AI candidates always scored locally |
| 7.19 | Scripts | Done | local structure review (opening/payoff/next) + AI pass that must route unverified claims to researchNeeded |
| 7.20 | Shorts | Done | clip plans only from user-supplied source material; unknown timestamps flagged, never invented |
| 7.21 | Members | Done | honest capability page: membership/revenue not exposed by official APIs; no estimates |
| 7.22 | Community Planner | Done | AI post drafts (no invented stats) + local calendar; posting stays manual |
| 7.23 | AI Research | Done | creator-supplied sources + local briefing; model must separate sourced facts from speculation |
| 7.24 | Stream Title Assistant (§42) | Done | deterministic live-title engine (docs/SCORING.md §16) + mechanical improvements list |
| 7.25 | Pre-live checklist (§43) | Done | default list, user-editable, persisted in settings; the app never ticks items |
| 7.26 | Conversion Studio (§45) + CTA generator (§46) | Done | funnel from stored numbers, members stage unavailable by design; CTA prompt forbids hype and invented cadence |
| 7.27 | Creator Memory + Knowledge Base (§56–57) | Done | profile in Copilot briefing; knowledge docs in FTS with "Ask Creator Knowledge" |
| 7.28 | Weekly plan + "What should I work on?" (§149–150) | Done | deterministic planners from calendar/projects/keywords/goals; no invented best times |
| 7.29 | Logs + Developer Tools (§87, §89) | Done | redacted ring buffer, level filter, copy diagnostics; single status page |
| 7.30 | Search history + favorites (§121–122) | Done | local history on Keywords (clearable); competitor favorites |
| 7.31 | CSV import (§128) | Done | OS dialog; keywords (term column) or videos (title column); merge-safe |
| 7.32 | AI usage visibility (§86) + consensus (§134) | Done | local request counters; "Compare AI opinions" with explicit quota warning |
| 7.33 | Retention planner (§34) + community post types (§48) | Done | proportional beat timelines (tutorial/gaming/review/storytelling); 8 post types in Community Planner |
| 7.34 | Copilot context selector (§59) | Done | per-section checkboxes; omitted sections are declared "not shared" to the model; knowledge defaults OFF |
| 7.35 | Workspace switching (§109) | Done | active workspace is a setting; sidebar switcher appears with 2+ workspaces |
| 7.36 | Post-publish review (§54) | Done | per-video title score + median comparison + manual-only suggestions on Videos |
| 7.37 | Content portfolio (§116–117) | Done | evergreen/trend/news/seasonal/series shares from title patterns on Trends |
| 7.38 | Repurposing kit (§114) | Done | deterministic shorts/captions/poll/follow-up/stream/pinned-comment templates on Video Ideas |
| 7.39 | Data controls (§75) | Done | delete creator profile; reset application with confirm (data + credentials) |
| 7.40 | Clipboard export (§69) + shortcuts (§126) | Done | copy review as Markdown; Ctrl+N / Ctrl+, / Ctrl+R alongside Ctrl+K |
| 7.41 | Subtitle files + transcript analyzer (§35, §37) | Done | SRT/VTT parsing (`core/media/subtitles.ts`); deterministic pacing/filler/repetition/CTA checks citing real cue timestamps — never invented |
| 7.42 | Calendar month view + drag-reschedule (§50) | Done | 7×6 grid with drag-to-move (keeps time of day) alongside the agenda view |
| 7.43 | Performance windows (§52) | Done | 1h/6h/24h/48h/7d/28d from stored snapshots; missing windows say "no snapshot", future ones "not yet" — never interpolated |
| 7.44 | Bulk title scoring (§147) | Done | score all stored titles sequentially on Videos (no concurrency) |
| 7.45 | Task→provider mapping (§133) + refresh interval (§139) | Done | per-task override select (persisted, read by the generate handler); background refresh: manual/hourly/6h/12h/daily |
| 7.46 | Deep research cards (§60–61) | Done | `prompts/deep-research.ts` — structured findings (claim/source/confidence + sourced vs speculation) parsed tolerantly from model text; the Research page renders cards grouped by basis and shows open questions; unparseable output falls back to the raw response rather than being dropped |
| 7.47 | Project ↔ published-video linking (§124) | Done | `core/planning/link-projects.ts` matches project and video titles by token overlap (Jaccard + containment + substring), one-to-one, title-only — never analytics; the Projects page shows candidates with score/reason, a one-click confident auto-link, and nothing is applied without confirmation |
| 7.48 | Stream → content pipeline (§113) | Done | `core/writing/stream-pipeline.ts` — deterministic 5-stage plan (keep VOD → mine clips → short → community post → next-stream seed) from one recorded session; clip count derived from session length only; no invented timestamps or stats. Shown in Stream Optimizer below the recorded sessions |
| 7.50 | Semantic knowledge search (§142) | Done | `core/vectors.ts` + `providers/local-ai/ollama.ts` `embedTexts`; `desktop/knowledge-service.ts` embeds knowledge chunks locally (float32 BLOBs in `knowledge_chunks.embedding`) and ranks by cosine similarity; the FTS index is the automatic fallback when no local embedding provider is available |
| 7.51 | External trend ingestion (§23) | Done | `research/feeds.ts` — dependency-free RSS 2.0/Atom parser + topic extractor over public feeds; `desktop/feed-service.ts` fetches creator-added feeds and records observed topics in the `trends` table; Trends page has an “External sources” section with evidence titles. No scraping, no search-volume claims |
| 7.52 | Local clip export (§38) | Done | `core/media/ffmpeg.ts` + `desktop/ffmpeg-service.ts`; the Shorts page exports a clip with the ffmpeg already installed (stream-copy or frame-accurate re-encode); the app never downloads ffmpeg or uploads anything |
| 7.53 | YouTube Analytics sync (§36, §67) | Done | Migration 0004 (`audience_demographics`, `video_retention`); `platforms/youtube/analytics.ts` query builders + parsing; `YouTubeClient.queryAnalytics` and `YouTubePlatform.getPerVideoMetrics/getDemographics/getRetention`; `desktop/analytics-sync-service.ts` syncs impressions/CTR/avg-view %/revenue into `video_snapshots` and demographics/retention into the new tables. Retention + Audience pages display the real values |
| 7.54 | Acceptance self-check (§155) + ChatGPT devkit probe | Done | `desktop/acceptance-service.ts` reports pass/fail/blocked across migrations, workspace, providers, tools, embeddings and credentials (Developer Tools page); dependency checker now probes `@siwc/local` |
| 7.49 | Domain modes (§110–112) | Done | `core/writing/domain-modes.ts` — general/narrative/gaming/tech beat structures; the Scripts page checks which beats appear in the creator's own outline by keyword and reports completeness, hook guidance and derivative angles. Keyword matching only — no quality verdict, no performance data |

## Phase 8 — Ops ✅

| # | Task | Status | Notes |
|---|------|--------|-------|
| 8.1 | Job queue | Done | cancellable, stateful |
| 8.2 | Cache + freshness badges | Done | TTL cache + relative time + prompt-versioned AI result cache |
| 8.3 | Rate-limit manager | Done | token bucket, Twitch/YouTube buckets |
| 8.4 | Dependency checker | Done | Gemini CLI, Ollama, OBS port, Node/Electron |
| 8.5 | Backup / restore | Done | OS-dialog export/import with WAL checkpoint + confirm |
| 8.6 | Exports + CSV import | Done | CSV/JSON/Markdown + RFC4180 parser + reports |
| 8.7 | Background scheduler | Done | `refresh-channels` 30 min, `prune-notifications` daily |
| 8.8 | Notifications | Done | `notifications` table + native toasts |
| 8.9 | Data maintenance | Done | integrity check + `VACUUM` + AI cache clear on the Data page |

## Phase 9 — Packaging & tests

| # | Task | Status | Notes |
|---|------|--------|-------|
| 9.1 | Unit/integration/provider/db/score/auth/obs/thumbnail/optimizer/insights/report tests | Done | 371 tests, all external APIs mocked |
| 9.2 | UI smoke tests | Done | SSR render of all 36 pages (no browser needed) |
| 9.3 | Windows installer | Done | `npm run package` → NSIS config; `package:dir` verified launching |
| 9.4 | Final acceptance test (§155) | Done (harness) | In-app “Acceptance self-check” on Developer Tools runs every locally exercisable end-to-end step and reports pass/fail/**blocked**; the only blocked steps need real Google/Twitch/ChatGPT registrations, exactly as before |

## Phase 10 — Audit-gap completion (2026-10-01)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 10.1 | Mobile thumbnail test (§19) | Done | `core/thumbnail/sizes.ts` + size-test section on Thumbnails page (scaled previews + measured-feature warnings); tests |
| 10.2 | Sponsor readiness + media kit (§68) | Done | `core/scores/sponsor.ts` + Growth section on Channel page (readiness components, copyable media kit, honest caveat); tests |
| 10.3 | Early performance diagnosis (§53) | Done | `core/scores/diagnosis.ts` (channel-median baselines, hypothesis-only) + Diagnosis section on Videos; tests |
| 10.4 | Goal progress tracking (§119) | Done | Migration 0005 `channel_snapshots`, snapshot recorded on platform sync, `core/scores/progress.ts` (real 30-day deltas, no date predictions) |
| 10.5 | PDF export (§69) | Done | dependency-free `export/pdf.ts` + media-kit PDF export on Channel; tests |
| 10.6 | Palette keyword commands (§70) | Done | Analyze video / keyword research / generate titles / analyze thumbnail / find competitor / connect flows / ask Copilot added |
| 10.7 | Per-type notification disable (§120) | Done | `notifications.disabledTypes` setting; scheduler filters recording + toasts; toggles on Advanced |
| 10.8 | Update check (§88) | Done | `desktop/update-service.ts` GitHub release check (read-only, never auto-installs) + DevTools section |
| 10.9 | Feature matrix sweep | Done | full rebuild: 155 rows verified in code |

## Known gaps (honest)

- Live end-to-end flows against **real** accounts (YouTube/Twitch/ChatGPT) are
  implemented but only testable with user registrations; integration boundaries
  are mocked in tests.
- Thumbnail face detection and OCR are not bundled, so `faceVisible` is always
  `false` and text metrics stay `null` (shown as "Not available"). Pixel-derived
  contrast, colour and edge features are computed for real.
- Instagram/TikTok adapters exist as typed, architecture-ready stubs and return
  `not_configured` rather than data.
- **Every nav page is now implemented**; no page renders the "not implemented
  yet" placeholder. Depth varies per page — see the honest limits below.
- §19/§53/§68/§69-PDF/§70/§88/§119/§120 closed 2026-10-01 (Phase 10).
- Stream session history records a peak-so-far from live syncs; Helix offers no
  historical concurrent-viewer series, so past sessions keep their last known
  concurrent count rather than a reconstructed curve.
- Twitch category numbers are an **observed sample** of currently-live streams
  (paginated Helix scan); categories absent from the sample are shown as "not
  observed", never as zero.
- Competitor research covers **YouTube** only; Twitch competitor lookup is not
  implemented.
- The monthly review is the only report generator; SEO/thumbnail/competitor
  reports are not exported yet.
- **Retention curves, impressions/CTR and audience demographics** are read from
  the official YouTube Analytics API and stored locally (migration 4). They stay
  "Not available" until the creator connects YouTube and runs “Sync YouTube
  Analytics”; nothing is ever estimated. Geography/device breakdowns are not
  stored yet.
- **Trends** show the creator's own publishing momentum (from upload history)
  **plus** optional external signals from public RSS/Atom feeds the creator adds
  (including Reddit's published `.rss` feeds). Neither is platform search
  interest — no official public API exposes that.
- **Semantic search** needs a local embedding provider (Ollama with an embedding
  model). Without one, knowledge search runs on the FTS index; the app never
  sends text to a remote API for embedding.
- **Local clip export** needs `ffmpeg` on PATH (or a configured path). The app
  calls the binary you already have and never downloads or uploads video.
- **ChatGPT plan usage** needs OpenAI's official `@siwc/local` sign-in SDK
  installed; without it the provider reports `not_configured` and the app never
  falls back to a paid API key.
- Membership/revenue data is **not available by design** (official APIs gate or
  omit it); the Members page explains this instead of estimating.
- The weekly plan orders what already exists locally; it does not invent "best
  posting times" — that needs audience-activity data which only a YouTube
  Analytics sync could provide.
- The retention planner produces proportional **planning** timelines; measured
  retention curves still require the Analytics sync.
- Consensus mode compares line-level overlap between two providers — a rough
  mechanical signal, explicitly not a quality verdict.
- Domain-mode beat detection is **keyword matching** against the creator's own outline: a beat that is present but worded differently may be reported as missing. It is a re-read prompt, not a verdict.
- Project ↔ video linking is **title-based**: a published video whose title does not resemble its project will not be suggested and is not linked automatically. There is no free-form manual link picker yet — only the suggested candidates can be confirmed.
- Deep-research finding cards carry the model's **own** source and confidence attribution; the app does not verify an external source, so a "sourced" card still needs a human check. Unparseable model output is shown raw instead of being silently dropped.
- Transcript analysis runs on pasted text or .txt/.srt/.vtt files; there is no
  automatic caption download (not offered by the public API for arbitrary
  channels), so the creator supplies the file.
- Performance windows need ≥2 snapshots at the right times; fresh installs show
  "no snapshot" until background refreshes accumulate history.
