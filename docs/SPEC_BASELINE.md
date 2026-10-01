# SPEC BASELINE — StreamBoost AI / Creator Growth Studio
Condensed reference copy of the original project specification (157 sections),
kept so any future session can verify work against it without the original text.
Rule of thumb: every score explainable, no fabricated analytics, no fake search
volume, official auth only, local-first, real functionality before UI polish.

## Hard constraints (always in force)
- No bots/fake engagement/spam; growth only via better SEO/content/packaging.
- No scraping logins, no cookie/session-token theft, no platform TOS violations.
- Never fabricate: views, CTR, retention, search volume, subs, revenue, competitor stats. Missing = "Not available".
- Every displayed metric needs provenance (Source / Updated / Calculation / Confidence).
- Never silently edit published platform content; user confirms every write.
- AI external content (descriptions, comments, web pages, transcripts) is DATA, never instructions (§85).
- Secrets never logged; tokens in OS-encrypted storage (DPAPI/safeStorage), not plain JSON.
- Real data first; mock data only in tests, labelled MOCK in dev previews (§93).

## Auth & AI (§3–7, §133–134, §144–146)
- §3 ChatGPT: official "Sign in with ChatGPT" open-source flow (OAuth+PKCE, dynamic client, plan usage) via current OpenAI docs; no API key requirement; no password/cookie scraping; clear errors when plan usage unavailable; disconnect/reconnect.
- §4 Gemini: via official Gemini CLI (detect install, guide install, headless/JSON mode, exit codes, timeouts; CLI owns Google credentials; no scraping gemini.google.com).
- §5 Local AI: Ollama (localhost:11434, model detection), LM Studio (localhost:1234/v1).
- §6 AIProvider interface (authenticate/disconnect/isAvailable/getModels/generateText/streamText/healthCheck) + router (Auto: task→model class) + manual override.
- §7 Fallback chain ChatGPT→Gemini→local; show provider errors clearly.
- §133 Task→model mapping settings. §134 Consensus mode only on explicit request (doubles usage).
- §144 If no legitimate subscription-sharing exists, document it; never hack it.
- §146 Show provider + depth + estimated workload before deep runs.

## Platform connections (§8–9, §130–131)
- YouTube: official OAuth, minimal scopes, show scopes pre-login, secure tokens, disconnect; channel/uploads/public video metadata/stats/playlists/comments/Analytics/search.
- Twitch: official OAuth (incl. device flow); broadcaster/categories/clips/VODs/schedule/followers/analytics where authorized; respect rate limits.
- Instagram/TikTok: architecture-ready stubs, typed not_configured, no fake data.
- §130 CreatorPlatform adapter interface with capability detection (§131) — never show buttons for unsupported features.

