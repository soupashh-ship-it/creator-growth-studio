import type { Migration } from '../migrate'

/**
 * Local full-text search (spec §141).
 *
 * These are standalone FTS5 tables (not external-content) so indexing stays
 * explicit and migration-safe. Rows are written by the search indexer as
 * entities are created/updated; `entity_id` links back to the source table.
 */
export const migration0002: Migration = {
  version: 2,
  name: 'fts',
  up: `
CREATE VIRTUAL TABLE search_videos USING fts5(entity_id UNINDEXED, title, body);
CREATE VIRTUAL TABLE search_projects USING fts5(entity_id UNINDEXED, title, body);
CREATE VIRTUAL TABLE search_comments USING fts5(entity_id UNINDEXED, title, body);
CREATE VIRTUAL TABLE search_reports USING fts5(entity_id UNINDEXED, title, body);
CREATE VIRTUAL TABLE search_ideas USING fts5(entity_id UNINDEXED, title, body);
CREATE VIRTUAL TABLE search_transcripts USING fts5(entity_id UNINDEXED, title, body);
`,
}
