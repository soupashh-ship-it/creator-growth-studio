# Feature Matrix

Coverage and implementation state for every feature in the specification.
Required by spec §95.

Columns:

- **Source** — where the data comes from (`Local`, `YouTube`, `Twitch`, `OBS`,
  `AI`, `Web/Research`, `Manual`).
- **AI?** — needs an AI provider (Y) or works without (N).
- **Account?** — needs a connected platform/provider account.
- **Offline?** — usable with no internet (cached/local).
- **Impl.** — implemented in the app.
- **Tested** — has automated coverage.
- **Notes** — constraints, dependencies, spec reference.

State as of 2026-10-01: phases 0–8 implemented and verified (typecheck, lint,
371 tests, production build, smoke launch). `Impl. = Yes` means real
functionality in production paths — no mocks, no invented numbers. Rows still
`No` are deliberate, documented gaps (see docs/STATUS_AUDIT.md and TODO.md).

| # | Feature | Source | AI? | Account? | Offline? | Impl. | Tested | Notes |
|---|---|---|---|---|---|---|---|---|
| 3 | ChatGPT Account Sign-In (SIWC) | OpenAI | Y | Y | N | Yes | No | §3; official @siwc/local SDK loaded dynamically; `not_configured` without it; never falls back to an API key |
| 4 | Gemini via Gemini CLI | Google | Y | Y | N | Yes | No | §4; headless CLI (json/stream-json), exit codes, timeout/abort; CLI owns Google credentials |
| 5 | Local AI (Ollama / LM Studio) | Local | Y | N | Y | Yes | Yes | §5; HTTP detection + streaming; Ollama provider tested |
| 6 | AI Provider Router | Local | Y | N | Y | Yes | Yes | §6; capability gating + task routing |
| 7 | Provider Fallback Chain | Local | Y | N | Y | Yes | Yes | §7; errors surfaced clearly, never silent |
| 8 | YouTube Connection (OAuth + Data + Analytics) | YouTube | N | Y | N | Yes | Yes | §8; official OAuth+PKCE+loopback, refresh, minimal scopes |
| 9 | Twitch Connection (Device Flow + Helix) | Twitch | N | Y | N | Yes | Yes | §9; device code flow, refresh, validate; rate-limit aware |
| 10 | Dashboard | Local + platforms | N | optional | cached | Yes | Yes | §10; real data with honest empty states |
| 11 | Channel Health Score | YouTube/Twitch | N | Y | cached | Yes | Yes | §11; formula in SCORING.md; ScorePanel shows inputs + provenance |
| 12 | Video SEO Analyzer | Local + AI | Y | N | Y | Yes | Yes | §12; deterministic core scores + AI qualitative pass |
| 13 | One-Click Optimization | Local | N | N | Y | Yes | Yes | §13; deterministic optimizer pass (core/seo/optimizer.ts), tested |
| 14 | Title Generator | AI | Y | N | N | Yes | Yes | §14; scored locally after generation (title engine tested) |
| 15 | Title A/B Lab | Local + AI | Y | N | Y | Yes | Yes | §15; strengths/weaknesses only, no CTR guarantees |
| 16 | Thumbnail Intelligence | Local CV | N | N | Y | Yes | Yes | §16; real pixel features; face/OCR honestly unavailable |
| 17 | Thumbnail+Title Pair | Local + AI | Y | N | Y | Yes | Yes | §17; pair analyzer in core/scores/thumbnail.ts, tested |
| 18 | Thumbnail Concept Generator | AI | Y | N | N | Yes | No | §18; text concepts via provider generate; image gen not offered |
| 19 | Mobile Thumbnail Test | Local | N | N | Y | Yes | Yes | §19; scaled feed-size previews + measured-feature warnings (core/thumbnail/sizes.ts), tested |
| 20 | Keyword Explorer | Research | Y | N | cached | Yes | Yes | §20; relative demand only, never fake volume |
| 21 | Keyword Clusters | Local + AI | Y | N | cached | Yes | Yes | §21; clustering + content plan, tested |
| 22 | Search Intent Analyzer | Local + AI | Y | N | Y | Yes | Yes | §22; intent classification, tested |
| 23 | Trend Discovery | Web/Research | N | N | cached | Yes | Yes | §23; public RSS/Atom feeds (incl. Reddit .rss) + own momentum; no scraping |
| 24 | Trend Velocity | Local | N | N | Y | Yes | Yes | §24; momentum/freshness from real observations |
| 25 | Opportunity Finder | Local | N | N | cached | Yes | Yes | §25; explainable weighted score (SCORING.md) |
| 26 | Content Gap Analyzer | Local | N | Y | cached | Yes | Yes | §26; competitor topics vs own, tested |
| 27 | Competitor Tracker | YouTube | N | N | cached | Yes | Yes | §27; official uploads-playlist data; YouTube only (documented) |
| 28 | Outlier Detector | Local | N | Y | cached | Yes | Yes | §28; × baseline, no causation claims |
| 29 | Winning Pattern Detection | Local | N | Y | Y | Yes | Yes | §29; confidence + sample size |
| 30 | Content Strategist | AI + data | Y | Y | cached | Partial | No | §30; Copilot page doubles as strategist (briefing-grounded Q&A); no dedicated recommendation list |
| 31 | Video Idea Generator | Local | N | N | Y | Yes | Yes | §31; deterministic plans from keywords + repurposing kit |
| 32 | Content Brief | Local + AI | Y | N | Y | Yes | Yes | §32; completeness check + versioned AI draft prompt |
| 33 | Hook Generator | Local + AI | Y | N | Y | Yes | Yes | §33; deterministic hook scoring + AI candidates always scored locally |
| 34 | Retention Planner | Local | N | N | Y | Yes | Yes | §34; proportional beat timelines per domain mode |
| 35 | Transcript Analyzer | Local + AI | Y | N | Y | Yes | Yes | §35; txt/srt/vtt parsing, real cue timestamps, tested |
| 36 | Retention Analytics | YouTube | N | Y | cached | Yes | Yes | §36; official Analytics API via sync; "Not available" until synced |
| 37 | Shorts Clip Finder | Local | N | N | Y | Yes | Yes | §37; clip plans only from user-supplied source material |
| 38 | Local Video Clipping | FFmpeg | N | N | Y | Yes | Yes | §38; uses user's ffmpeg binary; no download/upload |
| 39 | Livestream SEO | Local + AI | Y | N | Y | Yes | Yes | §39; Stream Optimizer page + stream-title engine |
| 40 | Twitch Category Research | Twitch | N | optional | cached | Yes | Yes | §40; observed Helix sample, "not observed" ≠ zero, tested |
| 41 | Stream Discovery Score | Twitch | N | optional | N | Yes | Yes | §41; explainable score from stored sessions (SCORING.md §16) |
| 42 | Stream Title Assistant | Local + AI | Y | N | Y | Yes | Yes | §42; deterministic live-title engine + improvements list |
| 43 | Stream Checklist | Local | N | N | Y | Yes | Yes | §43; user-editable, persisted; app never ticks items |
| 44 | OBS Integration | OBS | N | optional | Y(local) | Yes | Yes | §44; obs-websocket-js v5 client + health panel, status tested |
| 45 | Conversion Studio | Local | N | Y | cached | Yes | Yes | §45; funnel from stored numbers; members stage unavailable by design |
| 46 | CTA Generator | AI | Y | N | N | Yes | Yes | §46; Members page CTA writer; no hype, no invented cadence |
| 47 | Member Benefit Planner | AI | Y | N | N | Yes | Yes | §47; tier drafting on Members page; never auto-publishes |
| 48 | Community Content Planner | AI | Y | N | Y | Yes | Yes | §48; post drafts + local calendar; posting stays manual |
| 49 | Comment Intelligence | YouTube + AI | Y | Y | cached | Yes | Yes | §49; classification + repeated requests, tested |
| 50 | Content Calendar | Local | N | N | Y | Yes | Yes | §50; month grid + agenda, drag-reschedule |
| 51 | Smart Content Schedule | Local | N | N | Y | Yes | No | §51; plans from own history/goals; never invents best times |
| 52 | Video Performance Monitor | YouTube | N | Y | cached | Yes | Yes | §52; 1h–28d windows from snapshots; "no snapshot"/"not yet" honesty |
| 53 | Early Performance Diagnosis | Local | N | Y | cached | Yes | Yes | §53; packaging/content/discovery hypotheses vs channel medians (core/scores/diagnosis.ts), tested |
| 54 | Post-Publish Optimizer | Local | N | Y | cached | Yes | No | §54; per-video score + median comparison; manual-only actions |
| 55 | Experiment Tracker | Manual | N | N | Y | Yes | Yes | §55; experiments table + page; correlation, not causation |
| 56 | Personal Creator Memory | Local | N | N | Y | Yes | Yes | §56; profile fields incl. goals feed Copilot + weekly plan |
| 57 | Creator Knowledge Base | Local | optional | N | Y | Yes | Yes | §57; FTS + optional local embeddings (Ollama) |
| 58 | Universal AI Chat | AI + data | Y | optional | local AI only | Yes | Yes | §58; Copilot grounded in locally computed briefing |
| 59 | Context Selector | Local | N | N | Y | Yes | Yes | §59; per-section checkboxes; omitted = declared "not shared" |
| 60 | Deep Research | Web + AI | Y | N | N | Yes | Yes | §60; creator-supplied sources; sourced-vs-speculation cards |
| 61 | Source Confidence | Local | Y | N | Y | Yes | Yes | §61; model-attributed confidence, unparseable output shown raw |
| 62 | Content Score Engine | Local | N | N | Y | Yes | Yes | §62; documented weights (SCORING.md), tested |
| 63 | SEO Score Engine | Local | N | N | Y | Yes | Yes | §63; documented model, tested |
| 64 | No Fake Search Volume | Local | N | N | Y | Yes | Yes | §64; invariant enforced (relative demand only), report test asserts it |
| 65 | Data Provenance | Local | N | N | Y | Yes | Yes | §65; ScorePanel prints source + "not official" caveat |
| 66 | No Hallucinated Analytics | Local | N | N | Y | Yes | Yes | §66; "Not available" states; Copilot prompt forbids inventing metrics |
| 67 | Revenue Dashboard | YouTube | N | Y | cached | Yes | Yes | §67; estimatedRevenue via official Analytics sync, source-labelled |
| 68 | Sponsor Readiness | Local | optional | Y | cached | Yes | Yes | §68; operational readiness score + copyable media kit + PDF (core/scores/sponsor.ts), tested |
| 69 | Exports | Local | N | N | Y | Yes | Yes | §69; CSV/JSON/Markdown/PDF/clipboard via OS dialog; PDF writer tested (export/pdf.ts) |
| 70 | Universal Command Search | Local | N | N | Y | Yes | No | §70; Ctrl+K covers all 36 pages + §70 keyword actions (analyze/generate/connect/find/ask) |
| 71 | UI Design System | Local | N | N | Y | Yes | Yes | §71; dark-first tokens, light theme; SSR page smoke tests |
| 72 | Sidebar Navigation | Local | N | N | Y | Yes | Yes | §72; grouped sidebar per spec §72 |
| 73 | Connection Center | Local | N | N | Y | Yes | Yes | §73; configure/connect/sync/disconnect + live provider health |
| 74 | First-Run Wizard | Local | N | optional | Y | Yes | No | §74; 3-step, skippable, remembered locally |
| 75 | Privacy Controls | Local | N | N | Y | Yes | Yes | §75; clear caches/AI history, delete profile, reset app; no telemetry |
| 76 | Secure Credential Storage | OS secure storage (DPAPI via safeStorage) | N | N | Y | Yes | Yes | §76; `auth/secret-store.ts` + tests |
| 77 | SQLite Schema + Migrations | Local | N | N | Y | Yes | Yes | §77; 42 tables across migrations 0001–0004 + FTS5, migration tests |
| 78 | Background Jobs | Local | N | optional | cached | Yes | Yes | §78; job queue + scheduler (refresh-channels, prune-notifications) |
| 79 | Cache System | Local | N | N | Y | Yes | Yes | §79; TTL cache + freshness + AI result cache, tested |
| 80 | Offline Mode | Local | N | N | Y | Yes | Yes | §80; local engines, calendar, scripts, local AI all work offline |
| 81 | Failure Handling | Local | N | N | Y | Yes | Yes | §81; typed provider/platform errors; no full-app crashes |
| 82 | AI Job Queue | Local | Y | optional | local AI only | Yes | Yes | §82; cancellable stateful queue + AI result cache, tested |
| 83 | Prompt System | Local | Y | N | Y | Yes | Yes | §83; prompts in /prompts + page-level named prompts, not in components |
| 84 | Structured AI Output | Local + AI | Y | N | N | Yes | Yes | §84; zod schemas + retry; invalid output never crashes UI |
| 85 | Prompt Injection Defense | Local | Y | N | Y | Yes | Yes | §85; asUntrustedData wrapper (§85) tested via deep-research |
| 86 | AI Usage Visibility | Local | Y | optional | Y | Yes | No | §86; local request counters per provider; quotas not invented |
| 87 | Local Logging + Redaction | Local | N | N | Y | Yes | Yes | §87; ring buffer, levels, copy diagnostics |
| 88 | Update System | Local | N | N | Y | Partial | No | §88; NSIS packaging + read-only GitHub release check in DevTools; never auto-installs (by design) |
| 89 | Developer Tools | Local | N | N | Y | Yes | Yes | §89; provider health, DB status, job queue, acceptance self-check |
| 90 | Test Suite | Local | N | N | Y | Yes | Yes | §90; 48 files / 371 tests, external APIs mocked |
| 91 | Auth Security Tests | Local | N | N | Y | Yes | Yes | §91; PKCE vectors, state mismatch, replay, cancel, timeout, no-plaintext |
| 92 | Implementation Order (§92) | Local | N | N | Y | Yes | Yes | §92; phases 0–8 followed in order per TODO.md |
| 93 | No Mock Data in Production | Local | N | N | Y | Yes | Yes | §93; no mock paths in production; empty states instead |
| 94 | Implementation Audit | Local | N | N | Y | Yes | Yes | §94; docs/INTEGRATION_AUDIT.md, source-backed, last-checked dates |
| 95 | Feature Matrix | Local | N | N | Y | Yes | No | §95; this file (swept 2026-10-01) |
| 96 | Scoring Documentation | Local | N | N | Y | Yes | No | §96; docs/SCORING.md documents all app-defined scores |
| 97 | Privacy Document | Local | N | N | Y | Yes | No | §97; docs/PRIVACY_ARCHITECTURE.md |
| 98 | Build Documentation | Local | N | N | Y | Yes | No | §98; README + SETUP/ARCHITECTURE/DEVELOPMENT/TROUBLESHOOTING |
| 99 | Simple Startup | Local | N | N | Y | Yes | Yes | §99; npm install/dev; NSIS installer via npm run package |
| 100 | Dependency Checker | Local | N | N | Y | Yes | Yes | §100; probes Gemini CLI, Ollama, OBS, ffmpeg, @siwc/local, runtimes |
| 101 | Performance | Local | N | N | Y | Partial | No | §101; built once + cached Home counts (commits); lazy loading/virtualization not systematic |
| 102 | Accessibility | Local | N | N | Y | Partial | No | §102; aria labels present (palette, nav, inputs); full audit not done |
| 103 | Global Filter | Local | N | Y | cached | Partial | No | §103; date-range filtering exists on analytics queries; not a unified global bar |
| 104 | Comparison Mode | Local | N | Y | cached | Yes | Yes | §104; period comparison from real data, tested |
| 105 | Natural Language Analytics | Local + AI | Y | Y | cached | Partial | No | §105; Copilot answers from computed briefing; no NL→query translation layer |
| 106 | Analytics Query Engine | Local | N | N | cached | Yes | Yes | §106; comparison, median/baseline, outliers, patterns, trajectories — all tested |
| 107 | Copilot Read Tools | Local | Y | N | Y | Partial | No | §107; grounding via computed briefing instead of named tool registry (documented) |
| 108 | Safe Write Actions | Local | Y | N | Y | Yes | Yes | §108; AI never writes without explicit UI confirmation; publishing manual only |
| 109 | Multiple Workspaces | Local | N | N | Y | Yes | Yes | §109; independent per-workspace data + sidebar switcher, repo tests |
| 110 | Narrative Content Support | Local | N | N | Y | Yes | Yes | §110; narrative domain mode beat structure, tested |
| 111 | Gaming Intelligence | Local | N | N | Y | Yes | Yes | §111; gaming domain mode, tested |
| 112 | Technology Intelligence | Local | N | N | Y | Yes | Yes | §112; tech domain mode, tested |
| 113 | Stream-to-Content Pipeline | Local | N | N | Y | Yes | Yes | §113; deterministic 5-stage plan from a recorded session, tested |
| 114 | Repurposing Studio | Local | N | N | Y | Yes | Yes | §114; shorts/captions/poll/follow-up/stream/pinned-comment kit, tested |
| 115 | Content Series Detector | Local | N | Y | cached | Yes | Yes | §115; series detection from own history, tested |
| 116 | Evergreen vs Trending | Local | N | N | Y | Yes | Yes | §116; topic classification on Trends, tested |
| 117 | Content Portfolio View | Local | N | Y | cached | Yes | Yes | §117; evergreen/trend/news/seasonal/series shares, tested |
| 118 | Goals | Local | N | N | Y | Yes | Yes | §118; profile goals respected by weekly plan |
| 119 | Progress Tracking | Local + YT | N | Y | cached | Yes | Yes | §119; channel_snapshots migration 0005 + real 30-day deltas; never predicts dates (core/scores/progress.ts) |
| 120 | Notifications | Local | N | N | Y | Yes | Yes | §120; notifications table + toasts + per-type disable (settings + scheduler filter) |
| 121 | Search History | Local | N | N | Y | Yes | Yes | §121; search_history table + clearable UI, repo tested |
| 122 | Favorites | Local | N | N | Y | Yes | Yes | §122; favorites table (competitors) , repo tested |
| 123 | Project Workflow | Local | N | N | Y | Yes | Yes | §123; idea→performance pipeline on Projects, stages tested |
| 124 | Auto-Populate After Publish | Local | N | Y | cached | Yes | Yes | §124; title-similarity linking with confirm, tested |
| 125 | Command Palette | Local | N | N | Y | Yes | Yes | §125; Ctrl+K, navigation + actions, UI smoke tested |
| 126 | Keyboard Shortcuts | Local | N | N | Y | Yes | Yes | §126; Ctrl+K/N/,/R wired in App.tsx |
| 127 | Responsive Desktop Design | Local | N | N | Y | Partial | No | §127; flex layout, min window bounds; 1366×768 + 150% DPI pass not formally done |
| 128 | Data Import (CSV) | Manual | N | N | Y | Yes | Yes | §128; keywords/videos import, RFC4180 parser, merge-safe, tested |
| 129 | Backup / Restore | Local | N | N | Y | Yes | Yes | §129; OS-dialog export/import, WAL checkpoint, no credentials |
| 130 | Platform Plugin Architecture | Local | N | N | Y | Yes | Yes | §130; CreatorPlatform interface, YouTube/Twitch/IG/TikTok adapters |
| 131 | Capability Detection | Local | N | N | Y | Yes | Yes | §131; per-platform capabilities; unsupported features not shown |
| 132 | AI Capability Detection | Local | N | N | Y | Yes | Yes | §132; ModelInfo capabilities gate routing |
| 133 | Model Selector / Task Map | Local | Y | optional | Y | Yes | Yes | §133; per-task provider override select, persisted |
| 134 | AI Consensus Mode | AI | Y | optional | N | Yes | No | §134; explicit opt-in with quota warning; line-overlap comparison |
| 135 | AI Result Cache | Local | Y | N | Y | Yes | Yes | §135; keyed by input hash + prompt name/version, regenerate, tested |
| 136 | Prompt Versioning | Local | Y | N | Y | Yes | Yes | §136; name/version/date stored with cached results |
| 137 | Freshness Badges | Local | N | N | Y | Yes | Yes | §137; relative-age labels; stale never poses as current |
| 138 | Refresh Controls | Local | N | Y | custom | Yes | No | §138; per-page refresh + last-refreshed labels |
| 139 | Background Refresh Settings | Local | N | N | Y | Yes | Yes | §139; manual/hourly/6h/12h/daily, quota-respecting |
| 140 | Rate-Limit Manager | Local | N | N | Y | Yes | Yes | §140; token bucket per platform, tested |
| 141 | SQLite FTS Search | Local | N | N | Y | Yes | Yes | §141; FTS5 over repositories, tested |
| 142 | Embedding Search | Local | optional | N | Y | Yes | Yes | §142; local Ollama embeddings + cosine ranking; FTS fallback, tested |
| 143 | No Required Cloud Backend | Local | N | N | Y | Yes | Yes | §143; loopback callbacks only; no SaaS dependency |
| 144 | Authentication Reality Rule | Local | N | N | Y | Yes | Yes | §144; official flows only; no API-key requirement; no cookie hacks |
| 145 | Subscription Status | Local | N | N | Y | Yes | No | §145; only officially exposed status shown (SIWC sharing flag) |
| 146 | Deep-Op Confirmation | Local | Y | N | Y | Yes | No | §146; provider + workload shown before deep runs |
| 147 | Bulk Mode | Local | Y | optional | Y | Yes | Yes | §147; sequential bulk title scoring (no concurrency) |
| 148 | Monthly Creator Review | Local + AI | Y | Y | cached | Yes | Yes | §148; data-grounded review, export tested |
| 149 | Weekly Action Plan | Local | N | N | Y | Yes | Yes | §149; deterministic Mon–Sun plan, tested |
| 150 | "What should I work on?" | Local | N | N | Y | Yes | Yes | §150; highest-value task finder, tested |
| 151 | Feature Quality Standard | Local | N | N | Y | Yes | Yes | §151; data source + logic + UI states + persistence + tests per slice |
| 152 | TODO Discipline | Local | N | N | Y | Yes | No | §152; TODO.md maintained with phases + honest gaps |
| 153 | Verification Discipline | Local | N | N | Y | Yes | Yes | §153; typecheck/lint/test/build/smoke run each phase |
| 154 | UI Verification | Local | N | N | Y | Partial | No | §154; SSR smoke + manual dev passes; no formal UI audit |
| 155 | Final Acceptance Test | Local | N | Y | N | Partial | Yes | §155; in-app self-check covers local steps; live OAuth needs real accounts |
| 156 | Definition of Done | Local | N | N | Y | Partial | No | §156; remaining: §19, §68, PDF export, live account acceptance |
| 157 | Docs-First Order | Local | N | N | Y | Yes | Yes | §157; audit docs written before implementation per repo history |

> Maintenance: when a slice is implemented, flip `Impl.` to Yes; when it has
> automated coverage, flip `Tested`. Per §151 a feature is only complete when it
> has data source + logic + UI states + persistence + tests.
> Phase-10 gap closure (§19/§53/§68/§69/§70/§88/§119/§120) flipped 2026-10-01.
> Last full sweep: 2026-10-01 against TODO.md and code (see docs/STATUS_AUDIT.md).