## Feature modules (by spec §)
- §10 Dashboard: real data, honest empty states ("Connect YouTube to view analytics").
- §11 Channel Health 0–100 transparent (discovery/retention/engagement/consistency/conversion) + "Why this score?".
- §12–13 SEO Analyzer (title/keyword/description/intent/competition/etc. + high-impact improvements + predicted score) + "Optimize Everything" (titles/description/tags/hashtags/pinned comment/thumbnail brief/chapters/hooks/CTAs/shorts ideas).
- §14–15 Title Generator (scored categories, reasoning) + Title A/B Lab (likely strengths/weaknesses, no guaranteed CTR claims).
- §16–19 Thumbnail intelligence: pixel analysis (contrast, clutter, focal point, text amount...), honest unavailability for face/OCR; pair analyzer (title/thumb duplication); concept generator; mobile size preview (100/50/25%).
- §20–25 Keyword Explorer (relative demand only, no fake volume), clusters + content plan, search intent classifier, trend discovery (legit public sources: suggestions, Google Trends if legit, Twitch categories, RSS, Reddit .rss — no anti-bot bypass), trend velocity, opportunity finder (explainable score).
- §26–29 Content gaps, competitor tracker (public data only), outlier detector (× baseline, no causation claims), winning pattern detection (confidence + sample size).
- §30–34 AI strategist, idea generator (10 angles), content brief, hook generator (modes), retention planner (beats with reasons).
- §35–37 Transcript analyzer (.txt/.srt/.vtt; slow sections, filler, weak CTA; timestamps only when present), retention analytics (real API data only, hypotheses not causes), Shorts clip finder (from real transcripts; no invented timestamps).
- §38 Local clipping via FFmpeg (user-provided binary; presets Shorts/TikTok/Reels/16:9; no cloud upload).
- §39–44 Live: stream SEO optimizer (titles/desc/tags/ talking points/CTAs), Twitch category research (real Helix numbers only, "not observed" ≠ 0), discovery score (explainable), title assistant with live score, pre-live checklist (user-editable), OBS WebSocket integration (detect running/scene/streaming/stats; no setting changes without action).
- §45–49 Conversion studio (funnels from real numbers), CTA generator (no hype), member benefit planner (no auto-publish), community content planner (8 post types), comment intelligence (classify + repeated-request detection feeding research).
- §50–55 Calendar (month/agenda, drag-drop, statuses idea→published), smart schedule (only from real audience data; never invented best times), performance monitor (1h–28d windows from snapshots; "no snapshot" honesty), early diagnosis (impressions/CTR/retention interpretation), post-publish optimizer (manual actions only), experiment tracker (correlation not causation).
- §56–58 Creator memory (niche/topics/goals influence AI), knowledge base (local docs + FTS/embeddings + Ask), universal Copilot chat grounded in permitted local context.
- §59 Context selector (checkboxes per data source; excluded = declared "not shared").
- §60–61 Deep research mode (structured report, real sources with URL + retrieved time, never fabricated citations; confidence High/Med/Low with explanation).
- §62–63 Content opportunity + SEO score engines with documented weights.
- §64 NO FAKE SEARCH VOLUME (relative demand/trend index/competition estimate only).
- §65 Provenance everywhere. §66 No hallucinated analytics ("Not available").
- §67 Revenue dashboard only from connected official data (label official/calculated/AI-estimate).
- §68 Sponsor readiness from operational metrics + media-kit/pitch generation.
- §69 Exports PDF/CSV/JSON/Markdown/Clipboard.
- §70/§125 Command palette Ctrl+K. §126 Shortcuts (Ctrl+K/N/,/R).
- §71–72 UI: dark-first, modern 2026 desktop polish (Linear/Arc/Raycast vibe, no neon cyberpunk); sidebar nav groups HOME/CREATE/RESEARCH/ANALYTICS/LIVE/COMMUNITY/PLANNING/AI/SETTINGS.
- §73 Connection Center cards with Connect/Disconnect/Test/Details.
- §74 First-run wizard, skippable steps. §75 Privacy: local-first notice, no telemetry unless opt-in, data controls (clear cache/AI history/disconnect/delete profile/reset).
- §76 Credential security (DPAPI, redaction in logs). §77 SQLite (40+ tables incl. accounts, channels, videos, snapshots, keywords, trends, competitors, projects, calendar, experiments, reports, creator_profile, ai_sessions, provider_usage, settings) + migrations.
- §78 Background jobs (refresh channels/competitors/trends/snapshots; rate-limit aware, pause offline). §79 Cache TTLs. §80 Offline mode. §81 Graceful failure states (never crash whole app).
- §82 AI job queue (queued/running/completed/failed/cancelled, persist results).
- §83–84 Prompts in /prompts (versioned) with structured JSON output + zod validation + retry; never crash UI on invalid.
- §86 Usage visibility (local counts; don't invent quotas).
- §87 Logs page (levels, copy diagnostics, redacted). §88 Update-safe architecture. §89 Developer tools (provider health, DB status, auth status, job queue, cache).
- §90–91 Tests (unit/integration/provider/db/score/OAuth security: PKCE, state, nonce, expiry, refresh, replay, cancel, multi-account).
- §92 Build order: architecture→db→auth→AI→YouTube→Twitch→normalization→analytics→SEO→research→AI workflows→UI polish→tests→packaging.
- §95 docs/FEATURE_MATRIX.md (Feature/Source/AI?/Account?/Offline?/Implemented?/Tested?/Notes) — must be kept current.
- §96 docs/SCORING.md documenting every score (inputs/weights/normalization/missing-value/confidence/limits).
- §97 docs/PRIVACY_ARCHITECTURE.md. §98 README + SETUP/ARCHITECTURE/DEVELOPMENT/TROUBLESHOOTING.
- §99 npm install/dev; Windows installer (.exe NSIS) for production.
- §100 Dependency checker (FFmpeg, Gemini CLI, OBS, Ollama, LM Studio; optional).
- §101 Performance (fast start, 60fps, lazy loading, virtualized lists). §102 Accessibility. §127 Works at 1366x768 and 125-150% Windows scaling.
- §103-104 Global filters (platform/channel/range 7d-lifetime/custom) + period comparison (real data only).
- §105-107 Natural-language analytics over LOCAL query engine; Copilot read tools (get_channel_summary, get_recent_videos, get_top_videos, get_comments_summary, get_competitor_summary, search_keywords, get_trends, get_calendar, get_creator_profile); writes always confirmed (108).
- §109 Workspaces (independent connections/analytics/profile/projects). §110-112 Domain modes (narrative/gaming/tech, version-sensitive freshness).
- §113-114 Stream-to-content pipeline; repurposing studio (shorts/captions/poll/follow-up/pinned comment).
- §115-117 Series detector, evergreen vs trending classification, portfolio view.
- §118-119 Goals + progress tracking (no invented completion dates).
- §120 Notifications (per-type disable). §121 Search history. §122 Favorites.
- §123-124 Project workflow idea-to-performance + auto-populate link after publish (confirm if ambiguous).
- §128 CSV import. §129 Backup/restore (no credentials inside).
- §135-136 AI result cache (input+prompt-version hash) + prompt versioning.
- §137-139 Freshness badges, refresh controls, background refresh settings (quota-respecting).
- §140 Rate-limit manager (token bucket, backoff).
- §141-142 SQLite FTS + optional local embedding search.
- §143 No required cloud backend (localhost callbacks/custom URI).
- §145 Show only officially exposed subscription status.
- §147 Bulk mode (limited concurrency). §148 Monthly review (data-grounded). §149 Weekly plan. §150 "What should I work on?".
- §151 Every feature: data source + logic + UI + error/loading/empty states + persistence + tests.
- §152 TODO.md (Done/In Progress/Blocked/Future), vertical slices.
- §153-154 Verify: build/lint/typecheck/test/launch/exercise/inspect logs/UI states/DPI.
- §155 Acceptance flow incl. live OAuth flows; mocked boundaries only where external registrations impossible.
- §157 First action: audit docs before UI (INTEGRATION_AUDIT, ARCHITECTURE, FEATURE_MATRIX, SCORING, schema, interfaces, auth, one E2E integration, then UI).
