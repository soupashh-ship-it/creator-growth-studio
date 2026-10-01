import { describe, expect, it } from 'vitest'
import { openDatabase } from '@database/connection'
import { currentVersion, runMigrations } from '@database/migrate'
import { migrations } from '@database/migrations'

function tableNames(db: ReturnType<typeof openDatabase>): string[] {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
    name: string
  }>
  return rows.map((r) => r.name)
}

describe('migrations', () => {
  it('applies all pending migrations from empty', () => {
    const db = openDatabase(':memory:')
    const applied = runMigrations(db, migrations)
    expect(applied).toBe(migrations.length)
    expect(currentVersion(db)).toBe(5)
    db.close()
  })

  it('is idempotent on re-run', () => {
    const db = openDatabase(':memory:')
    runMigrations(db, migrations)
    const second = runMigrations(db, migrations)
    expect(second).toBe(0)
    db.close()
  })

  it('creates the core tables and FTS tables', () => {
    const db = openDatabase(':memory:')
    runMigrations(db, migrations)
    const names = tableNames(db)
    for (const t of [
      'workspaces',
      'settings',
      'accounts',
      'platform_connections',
      'ai_connections',
      'channels',
      'videos',
      'video_snapshots',
      'streams',
      'comments',
      'keywords',
      'trends',
      'competitors',
      'video_projects',
      'calendar_items',
      'seo_reports',
      'thumbnail_reports',
      'creator_profile',
      'ai_sessions',
      'ai_messages',
      'jobs',
      'cache_entries',
      'search_videos',
      'audience_demographics',
      'video_retention',
    ]) {
      expect(names, `missing table: ${t}`).toContain(t)
    }
    db.close()
  })

  it('enforces foreign keys and cascades deletes', () => {
    const db = openDatabase(':memory:')
    runMigrations(db, migrations)

    const now = new Date().toISOString()
    db.prepare('INSERT INTO workspaces (id, name) VALUES (?, ?)').run('ws1', 'SupAshh')
    db.prepare(
      'INSERT INTO platform_connections (id, workspace_id, platform) VALUES (?, ?, ?)',
    ).run('pc1', 'ws1', 'youtube')

    db.prepare('DELETE FROM workspaces WHERE id = ?').run('ws1')
    const remaining = db
      .prepare('SELECT COUNT(*) AS n FROM platform_connections')
      .get() as { n: number }
    expect(remaining.n).toBe(0)
    expect(now).toBeTruthy()
    db.close()
  })

  it('supports FTS5 full-text matches', () => {
    const db = openDatabase(':memory:')
    runMigrations(db, migrations)

    db.prepare('INSERT INTO search_videos (entity_id, title, body) VALUES (?, ?, ?)').run(
      'v1',
      'PoE 2 Lightning Arrow Deadeye',
      'budget build under 10 divines',
    )
    const rows = db
      .prepare("SELECT entity_id FROM search_videos WHERE search_videos MATCH 'lightning'")
      .all() as Array<{ entity_id: string }>
    expect(rows).toHaveLength(1)
    expect(rows[0]?.entity_id).toBe('v1')
    db.close()
  })
})
