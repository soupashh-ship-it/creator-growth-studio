import type { DatabaseSync } from 'node:sqlite'

export interface Migration {
  /** Monotonic version. Applied in ascending order; never re-run. */
  version: number
  /** Human-readable name, stored in the ledger. */
  name: string
  /** SQL executed inside a single transaction. */
  up: string
}

const LEDGER = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  applied_at TEXT NOT NULL
)`

/**
 * Applies all pending migrations transactionally and returns how many ran.
 * Forward-only in production; a failure rolls back that migration alone.
 */
export function runMigrations(db: DatabaseSync, migrations: readonly Migration[]): number {
  db.exec(LEDGER)

  const appliedRows = db.prepare('SELECT version FROM schema_migrations').all() as Array<{
    version: number
  }>
  const applied = new Set(appliedRows.map((row) => row.version))

  const pending = [...migrations].sort((a, b) => a.version - b.version)
  let count = 0

  for (const migration of pending) {
    if (applied.has(migration.version)) continue

    db.exec('BEGIN')
    try {
      db.exec(migration.up)
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        migration.version,
        migration.name,
        new Date().toISOString(),
      )
      db.exec('COMMIT')
      count += 1
    } catch (error) {
      db.exec('ROLLBACK')
      throw new Error(
        `Migration ${migration.version} (${migration.name}) failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      )
    }
  }

  return count
}

/** Returns the highest applied migration version, or 0 when the DB is empty. */
export function currentVersion(db: DatabaseSync): number {
  db.exec(LEDGER)
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as
    | { v: number | null }
    | undefined
  return row?.v ?? 0
}
