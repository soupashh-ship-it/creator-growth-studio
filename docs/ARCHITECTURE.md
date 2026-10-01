# Architecture

Creator Growth Studio — local-first Windows creator intelligence suite.

- Authored: 2026-09-30
- Companion docs: `INTEGRATION_AUDIT.md` (external contracts), `SCORING.md`
  (score formulas), `PRIVACY_ARCHITECTURE.md` (data map), `FEATURE_MATRIX.md`.

---

## 1. Principles

1. **Local-first.** SQLite + on-disk files. No backend we operate (§143).
2. **Real functionality before polish** (§92). A feature ships with a data
   source, business logic, UI states, persistence, and tests (§151).
3. **No fake data** (§10, §93, §64, §66). Missing data renders "Not available".
4. **Provenance everywhere** (§65): every metric carries `source`, `updatedAt`,
   and `kind` (`official | derived | ai_estimate`).
5. **Graceful degradation** (§81): every integration has explicit failure states
   and the app never crashes because one provider is down.
6. **Secrets never in plaintext** (§76).

---

## 2. Shell decision: Tauri vs Electron

**Decision: Electron + React + TypeScript + Vite.**

> This is an explicit deviation from the prompt's "prefer Tauri" guidance. The
> spec permits Electron "if a technical limitation makes Tauri significantly
> worse" provided the reason is documented. Two concrete limitations drive it:
>
> 1. **No Rust toolchain is available in the build environment** (`cargo` and
>    `rustc` are absent). A Tauri build cannot be produced, run, or verified at
>    all, which directly violates the spec's "verify everything" requirement
>    (§153) and the Definition of Done (§156).
> 2. **OpenAI's officially supported ChatGPT plan-usage SDK is Node-only**
>    (`@siwc/local`, `@siwc/react`). With Tauri this would require a bundled Node
>    sidecar anyway — i.e. an Electron-shaped process — while adding the Rust
>    layer and the sidecar both.
>
> Node 24 is present, and its built-in `node:sqlite` removes the need for any
> native SQLite build step. Electron is therefore the genuinely working choice.

Rationale:

| Criterion | Tauri 2 | Electron (chosen) |
|---|---|---|
| Buildable in this environment | ❌ needs Rust/cargo (missing) | ✅ Node only |
| Official ChatGPT SIWC SDK | Node sidecar required | ✅ native |
| SQLite | Rust crate | ✅ `node:sqlite` built-in (no native build) |
| Secret storage | OS keyring crate | ✅ `safeStorage` (DPAPI on Windows) |
| Loopback OAuth, child processes | Rust `std::net`/`std::process` | ✅ Node `http`, `child_process` |
| Installer size / RAM | smaller | larger (~150 MB Chromium) — accepted trade-off |

Shell/backend split:

- **Main process (Node):** SQLite + migrations, secure secret storage, OAuth
  loopback server, PKCE/crypto, HTTP clients, child processes (Gemini CLI,
  FFmpeg), filesystem, exports, job scheduler, rate limiter, AI providers.
- **Renderer (React):** presentation, local UI state, forms, charts.
- **Bridge:** a `contextBridge`-exposed, typed IPC surface. The renderer never
  receives raw tokens, the DB handle, or a Node API — only serialized,
  non-secret view models.

---

## 3. Directory layout (spec §2)

