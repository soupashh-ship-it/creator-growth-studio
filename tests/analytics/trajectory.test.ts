import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DatabaseSync } from '@database/connection'
import { runMigrations } from '@database/migrate'
import { migrations } from '@database/migrations'
import { Repositories } from '@database/repositories'
import { buildVideoTrajectory } from '@analytics/trajectory'

let db: DatabaseSync
let repos: Repositories

beforeEach(() => {
  db = openDatabase(':memory:')
  runMigrations(db, migrations)
  repos = new Repositories(db)
  repos.createWorkspace('w1', 'WS')
})

describe('buildVideoTrajectory', () => {
  it('measures windows that have a snapshot at or after the mark', () => {
    const publish = new Date(Date.now() - 10 * 24 * 3_600_000).toISOString() // 10 days ago
    // Latest sync snapshot (captured now) shows 450 views.
    repos.upsertVideo({ workspaceId: 'w1', platform: 'youtube', externalId: 'v1', title: 'Video', publishedAt: publish, views: 450 })
    const videoId = repos.listVideos('w1')[0]!.id
    // An earlier snapshot from 3 days after publish showed 100 views.
    db.prepare(
      "INSERT INTO video_snapshots (id, video_id, captured_at, views, likes, comments, source) VALUES (?, ?, ?, ?, NULL, NULL, 'official')",
    ).run(crypto.randomUUID(), videoId, new Date(Date.now() - 7 * 24 * 3_600_000).toISOString(), 100)

    const trajectory = buildVideoTrajectory(repos, { id: videoId, title: 'Video', published_at: publish })
    const day1 = trajectory.windows.find((window_) => window_.label === '24 hours')
    const day7 = trajectory.windows.find((window_) => window_.label === '7 days')
    expect(day1?.status).toBe('measured')
    expect(day1?.views).toBe(100) // earliest snapshot at/after the 24h mark
    expect(day7?.status).toBe('measured')
    expect(day7?.views).toBe(450)
    expect(trajectory.growthSinceFirst).toBeCloseTo(3.5, 1) // 100 → 450
  })

  it('reports not-yet for windows in the future and no-snapshot for gaps', () => {
    const publish = new Date(Date.now() - 2 * 3_600_000).toISOString() // 2h ago
    repos.upsertVideo({ workspaceId: 'w1', platform: 'youtube', externalId: 'v2', title: 'New video', publishedAt: publish, views: 50 })
    const videoId = repos.listVideos('w1')[0]!.id

    const trajectory = buildVideoTrajectory(repos, { id: videoId, title: 'New video', published_at: publish })
    const hour1 = trajectory.windows.find((window_) => window_.label === '1 hour')
    const day7 = trajectory.windows.find((window_) => window_.label === '7 days')
    expect(hour1?.status).toBe('measured')
    expect(day7?.status).toBe('not-yet')
    expect(trajectory.notes.join(' ')).toContain('never interpolated')
  })

  it('handles videos with no publish date honestly', () => {
    repos.upsertVideo({ workspaceId: 'w1', platform: 'youtube', externalId: 'v3', title: 'Undated', publishedAt: new Date().toISOString() })
    const videoId = repos.listVideos('w1')[0]!.id
    const trajectory = buildVideoTrajectory(repos, { id: videoId, title: 'Undated', published_at: null })
    expect(trajectory.windows.every((window_) => window_.status === 'no-snapshot')).toBe(true)
  })
})
