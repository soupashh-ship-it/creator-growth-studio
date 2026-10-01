import type { Migration } from '../migrate'

/**
 * Goal progress + notification preferences (spec §119, §120).
 *
 * `channel_snapshots` records periodic channel-level statistics (subscribers,
 * views) from official platform syncs so goal progress shows real 30-day
 * movement instead of a single current number. Notification preferences live in
 * the existing `settings` table — no table needed for §120.
 */
export const migration0005: Migration = {
  version: 5,
  name: 'goal-progress',
  up: `
CREATE TABLE channel_snapshots (
  id               TEXT PRIMARY KEY,
  workspace_id     TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  platform         TEXT NOT NULL,
  external_id      TEXT NOT NULL,
  subscriber_count INTEGER,
  view_count       INTEGER,
  captured_at      TEXT NOT NULL
);
CREATE INDEX idx_channel_snapshots_ws
  ON channel_snapshots(workspace_id, platform, captured_at);
`,
}