```
/
├─ app/                    # Renderer: index.html + React app (Vite root)
│  └─ src/
│     ├─ App.tsx, navigation.ts, main.tsx
│     └─ (routes/, components/, features/, state/, styles/ as they land)
├─ desktop/                # Electron shell
│  ├─ main.ts              # main process entry
│  └─ preload.ts           # contextBridge IPC surface
├─ core/                   # platform-agnostic TS domain logic (pure)
│  ├─ models/              # normalized entities + zod schemas
│  ├─ scores/              # score engine (pure, unit-tested)
│  └─ format/              # numbers, dates, freshness badges
├─ providers/              # AI providers
│  ├─ openai/              # ChatGPT via official SIWC devkit
│  ├─ gemini/              # Gemini CLI headless adapter
│  ├─ local-ai/            # Ollama + LM Studio
│  └─ router.ts            # task→provider mapping, fallback chain
├─ platforms/              # creator platforms
│  ├─ youtube/
│  ├─ twitch/
│  ├─ instagram/           # architecture-ready stub
│  └─ tiktok/              # architecture-ready stub
├─ analytics/              # query engine + derived metrics
├─ research/               # keyword/trend/gap/opportunity engines
├─ seo/                    # SEO analyzer + optimizer
├─ ai/                     # prompt registry, tools, structured output, memory
├─ database/               # connection, migrate.ts, migrations/*.ts
│  └─ migrations/
├─ auth/                   # pkce, state, loopback, errors, secret-store
├─ jobs/                   # background scheduler + AI job queue
├─ export/                 # pdf/csv/json/markdown/clipboard
├─ prompts/                # prompt templates (versioned)
├─ tests/                  # unit, integration, provider, db, oauth fixtures
└─ docs/                   # this documentation set
```

Rules: `core/`, `providers/`, `platforms/` and `auth/` must not import UI or
Electron directly (the OS encryptor is injected — see §11). The renderer imports
`core/` models and calls IPC; it never talks to an API directly.

---

## 4. Runtime topology

```
┌─────────────── Electron main process (Node) ──────────────────────────┐
│   ├─ SQLite via node:sqlite (WAL) ── migrations, repositories, FTS5    │
│   ├─ safeStorage (DPAPI) ── encrypted secret store                     │
│   ├─ OAuth loopback server (127.0.0.1:0, ephemeral)                    │
│   ├─ Platform clients (YouTube, Twitch) ── rate limiter                │
│   ├─ AI provider clients ── router ── fallback chain                   │
│   ├─ Child processes: gemini CLI, ffmpeg/ffprobe                       │
│   ├─ Job scheduler + AI job queue + cache                              │
│   └─ IPC surface (typed, non-secret only)                              │
│        ▲ contextBridge                                                │
│  Renderer (React/TS/Vite) ── UI only, no secrets, no Node              │
└────────────────────────────────────────────────────────────────────────┘
        │ HTTPS                          │ ws://127.0.0.1:4455
        ▼                                ▼
  Google / Twitch / OpenAI / Gemini      OBS WebSocket
```

---

## 4a. Data-flow guarantees

- Numbers shown in the UI are either **official** (from a platform API),
  **derived** (computed locally from official inputs), or **ai_estimate**
  (labelled). Each carries provenance (§65).
- AI **never** invents metrics. If asked for analytics, the copilot calls an
  internal read tool against SQLite (§105–107) and interprets the returned
  numbers. Raw tables are not dumped to the model.
- External text (descriptions, comments, transcripts, web pages) enters prompts
  as **data** inside a fenced block, never as instructions (§85).

---

## 5. AI provider abstraction (spec §6, §132)

```ts
export type TaskKind =
  | 'deep-research' | 'analytics-interpretation' | 'thumbnail-reasoning'
  | 'title-generation' | 'bulk-tagging' | 'transcript-analysis'
  | 'chat' | 'structured-extraction';

export interface ModelInfo {
  id: string;
  displayName: string;
  capabilities: {
    text: boolean; vision: boolean; reasoning: boolean;
    largeContext: boolean; structuredOutput: boolean; streaming: boolean;
  };
}

export interface GenerationRequest {
  task: TaskKind;
  system?: string;
  input: string;
  temperature?: number;
  maxTokens?: number;
  jsonSchema?: unknown;      // structured output (§84)
  images?: Uint8Array[];     // multimodal
}

export interface GenerationResult {
  text: string;
  json?: unknown;
  modelId: string;
  providerId: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  finishReason: 'stop' | 'length' | 'cancelled' | 'error';
}

export interface StreamCallbacks {
  onDelta(chunk: string): void;
  onDone(result: GenerationResult): void;
  onError(err: ProviderError): void;
}

export interface ProviderHealth {
  available: boolean;
  authenticated: boolean;
  detail: string;
  checkedAt: string;
}

export interface AuthResult { ok: boolean; accountLabel?: string; error?: string; }

export interface AIProvider {
  id: 'chatgpt' | 'gemini' | 'ollama' | 'lmstudio';
  displayName: string;
  authenticate(): Promise<AuthResult>;
  disconnect(): Promise<void>;
  isAvailable(): Promise<boolean>;
  getModels(): Promise<ModelInfo[]>;
  generateText(req: GenerationRequest): Promise<GenerationResult>;
  streamText(req: GenerationRequest, cb: StreamCallbacks): Promise<void>;
  healthCheck(): Promise<ProviderHealth>;
  supportsPlanUsage?(): Promise<boolean>;
}
```

