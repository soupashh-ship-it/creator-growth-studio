import { beforeEach, describe, expect, it } from 'vitest'
import { buildMonthlyReview } from '@export/reports'
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

describe('buildMonthlyReview', () => {
  it('produces an honest report on an empty workspace', () => {
    const review = buildMonthlyReview(repos, 'w1', Date.parse('2026-02-01T00:00:00Z'))
    expect(review.markdown).toContain('# Monthly Review')
    expect(review.markdown).toContain('No channel synced')
    expect(review.markdown).toContain('Not available')
    // The report must state that scores are heuristic, not official metrics.
    expect(review.markdown).toMatch(/heuristic/i)
    expect(review.generatedAt).toBe('2026-02-01T00:00:00.000Z')
  })

  it('includes stored values and caveats without inventing volume', () => {
    repos.upsertChannel({
      workspaceId: 'w1',
      platform: 'youtube',
      externalId: 'UC1',
      title: 'SupAshh',
      subscriberCount: 5000,
      videoCount: 40,
      viewCount: 200000,
    })
    repos.upsertVideo({
      workspaceId: 'w1',
      platform: 'youtube',
      externalId: 'v1',
      title: 'Deadeye build',
      publishedAt: '2026-01-20T00:00:00Z',
      views: 12000,
      likes: 800,
      comments: 120,
    })
    repos.upsertKeyword({
      workspaceId: 'w1',
      term: 'poe 2 deadeye',
      opportunity: 70,
      relativeDemand: 'High',
      source: 'locally_derived',
    })

    const review = buildMonthlyReview(repos, 'w1', Date.parse('2026-02-01T00:00:00Z'))
    expect(review.markdown).toContain('SupAshh')
    expect(review.markdown).toContain('12,000')
    expect(review.markdown).toContain('poe 2 deadeye')
    expect(review.markdown).toMatch(/relative demand only/i)
    expect(review.markdown).not.toMatch(/search volume/i)
  })
})
