import type { Migration } from '../migrate'

/**
 * Competitor research support (spec §25–26, §32).
 *
 * Competitor snapshots are stored as JSON on the competitor row rather than in
 * `videos`, so competitor uploads can never leak into the creator's own
 * analytics and dashboard.
 */
export const migration0003: Migration = {
  version: 3,
  name: 'competitors',
  up: `
ALTER TABLE competitors ADD COLUMN handle TEXT;
ALTER TABLE competitors ADD COLUMN snapshot_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE competitors ADD COLUMN last_refreshed_at TEXT;
`,
}