### 5.1 Router

`providers/router.ts` maps `TaskKind` → ordered provider preference, honouring
capability requirements (e.g. `thumbnail-reasoning` requires `vision`). Manual
override wins over auto. User can configure task→model mappings (§133).

Default preference:

| Task | Preferred | Then |
|---|---|---|
| deep-research | ChatGPT | Gemini → local |
| analytics-interpretation | ChatGPT (reasoning) | Gemini → local |
| title-generation | Gemini (fast) | ChatGPT → local |
| bulk-tagging | Ollama/LM Studio | Gemini → ChatGPT |
| thumbnail-reasoning | any `vision` model | else "no vision model available" |
| structured-extraction | any `structuredOutput` model | retry then error |

### 5.2 Fallback chain (§7)

`ChatGPT → Gemini → LM Studio → Ollama`. A workflow fails only when **all**
providers are unavailable/unauthorised; then the UI shows which provider failed
and why, with a retry.

### 5.3 ChatGPT provider specifics

Uses the official devkit SDK in the **main/Rust-adjacent process only**. If the
SDK is genuinely unavailable locally, the provider reports `not configured` (with
devkit install instructions) — it is never replaced by a cookie/session hack.
`session.sharing` gates AI access. See `INTEGRATION_AUDIT.md` §1.

### 5.4 Gemini provider specifics

Spawns `gemini -p <prompt> --output-format stream-json`, parses JSONL
(`message` chunks → deltas, `result` → done, `error` → error), maps exit codes
(`0/1/42/53`). Model selection is probed at runtime. Cancellation kills the
child. See `INTEGRATION_AUDIT.md` §2.

---

## 6. Database schema (spec §77)

SQLite, WAL mode, `PRAGMA foreign_keys=ON`. Every table carries
`id TEXT PRIMARY KEY` (UUIDv7), `created_at`, `updated_at`. Tables marked
`(ws)` are scoped by `workspace_id` for §109 multi-workspace isolation.

### Core / identity
- `workspaces(ws)`
- `accounts(id, workspace_id, provider, external_id, label, issuer, subject)`
- `platform_connections(id, workspace_id, platform, account_id, status, scopes_json, expires_at)`
- `ai_connections(id, workspace_id, provider, account_id, status, plan_usage_enabled, granted_scopes_json, profile_ref)`
- `settings(scope, key, value_json)` — app + workspace scoped
- `provider_usage(id, workspace_id, provider, model, task, ts, input_tokens, output_tokens, requests)`
- `ai_sessions(ws)`, `ai_messages(session_id, role, content, tool_calls_json, prompt_name, prompt_version)`
- `ai_result_cache(id, input_hash, prompt_name, prompt_version, provider, model, result_json, created_at)`

### Platform data
- `channels(ws, platform, external_id, title, description, thumb_url, stats_json, fetched_at)`
- `videos(ws, platform, channel_id, external_id, title, description, published_at, duration_s, tags_json, category, thumb_url, metadata_json)`
- `video_snapshots(video_id, at, views, likes, comments, ctr, impressions, avg_view_duration_s, avg_view_pct, subs_gained, revenue_micros, source)` — `source` = `official|derived`
- `streams(ws, platform, external_id, title, category, started_at, ended_at, peak_viewers, avg_viewers)`
- `stream_snapshots(stream_id, at, viewers, followers, source)`
- `comments(ws, platform, video_id, external_id, author, body, published_at, like_count)`

