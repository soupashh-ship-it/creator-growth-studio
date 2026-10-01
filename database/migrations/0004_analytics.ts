import type { Migration } from '../migrate'

/**
 * YouTube Analytics storage (spec §36, §67).
 *
 * Retention curves and audience demographics come ONLY from the official YouTube
 * Analytics API after the creator connects their channel. Per-video impressions,
 * CTR, retention percentage and revenue already live on `video_snapshots`; this
 * adds the two shapes that have no home there: a viewer-percentage breakdown by
 * dimension, and a normalised watch-ratio curve per video.
 */
export const migration0004: Migration = {
  version: 4,
  name: 'analytics',
  up: `
CREATE TABLE audience_demographics (
  id                TEXT PRIMARY KEY,
  workspace_id      TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  dimension         TEXT NOT NULL,
  bucket            TEXT NOT NULL,
  viewer_percentage REAL,
  captured_at       TEXT NOT NULL
);
CREATE INDEX idx_audience_demographics_ws
  ON audience_demographics(workspace_id, dimension, captured_at);

CREATE TABLE video_retention (
  id            TEXT PRIMARY KEY,
  video_id      TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  elapsed_ratio REAL NOT NULL,
  watch_ratio   REAL,
  captured_at   TEXT NOT NULL
);
CREATE INDEX idx_video_retention_video
  ON video_retention(video_id, elapsed_ratio);
`,
}
