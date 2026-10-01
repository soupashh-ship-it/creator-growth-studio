import type { Migration } from '../migrate'

const NOW = `(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`

/**
 * Core schema, spec §77. All `(ws)`-scoped tables reference `workspaces` for
 * multi-workspace isolation (§109). Secrets are NOT stored here — only in the
 * OS credential store (docs/PRIVACY_ARCHITECTURE.md §4).
 */
export const migration0001: Migration = {
  version: 1,
  name: 'core',
  up: `
CREATE TABLE workspaces (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT ${NOW},
  updated_at  TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE settings (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  scope        TEXT NOT NULL,
  key          TEXT NOT NULL,
  value_json   TEXT NOT NULL,
  updated_at   TEXT NOT NULL DEFAULT ${NOW}
);
CREATE UNIQUE INDEX idx_settings_scope_key ON settings(scope, key);

-- Identity / connections (no secrets; tokens live in the OS keyring)
CREATE TABLE accounts (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider     TEXT NOT NULL,
  external_id  TEXT NOT NULL,
  label        TEXT,
  issuer       TEXT,
  subject      TEXT,
  created_at   TEXT NOT NULL DEFAULT ${NOW}
);
CREATE UNIQUE INDEX idx_accounts_ws_provider_ext
  ON accounts(workspace_id, provider, external_id);

CREATE TABLE platform_connections (
  id             TEXT PRIMARY KEY,
  workspace_id   TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  platform       TEXT NOT NULL,
  account_id     TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  status         TEXT NOT NULL DEFAULT 'not_configured',
  scopes_json    TEXT NOT NULL DEFAULT '[]',
  keyring_ref    TEXT,
  expires_at     TEXT,
  last_checked_at TEXT,
  created_at     TEXT NOT NULL DEFAULT ${NOW},
  updated_at     TEXT NOT NULL DEFAULT ${NOW}
);
CREATE UNIQUE INDEX idx_platform_conn_ws_platform
  ON platform_connections(workspace_id, platform);

CREATE TABLE ai_connections (
  id                 TEXT PRIMARY KEY,
  workspace_id       TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider           TEXT NOT NULL,
  account_id         TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  status             TEXT NOT NULL DEFAULT 'not_configured',
  plan_usage_enabled INTEGER NOT NULL DEFAULT 0,
  granted_scopes_json TEXT NOT NULL DEFAULT '[]',
  profile_ref        TEXT,
  keyring_ref        TEXT,
  last_checked_at    TEXT,
  created_at         TEXT NOT NULL DEFAULT ${NOW},
  updated_at         TEXT NOT NULL DEFAULT ${NOW}
);
CREATE UNIQUE INDEX idx_ai_conn_ws_provider
  ON ai_connections(workspace_id, provider);

-- Platform data
CREATE TABLE channels (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  platform     TEXT NOT NULL,
  external_id  TEXT NOT NULL,
  title        TEXT,
  description  TEXT,
  thumb_url    TEXT,
  stats_json   TEXT NOT NULL DEFAULT '{}',
  source       TEXT NOT NULL DEFAULT 'official',
  fetched_at   TEXT,
  created_at   TEXT NOT NULL DEFAULT ${NOW},
  updated_at   TEXT NOT NULL DEFAULT ${NOW}
);
CREATE UNIQUE INDEX idx_channels_ws_platform_ext
  ON channels(workspace_id, platform, external_id);

CREATE TABLE videos (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  platform     TEXT NOT NULL,
  channel_id   TEXT REFERENCES channels(id) ON DELETE CASCADE,
  external_id  TEXT NOT NULL,
  title        TEXT,
  description  TEXT,
  published_at TEXT,
  duration_s   INTEGER,
  tags_json    TEXT NOT NULL DEFAULT '[]',
  category     TEXT,
  thumb_url    TEXT,
  project_id   TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at   TEXT NOT NULL DEFAULT ${NOW},
  updated_at   TEXT NOT NULL DEFAULT ${NOW}
);
CREATE UNIQUE INDEX idx_videos_ws_platform_ext
  ON videos(workspace_id, platform, external_id);
CREATE INDEX idx_videos_published ON videos(workspace_id, published_at);

CREATE TABLE video_snapshots (
  id                 TEXT PRIMARY KEY,
  video_id           TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  captured_at        TEXT NOT NULL,
  age_bucket         TEXT NOT NULL DEFAULT 'custom',
  views              INTEGER,
  likes              INTEGER,
  comments           INTEGER,
  impressions        INTEGER,
  ctr                REAL,
  avg_view_duration_s REAL,
  avg_view_pct       REAL,
  subs_gained        INTEGER,
  revenue_micros     INTEGER,
  source             TEXT NOT NULL DEFAULT 'official'
);
CREATE INDEX idx_video_snapshots_video ON video_snapshots(video_id, captured_at);

CREATE TABLE streams (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL,
  external_id   TEXT NOT NULL,
  title         TEXT,
  category      TEXT,
  started_at    TEXT,
  ended_at      TEXT,
  peak_viewers  INTEGER,
  avg_viewers   INTEGER,
  created_at    TEXT NOT NULL DEFAULT ${NOW}
);
CREATE UNIQUE INDEX idx_streams_ws_platform_ext
  ON streams(workspace_id, platform, external_id);

CREATE TABLE stream_snapshots (
  id          TEXT PRIMARY KEY,
  stream_id   TEXT NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  captured_at TEXT NOT NULL,
  viewers     INTEGER,
  followers   INTEGER,
  source      TEXT NOT NULL DEFAULT 'official'
);
CREATE INDEX idx_stream_snapshots_stream ON stream_snapshots(stream_id, captured_at);

CREATE TABLE comments (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  platform     TEXT NOT NULL,
  video_id     TEXT REFERENCES videos(id) ON DELETE CASCADE,
  external_id  TEXT NOT NULL,
  author       TEXT,
  body         TEXT NOT NULL,
  published_at TEXT,
  like_count   INTEGER,
  classification TEXT,
  created_at   TEXT NOT NULL DEFAULT ${NOW}
);
CREATE UNIQUE INDEX idx_comments_ws_platform_ext
  ON comments(workspace_id, platform, external_id);

-- Research
CREATE TABLE keywords (
  id                  TEXT PRIMARY KEY,
  workspace_id        TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  term                TEXT NOT NULL,
  intent              TEXT,
  relative_demand     TEXT,
  trend_index         INTEGER,
  competition_estimate TEXT,
  opportunity         INTEGER,
  freshness           TEXT,
  source              TEXT NOT NULL DEFAULT 'locally_derived',
  is_favorite         INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT ${NOW},
  updated_at          TEXT NOT NULL DEFAULT ${NOW}
);
CREATE UNIQUE INDEX idx_keywords_ws_term ON keywords(workspace_id, term);

CREATE TABLE keyword_snapshots (
  id                   TEXT PRIMARY KEY,
  keyword_id           TEXT NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  captured_at          TEXT NOT NULL,
  trend_index          INTEGER,
  competition_estimate TEXT,
  source               TEXT NOT NULL DEFAULT 'derived'
);
CREATE INDEX idx_keyword_snapshots_kw ON keyword_snapshots(keyword_id, captured_at);

CREATE TABLE keyword_clusters (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  keyword_id    TEXT NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  cluster_label TEXT NOT NULL,
  parent_label  TEXT,
  created_at    TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE trends (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  topic        TEXT NOT NULL,
  source       TEXT NOT NULL,
  momentum     TEXT,
  freshness    INTEGER,
  first_seen   TEXT,
  last_seen    TEXT,
  raw_json     TEXT NOT NULL DEFAULT '{}',
  created_at   TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX idx_trends_ws_topic ON trends(workspace_id, topic);

CREATE TABLE competitors (
  id                 TEXT PRIMARY KEY,
  workspace_id       TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  platform           TEXT NOT NULL,
  channel_external_id TEXT NOT NULL,
  label              TEXT,
  notes              TEXT,
  is_favorite        INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT ${NOW}
);
CREATE UNIQUE INDEX idx_competitors_ws_platform_ext
  ON competitors(workspace_id, platform, channel_external_id);

CREATE TABLE competitor_videos (
  id            TEXT PRIMARY KEY,
  competitor_id TEXT NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  video_id      TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  created_at    TEXT NOT NULL DEFAULT ${NOW}
);
CREATE UNIQUE INDEX idx_competitor_videos ON competitor_videos(competitor_id, video_id);

CREATE TABLE content_gaps (
  id                  TEXT PRIMARY KEY,
  workspace_id        TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  topic               TEXT NOT NULL,
  demand              TEXT,
  competitor_coverage REAL,
  user_coverage       REAL,
  gap_score           INTEGER,
  created_at          TEXT NOT NULL DEFAULT ${NOW}
);

-- Production
CREATE TABLE content_ideas (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  angle         TEXT,
  format        TEXT,
  why_now       TEXT,
  keywords_json TEXT NOT NULL DEFAULT '[]',
  status        TEXT NOT NULL DEFAULT 'idea',
  created_at    TEXT NOT NULL DEFAULT ${NOW},
  updated_at    TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE video_projects (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  stage        TEXT NOT NULL DEFAULT 'idea',
  idea_id      TEXT REFERENCES content_ideas(id) ON DELETE SET NULL,
  goal         TEXT,
  created_at   TEXT NOT NULL DEFAULT ${NOW},
  updated_at   TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE project_assets (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES video_projects(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  ref        TEXT,
  content    TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE calendar_items (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id   TEXT REFERENCES video_projects(id) ON DELETE SET NULL,
  kind         TEXT NOT NULL,
  title        TEXT,
  scheduled_at TEXT,
  status       TEXT NOT NULL DEFAULT 'idea',
  created_at   TEXT NOT NULL DEFAULT ${NOW},
  updated_at   TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX idx_calendar_ws_time ON calendar_items(workspace_id, scheduled_at);

CREATE TABLE experiments (
  id         TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  video_id   TEXT REFERENCES videos(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  changed_at TEXT,
  before_json TEXT NOT NULL DEFAULT '{}',
  after_json  TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT ${NOW}
);

-- Reports
CREATE TABLE seo_reports (
  id             TEXT PRIMARY KEY,
  workspace_id   TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id     TEXT REFERENCES video_projects(id) ON DELETE SET NULL,
  input_json     TEXT NOT NULL,
  scores_json    TEXT NOT NULL,
  insights_json  TEXT NOT NULL DEFAULT '{}',
  prompt_name    TEXT,
  prompt_version INTEGER,
  created_at     TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE thumbnail_reports (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id    TEXT REFERENCES video_projects(id) ON DELETE SET NULL,
  image_ref     TEXT,
  scores_json   TEXT NOT NULL,
  insights_json TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE research_reports (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  topic        TEXT NOT NULL,
  body_md      TEXT NOT NULL,
  sources_json TEXT NOT NULL DEFAULT '[]',
  confidence   TEXT,
  created_at   TEXT NOT NULL DEFAULT ${NOW}
);

-- Creator memory / knowledge base
CREATE TABLE creator_profile (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  niche        TEXT,
  topics_json  TEXT NOT NULL DEFAULT '[]',
  language     TEXT,
  audience     TEXT,
  goals_json   TEXT NOT NULL DEFAULT '[]',
  data_json    TEXT NOT NULL DEFAULT '{}',
  updated_at   TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE creator_memory (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  key          TEXT NOT NULL,
  value_json   TEXT NOT NULL,
  updated_at   TEXT NOT NULL DEFAULT ${NOW}
);
CREATE UNIQUE INDEX idx_creator_memory_ws_kind_key
  ON creator_memory(workspace_id, kind, key);

CREATE TABLE knowledge_docs (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  path         TEXT,
  title        TEXT,
  hash         TEXT,
  created_at   TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE knowledge_chunks (
  id        TEXT PRIMARY KEY,
  doc_id    TEXT NOT NULL REFERENCES knowledge_docs(id) ON DELETE CASCADE,
  chunk     TEXT NOT NULL,
  embedding BLOB
);

-- AI
CREATE TABLE ai_sessions (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title        TEXT,
  provider     TEXT,
  model        TEXT,
  created_at   TEXT NOT NULL DEFAULT ${NOW},
  updated_at   TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE ai_messages (
  id             TEXT PRIMARY KEY,
  session_id     TEXT NOT NULL REFERENCES ai_sessions(id) ON DELETE CASCADE,
  role           TEXT NOT NULL,
  content        TEXT NOT NULL,
  tool_calls_json TEXT NOT NULL DEFAULT '[]',
  prompt_name    TEXT,
  prompt_version INTEGER,
  created_at     TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX idx_ai_messages_session ON ai_messages(session_id, created_at);

CREATE TABLE ai_result_cache (
  id             TEXT PRIMARY KEY,
  input_hash     TEXT NOT NULL,
  prompt_name    TEXT NOT NULL,
  prompt_version INTEGER NOT NULL,
  provider       TEXT NOT NULL,
  model          TEXT NOT NULL,
  result_json    TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT ${NOW}
);
CREATE UNIQUE INDEX idx_ai_cache_key
  ON ai_result_cache(input_hash, prompt_name, prompt_version, provider, model);

CREATE TABLE provider_usage (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL,
  model         TEXT,
  task          TEXT,
  occurred_at   TEXT NOT NULL DEFAULT ${NOW},
  input_tokens  INTEGER,
  output_tokens INTEGER,
  requests      INTEGER NOT NULL DEFAULT 1
);

-- Ops
CREATE TABLE notifications (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  read_at      TEXT,
  created_at   TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE search_history (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  query        TEXT NOT NULL,
  scope        TEXT,
  created_at   TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE favorites (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_type  TEXT NOT NULL,
  entity_id    TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT ${NOW}
);
CREATE UNIQUE INDEX idx_favorites_ws_entity
  ON favorites(workspace_id, entity_type, entity_id);

CREATE TABLE jobs (
  id               TEXT PRIMARY KEY,
  workspace_id     TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL,
  state            TEXT NOT NULL DEFAULT 'queued',
  payload_json     TEXT NOT NULL DEFAULT '{}',
  result_ref       TEXT,
  error            TEXT,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  queued_at        TEXT NOT NULL DEFAULT ${NOW},
  started_at       TEXT,
  finished_at      TEXT
);
CREATE INDEX idx_jobs_state ON jobs(state, queued_at);

CREATE TABLE cache_entries (
  key        TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  source     TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX idx_cache_expiry ON cache_entries(expires_at);
`,
}