### Research
- `keywords(ws, term, intent, relative_demand, trend_index, competition_estimate, opportunity, freshness, source)`
- `keyword_snapshots(keyword_id, at, trend_index, competition_estimate)`
- `keyword_clusters(ws, keyword_id, cluster_label, parent_label)`
- `trends(ws, topic, source, momentum, freshness, first_seen, last_seen, raw_json)`
- `competitors(ws, platform, channel_external_id, label, notes)` + `competitor_videos(competitor_id, video_id)`
- `content_gaps(ws, topic, demand, competitor_coverage, user_coverage, gap_score)`

### Production
- `content_ideas(ws, title, angle, format, why_now, keywords_json, status)`
- `video_projects(ws, title, stage, idea_id)` — stage per §123
- `project_assets(project_id, kind, ref, content)` — scripts, briefs, thumbnails
- `calendar_items(ws, project_id, kind, scheduled_at, status)`
- `experiments(ws, video_id, kind, changed_at, before_json, after_json)`
- `seo_reports(ws, project_id, input_json, scores_json, insights_json, prompt_name, prompt_version, created_at)`
- `thumbnail_reports(ws, project_id, image_ref, scores_json, insights_json, created_at)`
- `research_reports(ws, topic, body_md, sources_json, confidence, created_at)`
- `creator_profile(ws, niche, topics_json, language, audience, goals_json, ...)`
- `creator_memory(ws, kind, key, value_json)` — §56
- `knowledge_docs(ws, path, title, hash)` + `knowledge_chunks(doc_id, chunk, embedding BLOB)`
- `notifications(id, workspace_id, type, payload_json, read_at, created_at)`
- `search_history(ws, query, scope, created_at)`; `favorites(ws, entity_type, entity_id)`
- `jobs(id, workspace_id, kind, state, payload_json, result_ref, error, queued_at, started_at, finished_at, cancel_requested)`
- `cache_entries(key, value_json, expires_at, source)` — TTL cache (§79)

### Search (§141)
FTS5 virtual tables mirroring `videos`, `video_projects`, `comments`,
`research_reports`, `content_ideas`, `transcripts`. Embeddings optional (§142).

### Migrations
Numbered `NNNN_name.up.sql` under `database/migrations/`, applied transactionally
with a `schema_migrations(version, applied_at)` ledger. Migrations are forward-only
in production; dev reset via `npm run db:reset`.

---

## 7. Platform abstraction (spec §130–131)

```ts
export type Capability =
  | 'channel' | 'content' | 'analytics' | 'search' | 'comments'
  | 'streams' | 'clips' | 'vods' | 'schedule' | 'members' | 'revenue';

export interface PlatformCapabilitySet {
  platform: 'youtube' | 'twitch' | 'instagram' | 'tiktok';
  capabilities: Capability[];
  requiresConnection: Capability[];
}

export interface CreatorPlatform {
  readonly id: string;
  readonly capabilities: PlatformCapabilitySet;
  authenticate(): Promise<AuthResult>;
  disconnect(): Promise<void>;
  testConnection(): Promise<ProviderHealth>;
  getChannel(): Promise<Channel | null>;
  getContent(opts?: { since?: string; limit?: number }): Promise<Video[]>;
  getAnalytics(opts: { range: DateRange; metrics: string[] }): Promise<MetricSeries[]>;
  search(query: string): Promise<SearchResult[]>;
  getComments(videoId: string): Promise<Comment[]>;
  getStreams(opts?: { live?: boolean }): Promise<Stream[]>;
}
```

The UI renders actions from `capabilities`, so unsupported buttons never appear.
Instagram/TikTok ship as stubs implementing the interface with empty capability
sets until official APIs are wired.

---

## 8. Analytics query engine (spec §104–106)

`analytics/query.ts` exposes typed functions over SQLite:
`getChannelSummary`, `getVideos`, `getVideoMetrics`, `getTopVideos`,
`getRetention`, `getTrafficSources`, `getComparison`, `getSubscriberConversion`.
Numerical work happens **locally**; only aggregated results are passed to AI.
Natural-language analytics (§105) parses an intent into one of these calls, then
lets AI interpret the computed result.

