import { DatabaseSync } from 'node:sqlite'

/**
 * Opens the local SQLite database.
 *
 * Uses Node's built-in `node:sqlite` (no native build step, which keeps the
 * Windows installer dependency-free — see docs/ARCHITECTURE.md §2).
 *
 * @param path Absolute path, or ':memory:' for tests.
 */
export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path)

  // WAL improves concurrent read/write behaviour for a desktop app.
  db.exec('PRAGMA journal_mode = WAL;')
  // Enforce referential integrity (spec §77).
  db.exec('PRAGMA foreign_keys = ON;')
  // Wait rather than immediately failing on a brief lock.
  db.exec('PRAGMA busy_timeout = 5000;')

  return db
}

export { DatabaseSync }
