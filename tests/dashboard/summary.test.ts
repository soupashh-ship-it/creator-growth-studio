import { beforeEach, describe, expect, it } from 'vitest'
import { buildDashboardSummary, uploadIntervalVariation } from '../../desktop/dashboard-service'
import { openDatabase, type DatabaseSync } from '@database/connection'
import { runMigrations } from '@database/migrate'
import { migrations } from '@database/migrations'
import { Repositories } from '@database/repositories'

let db: DatabaseSync
let repos: Repositories

beforeEach(() => {
  db = openDatabase(':memory:')
  runMigrations(db, migrations)
  repos = new Repositories(db)
  repos.createWorkspace('w1', 'WS')
})

describe('uploadIntervalVariation', () => {
  it('returns null when there are too few uploads to judge cadence', () => {
    expect(uploadIntervalVariation(['2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'])).toBeNull()
  })

  it('is ~0 for perfectly regular uploads and higher for irregular ones', () => {
    const regular = uploadIntervalVariation([
      '2026-01-01T00:00:00Z',
      '2026-01-08T00:00:00Z',
      '2026-01-15T00:00:00Z',
      '2026-01-22T00:00:00Z',
    ])
    const irregular = uploadIntervalVariation([
      '2026-01-01T00:00:00Z',
      '2026-01-02T00:00:00Z',
      '2026-01-20T00:00:00Z',
      '2026-01-21T00:00:00Z',
    ])
    expect(regular).toBeCloseTo(0, 5)
    expect(irregular).not.toBeNull()
    expect(irregular as number).toBeGreaterThan(0.5)
  })
})

describe('buildDashboardSummary', () => {
  it('reports honest empty state when nothing is connected', () => {
    const summary = buildDashboardSummary(repos, 'w1')
    expect(summary.channels).toEqual([])
    expect(summary.videoSummary).toBeNull()
    expect(summary.health).toBeNull()
    expect(summary.healthNote).toContain('Connect and sync a channel')
  })

  it('derives counts and health from stored rows only', () => {
    repos.upsertChannel({
      workspaceId: 'w1',
      platform: 'youtube',
      externalId: 'UC1',
      title: 'SupAshh',
      subscriberCount: 1000,
      videoCount: 2,
      viewCount: 1500,
    })
    repos.upsertVideo({
      workspaceId: 'w1',
      platform: 'youtube',
      externalId: 'v1',
      title: 'First',
      publishedAt: '2026-01-01T00:00:00Z',
      views: 1000,
      likes: 50,
      comments: 10,
    })
    repos.upsertVideo({
      workspaceId: 'w1',
      platform: 'youtube',
      externalId: 'v2',
      title: 'Second',
      publishedAt: '2026-01-08T00:00:00Z',
      views: 500,
      likes: 20,
      comments: 5,
    })

    const summary = buildDashboardSummary(repos, 'w1')
    expect(summary.channels[0]?.title).toBe('SupAshh')
    expect(summary.videoSummary?.count).toBe(2)
    expect(summary.videoSummary?.totalViews).toBe(1500)
    expect(summary.health).not.toBeNull()
    // Only engagement inputs are available, so coverage must be partial.
    expect(summary.health?.coverage).toBeLessThan(1)
    expect(summary.recentVideos.map((v) => v.title)).toEqual(['Second', 'First'])
  })
})