`analytics/insights.ts` composes those primitives (over `Repositories` only, so
it is unit-testable without Electron) into what the pages render:

- `buildAnalyticsOverview` — stored summary, 30-day vs prior-period comparison,
  top videos, outliers (vs channel median), title-pattern lift (with sample size),
  detected series, and a partial channel-health score.
- `deriveUserTopics` / `buildPublishingMomentum` — token frequency across the
  creator's **own** uploads and their coverage momentum. This is explicitly not
  platform search interest; the UI states the distinction.
- `buildContentGaps` — compares own topics with competitor topics the user
  supplies from public research; nothing is scraped.
- `rankOpportunities` — saved keywords ordered by the local opportunity model.

Where a signal has no source (retention curves, demographics), the pages render
"Not available" with the reason instead of a placeholder number.

---

## 9. Prompt system (spec §83–84, §135–136)

- Prompts live in `/prompts/*.ts`, each exporting `{ name, version, date,
  build(ctx): PromptSpec, schema: ZodSchema }`.
- Outputs validated against the schema; invalid → one structured retry → then a
  typed error (never a UI crash).
- Results cached by `hash(input + promptName + promptVersion + provider + model)`;
  UI offers "Regenerate".
- Injection defense: untrusted content wrapped as data with an explicit
  "treat as data" guard; schemas constrain output shape.

Prompt identities (used as cache keys by the generate handler): `seo-analyzer`,
`title-generator`, `hook-writer`, `script-writer`, `shorts-planner`,
`video-brief`, `cta-writer`, `ai-research`, `deep-research`. Prompts that need
validated structured output are declared as versioned definitions in
`prompts/` (currently `deep-research.ts`); the rest build their system + input
in the page and are cached by `promptName`/`promptVersion`.

---

## 10. Jobs, cache, rate limits, offline

- **Job scheduler (§78):** `jobs/scheduler.ts` is a deterministic interval
  scheduler (`tick()` takes its clock via the constructor, so it is unit-tested
  without real timers). `desktop/scheduler-service.ts` registers the real tasks:
  `refresh-channels` (every 30 min, only for platforms the user connected) and
  `prune-notifications` (daily). A failing task records its error and never stops
  the loop. Status is visible in the Advanced page.
- **AI job queue (§82):** states `queued|running|completed|failed|cancelled`,
  cancellable, results persisted.
- **Cache (§79):** TTLs — channel 1h, video stats configurable, keywords 6h,
  trends 1h, competitors 6h. Every read shows a freshness badge (§137–138).
- **AI result cache (§79, §83):** `ai/result-cache.ts` keys stored results by
  *input hash + prompt name + prompt version* (`ai_result_cache` table). Editing a
  prompt or bumping its version invalidates prior results; the UI offers
  **Regenerate** to bypass and overwrite the entry. Clearing is available from the
  Data page and the command palette.
- **Rate limiter (§140):** one central token bucket per platform; queued +
  backoff on 429; no uncontrolled parallel platform calls (§101).
- **Offline (§80):** all reads served from SQLite; writes queued; local AI and
  local file tools keep working. Online-only actions are disabled with a reason.

---

## 11. Security (§76, §91)

- Secrets (OAuth tokens/refresh tokens, OBS password) are encrypted with
  **Electron `safeStorage`** (Windows DPAPI) through an injected `Encryptor`
  (`auth/secret-store.ts`). Only ciphertext is persisted, never plaintext, and
  never logged. The store refuses to write when OS encryption is unavailable.
- PKCE (`S256`), random `state`, `nonce`; callback bound to `127.0.0.1` on an
  ephemeral port; state mismatch/expired code/replayed code are rejected.
- Structured redaction in the logger (any key matching
  `token|secret|password|code|cookie|authorization` is replaced).
- Safe writes (§108): AI-initiated platform changes require explicit UI
  confirmation; AI can never publish autonomously.

---

## 12. Build & packaging (§88, §99)

