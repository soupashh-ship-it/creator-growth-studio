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

State as of 2026-09-30: the project is at **Phase 0 (documentation)** — all
features are `No` until their phase lands. Update as each slice completes.

| # | Feature | Source | AI? | Account? | Offline? | Impl. | Tested | Notes |
|---|---|---|---|---|---|---|---|---|
| 11 | Channel Health Score | YouTube/Twitch | N | Y | cached | No | No | §11; formula in SCORING.md |
| 12 | Video SEO Analyzer | Local + AI | Y | N | Y | No | No | §12; deterministic core + AI qualitative |
| 13 | One-Click Optimization | AI | Y | N | N | No | No | §13 |
| 14 | Title Generator | AI | Y | N | N | No | No | §14; scored output |
| 15 | Title A/B Lab | Local + AI | Y | N | Y | No | No | §15 |
| 16 | Thumbnail Intelligence | Local CV | N | N | Y | No | No | §16; no cloud upload |
| 17 | Thumbnail+Title Pair | Local + AI | Y | N | Y | No | No | §17 |
| 18 | Thumbnail Concept Generator | AI | Y | N | N | No | No | §18 |
| 19 | Mobile Thumbnail Test | Local | N | N | Y | No | No | §19 |
| 20 | Keyword Explorer | Research | Y | N | cached | No | No | §20; no fake volume |
| 21 | Keyword Clusters | Local + AI | Y | N | cached | No | No | §21 |
| 22 | Search Intent Analyzer | Local + AI | Y | N | Y | No | No | §22 |
| 23 | Trend Discovery | YT/Twitch/Web | Y | N | cached | No | No | §23; legitimate sources only |
| 24 | Trend Velocity | Local | N | N | Y | No | No | §24 |
| 25 | Opportunity Finder | Local + AI | Y | N | cached | No | No | §25 |
| 26 | Content Gap Analyzer | Local + AI | Y | Y | cached | No | No | §26 |
| 27 | Competitor Tracker | YouTube/Twitch | N | N | cached | No | No | §27; public data only |
| 28 | Outlier Detector | Local | N | Y | cached | No | No | §28; no causation |
| 29 | Winning Pattern Detection | Local | N | Y | Y | No | No | §29; sample + confidence |
| 30 | Content Strategist | AI + data | Y | Y | cached | No | No | §30 |
| 31 | Video Idea Generator | AI | Y | N | N | No | No | §31 |
| 32 | Content Brief | AI | Y | N | N | No | No | §32 |
| 33 | Hook Generator | AI | Y | N | N | No | No | §33 |
| 34 | Retention Planner | AI | Y | N | N | No | No | §34 |
| 35 | Transcript Analyzer | Local + AI | Y | N | Y | No | No | §35; txt/srt/vtt |
| 36 | Retention Analytics | YouTube | N | Y | cached | No | No | §36; hypotheses only |
| 37 | Shorts Clip Finder | Local + AI | Y | N | Y | No | No | §37 |
| 38 | Local Video Clipping | FFmpeg | N | N | Y | No | No | §38; optional dep |
| 39 | Livestream SEO | AI | Y | N | N | No | No | §39 |
| 40 | Twitch Category Research | Twitch | N | optional | cached | No | No | §40; no fabrication |
| 41 | Stream Discovery Score | Twitch | N | optional | N | No | No | §41 |
| 42 | Stream Title Assistant | Local + AI | Y | N | Y | No | No | §42 |
| 43 | Stream Checklist | Local | N | N | Y | No | No | §43; user-customizable |
| 44 | OBS Integration | OBS | N | optional | Y(local) | No | No | §44; OBS 28+ |
| 45 | Conversion Studio | YouTube/Twitch | N | Y | cached | No | No | §45 |
| 46 | CTA Generator | AI | Y | N | N | No | No | §46 |
| 47 | Member Benefit Planner | AI | Y | N | N | No | No | §47; never auto-publish |
| 48 | Community Content Planner | AI | Y | N | N | No | No | §48 |
| 49 | Comment Intelligence | YouTube + AI | Y | Y | cached | No | No | §49 |
| 50 | Content Calendar | Local | N | N | Y | No | No | §50; drag-drop |
| 51 | Smart Content Schedule | YouTube data | N | Y | cached | No | No | §51; label personalized vs general |
| 52 | Video Performance Monitor | YouTube | N | Y | cached | No | No | §52 |
| 53 | Early Performance Diagnosis | Local + AI | Y | Y | cached | No | No | §53 |
| 54 | Post-Publish Optimizer | AI | Y | Y | N | No | No | §54; user action required |
| 55 | Experiment Tracker | Manual + YouTube | N | Y | cached | No | No | §55 |
| 56 | Personal Creator Memory | Local | N | N | Y | No | No | §56 |
| 57 | Creator Knowledge Base | Local | Y(embed) | N | Y | No | No | §57 |
| 58 | Universal AI Chat | AI + data | Y | optional | local AI only | No | No | §58 |
| 59 | Context Selector | Local | N | N | Y | No | No | §59 |
| 60 | Deep Research | Web + AI | Y | N | N | No | No | §60; sources retained |
| 61 | Source Confidence | Local | Y | N | Y | No | No | §61 |
| 62 | Content Score Engine | Local | N | N | Y | No | No | §62 |
| 63 | SEO Score Engine | Local | N | N | Y | No | No | §63 |
| 64 | No Fake Search Volume | Local | N | N | Y | No | No | §64; invariant, enforced |
| 65 | Data Provenance | Local | N | N | Y | No | No | §65 |
| 66 | No Hallucinated Analytics | Local | N | N | Y | No | No | §66; enforced by tools |
| 67 | Revenue Dashboard | YouTube | N | Y | cached | No | No | §67; source-labelled |
| 68 | Sponsor Readiness | Local | optional | Y | cached | No | No | §68 |
| 69 | Exports | Local | N | N | Y | No | No | §69; PDF/CSV/JSON/MD |
| 70 | Universal Command Search | Local | N | N | Y | No | No | §70 |
| 71 | UI Design System | Local | N | N | Y | No | No | §71; dark-first |
| 72 | Sidebar Navigation | Local | N | N | Y | No | No | §72 |
| 73 | Connection Center | Local | N | N | Y | No | No | §73 |
| 74 | First-Run Wizard | Local | N | optional | Y | No | No | §74; skippable |
| 75 | Privacy Controls | Local | N | N | Y | No | No | §75 |
| 76 | Secure Credential Storage | OS secure storage (DPAPI via safeStorage) | N | N | Y | Yes | Yes | §76; `auth/secret-store.ts` + tests |
| 77 | SQLite Schema + Migrations | Local | N | N | Y | No | No | §77 |
| 78 | Background Jobs | Local | N | Y | cached | No | No | §78 |
| 79 | Cache System | Local | N | N | Y | No | No | §79 |
| 80 | Offline Mode | Local | N | N | Y | No | No | §80 |
| 81 | Failure Handling | Local | N | N | Y | No | No | §81 |
| 82 | AI Job Queue | Local | Y | optional | local AI only | No | No | §82 |
| 83 | Prompt System | Local | Y | N | Y | No | No | §83 |
| 84 | Structured AI Output | Local + AI | Y | N | N | No | No | §84 |
| 85 | Prompt Injection Defense | Local | Y | N | Y | No | No | §85 |
| 86 | AI Usage Visibility | Local | Y | optional | Y | No | No | §86 |
| 87 | Local Logging + Redaction | Local | N | N | Y | No | No | §87 |
| 88 | Update System | Local | N | N | Y | No | No | §88 |
| 89 | Developer Tools | Local | N | N | Y | No | No | §89 |
| 90 | Test Suite | Local | N | N | Y | No | No | §90 |
| 91 | Auth Security Tests | Local | N | N | Y | No | No | §91 |
| 100 | Dependency Checker | Local | N | N | Y | No | No | §100 |
| 104 | Comparison Mode | Local | N | Y | cached | No | No | §104 |
| 105 | Natural Language Analytics | Local + AI | Y | Y | cached | No | No | §105 |
| 106 | Analytics Query Engine | Local | N | N | cached | No | No | §106 |
| 107 | Copilot Read Tools | Local | Y | N | Y | No | No | §107 |
| 108 | Safe Write Actions | Local | Y | N | Y | No | No | §108; confirm in UI |
| 109 | Multiple Workspaces | Local | N | N | Y | No | No | §109 |
| 113 | Stream-to-Content Pipeline | Local + AI | Y | N | Y | No | No | §113 |
| 114 | Repurposing Studio | AI | Y | N | N | No | No | §114 |
| 115 | Content Series Detector | Local + AI | Y | Y | cached | No | No | §115 |
| 117 | Content Portfolio View | Local | N | Y | cached | No | No | §117 |
| 118 | Goals | Local | N | N | Y | No | No | §118 |
| 119 | Progress Tracking | Local + YT | N | Y | cached | No | No | §119; no date predictions |
| 120 | Notifications | Local | N | N | Y | No | No | §120; per-type toggle |
| 121 | Search History | Local | N | N | Y | No | No | §121 |
| 122 | Favorites | Local | N | N | Y | No | No | §122 |
| 123 | Project Workflow | Local | N | N | Y | No | No | §123 |
| 124 | Auto-Populate After Publish | YouTube | N | Y | cached | No | No | §124; confirm ambiguous matches |
| 125 | Command Palette | Local | N | N | Y | No | No | §125 |
| 126 | Keyboard Shortcuts | Local | N | N | Y | No | No | §126 |
| 128 | Data Import (CSV) | Manual | N | N | Y | No | No | §128 |
| 129 | Backup / Restore | Local | N | N | Y | No | No | §129; no credentials in backup |
| 130 | Platform Plugin Architecture | Local | N | N | Y | No | No | §130 |
| 131 | Capability Detection | Local | N | N | Y | No | No | §131 |
| 132 | AI Capability Detection | Local | N | N | Y | No | No | §132 |
| 133 | Model Selector / Task Map | Local | Y | optional | Y | No | No | §133 |
| 134 | AI Consensus Mode | AI | Y | optional | N | No | No | §134; explicit opt-in |
| 135 | AI Result Cache | Local | Y | N | Y | No | No | §135 |
| 136 | Prompt Versioning | Local | N | N | Y | No | No | §136 |
| 137 | Freshness Badges | Local | N | N | Y | No | No | §137 |
| 138 | Refresh Controls | Local | N | Y | custom | No | No | §138 |
| 139 | Background Refresh Settings | Local | N | N | Y | No | No | §139 |
| 140 | Rate-Limit Manager | Local | N | N | Y | No | No | §140 |
| 141 | SQLite FTS Search | Local | N | N | Y | No | No | §141 |
| 142 | Embedding Search | Local | optional | N | Y | No | No | §142; local embeddings preferred |
| 146 | Deep-Op Confirmation | Local | Y | N | Y | No | No | §146 |
| 147 | Bulk Mode | Local | Y | optional | Y | No | No | §147; limited concurrency |
| 148 | Monthly Creator Review | Local + AI | Y | Y | cached | No | No | §148 |
| 149 | Weekly Action Plan | Local + AI | Y | optional | cached | No | No | §149 |
| 150 | "What should I work on?" | Local + AI | Y | optional | Y | No | No | §150 |

> Maintenance: when a slice is implemented, flip `Impl.` to Yes; when it has
> automated coverage, flip `Tested`. Per §151 a feature is only complete when it
> has data source + logic + UI states + persistence + tests.