- Dev: `npm install` → `npm run dev` (electron-vite dev; no manual backend).
- Prod: `npm run build` → `electron-vite build`; `npm run package` →
  `electron-builder` → `.exe`/MSI installer.
- Update support uses signed artifacts (§88); arbitrary executable replacement
  is not implemented.
- Dependency checker (§100) (`desktop/dependencies.ts`) probes the Gemini CLI and
  Ollama binaries on `PATH` and the OBS WebSocket port `127.0.0.1:4455`, and
  reports Node/Electron versions. Results render in the Advanced page. Only
  selected features require the optional tools; nothing is installed for you.

---

## 14. Connection, data & notification services

- **Platform connections (`desktop/platform-service.ts`):** owns the live
  YouTube/Twitch adapters. The OAuth **client** (id + Google secret) is supplied
  by the user and stored in the encrypted secret store, never the database. It
  exposes `listPlatforms`, `configurePlatform`, `connectPlatform`
  (Google loopback+PKCE, Twitch device-code), `completeDeviceSignIn`,
  `disconnectPlatform`, and `syncPlatform` (persists the channel + recent
  uploads through the repositories, which feeds the Dashboard).
- **Dashboard (`desktop/dashboard-service.ts`):** composes repositories,
  `AnalyticsQuery` and the channel-health engine into a single honest summary.
  Channel health is computed only from stored engagement totals, so coverage is
  partial and labelled as such; with no synced channel it returns `null` and the
  UI shows "Connect YouTube to view analytics".
- **Backup & maintenance (`desktop/backup.ts`):** export/restore via OS dialogs
  (WAL checkpoint before copy, reopen after restore), `PRAGMA integrity_check`,
  `VACUUM`. Exposed on the Data page.
- **Notifications (`jobs/scheduler.ts` → `notifications` table):** the scheduler
  writes a local notification when a refresh changes data; the sidebar bell reads
  them and can mark them read. Nothing leaves the machine.
- **Stream research (`desktop/stream-service.ts` + `research/stream-research.ts`):
  compares Twitch categories using official Helix live data only. The client
  scans up to 3 pages (100 streams each) and labels every number an **observed
  sample (lower bound)**; categories absent from the sample are "not observed",
  never zero. The creator's own sessions live in the `streams` table and are
  updated by a live-session sync (peak-so-far while live). The discovery score
  and its explanation come from the §5 engine in `docs/SCORING.md`.
- **Writing tools (`core/writing/*`):** deterministic local engines (hook
  strength, script structure review, shorts review, brief completeness) do the
  scoring; the versioned AI prompts (built in the pages and cached by
  name/version) only draft content and are forbidden from producing metrics. AI
  candidates are always re-scored locally before display.
- **Stream → content pipeline (`core/writing/stream-pipeline.ts`, §113):** a
  deterministic 5-stage plan built from one recorded `streams` session (keep the
  VOD, mine clips, publish a standalone short, post to the community, seed the
  next stream). Clip count comes only from session length; no clip timestamps or
  performance numbers are invented, and cutting/posting stay manual.
- **Domain modes (`core/writing/domain-modes.ts`, §110–112):** general, narrative,
  gaming and tech beat structures. The Scripts page checks which beats appear in
  the creator's own outline via keyword matching and reports a completeness
  figure plus hook guidance and derivative angles. It is a checklist, not a
  quality score, and never uses performance data.
- **AI Research page (§60–61):** grounds every run in material the creator
  supplies plus the aggregated local briefing; the versioned prompt
  (`prompts/deep-research.ts`) asks for structured findings and the system prompt
  requires separating sourced facts from speculation. The app parses the model
  text tolerantly (`parseDeepResearch`: fenced blocks → outermost braces → raw)
  and renders claim/source/confidence cards; output that fails to parse is shown
  raw rather than dropped. Source and confidence are the model's own attribution,
  not verified facts.
- **Creator memory & knowledge (`desktop/memory-service.ts`):** the profile
  (§56) feeds the Copilot briefing; knowledge documents (§57) live in
  `knowledge_docs` + `knowledge_chunks` and are indexed into the
  `search_transcripts` FTS table, powering search and "Ask Creator Knowledge"
  (grounded Q&amp;A that must say when nothing matched). Search history (§121)
  and favorites (§122) reuse their schema tables.
- **Semantic search (`core/vectors.ts` + `desktop/knowledge-service.ts`, §142):**
  a local embedding provider (Ollama `embedTexts`) embeds knowledge chunks into
  `knowledge_chunks.embedding` as float32 BLOBs; queries rank chunks by cosine
  similarity. When no local provider is available, search transparently falls
  back to FTS — text is never shipped to a remote API for embedding.
- **External trend signals (`research/feeds.ts` + `desktop/feed-service.ts`, §23):**
  a dependency-free RSS 2.0/Atom parser and topic extractor over public feeds the
  creator adds (news, blogs, Reddit `.rss`). Observed topics land in the `trends`
  table with the titles that produced them — no scraping, no search-volume claim.
- **Local clip export (`core/media/ffmpeg.ts` + `desktop/ffmpeg-service.ts`, §38):**
  builds ffmpeg arguments (stream-copy or frame-accurate re-encode) and runs the
  binary the creator already has; missing ffmpeg reports a clear instruction.
  Nothing is downloaded or uploaded.
- **YouTube Analytics (`platforms/youtube/analytics.ts` +
  `desktop/analytics-sync-service.ts`, §36/§67):** official `reports.query`
  builders for per-video impressions/CTR/avg-view %/revenue, audience age/gender
  and retention curves. Results are stored in `video_snapshots` and the
  migration-4 tables `audience_demographics` / `video_retention`; the Retention
  and Audience pages render them (or "Not available").
- **Acceptance self-check (`desktop/acceptance-service.ts`, §155):** runs every
  locally exercisable end-to-end step (migrations, workspace, providers, tools,
  embeddings, credentials) and reports `pass` / `fail` / `blocked`; steps that
  need a real credential are `blocked`, never a pass or a failure.
- **Planning (`core/planning/weekly.ts`):** deterministic weekly plan and
  "What should I work on?" recommender over calendar items, projects, keywords,
  goals and upload history — no invented posting times, returns null when
  nothing is actionable.
- **Project ↔ video linking (`core/planning/link-projects.ts`, §124):** matches
  project titles to published-video titles with a transparent token heuristic
  (Jaccard + containment + substring bonus). It is title-only, never uses
  analytics, proposes one-to-one candidates, and only applies "confident"
  matches (≥0.7) on the creator's click; `videos.project_id` holds the link.
- **Logging & developer tools (`desktop/logger.ts`, DevTools page):** redacted
  in-memory ring buffer (1000 entries, level filter), diagnostics bundle for
  copy/paste, and one status page over providers, platforms, database and the
  job queue (§87, §89).
- **Usage & consensus (`desktop/usage-service.ts`):** local per-provider request
  counters (what this app sent — not provider quotas) and an explicit,
  user-initiated two-provider comparison with a quota-cost warning (§86, §134).
- **CSV import (`data:importCsv`):** OS open dialog; keyword files need a
  `term`/`keyword` column, video files a `title`; rows merge by natural key so
  double imports do not duplicate (§128).

---

## 13. Testing strategy (§90–91)

- Unit: score engine, formatters, parsers (pure TS, can run without shell).
- DB: migrations up/apply/idempotency, repositories, FTS.
- Provider: mocked HTTP/CLI fixtures; no live network in CI.
- Auth: PKCE vector, state/nonce rejection, expired/refresh flow, wrong callback,
  cancelled login, replay, multi-account, disconnect.
- UI smoke: every renderer page is rendered with `react-dom/server` in the Node
  test environment — no browser required — and data-driven pages are asserted to
  degrade to an honest state without the desktop bridge.
- Image analysis: `core/thumbnail/pixels.ts` is tested with synthetic buffers
  (flat, split, coloured subject, BGRA byte order, honesty of unavailable
  features). The Electron decode path is additionally exercised by the packaged
  smoke test (`nativeImage` encode → decode → analyse → score).
- Acceptance (§155) is a manual/E2E script documented in `DEVELOPMENT.md`.
