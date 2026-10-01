import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildAnalyticsOverview,
  buildContentGaps,
  buildPublishingMomentum,
  deriveUserTopics,
  rankOpportunities,
} from '@analytics/insights'
import { openDatabase, type DatabaseSync } from '@database/connection'
import { runMigrations } from '@database/migrate'
import { migrations } from '@database/migrations'
import { Repositories } from '@database/repositories'

let db: DatabaseSync
let repos: Repositories

function addVideo(externalId: string, title: string, publishedAt: string, views: number | null, likes = 0, comments = 0): void {
  repos.upsertVideo({
    workspaceId: 'w1',
    platform: 'youtube',
    externalId,
    title,
    publishedAt,
    views,
    likes,
    comments,
  })
}

beforeEach(() => {
  db = openDatabase(':memory:')
  runMigrations(db, migrations)
  repos = new Repositories(db)
  repos.createWorkspace('w1', 'WS')
})

describe('deriveUserTopics', () => {
  it('counts a token once per video and drops stopwords', () => {
    addVideo('v1', 'How to build a Deadeye in PoE', '2026-01-01T00:00:00Z', 100)
    addVideo('v2', 'Deadeye endgame guide', '2026-01-08T00:00:00Z', 200)
    const topics = deriveUserTopics(repos.listVideos('w1'))
    const map = new Map(topics.map((t) => [t.topic, t.count]))
    expect(map.get('deadeye')).toBe(2)
    expect(map.has('the')).toBe(false)
    expect(map.has('how')).toBe(false)
  })
})

describe('buildPublishingMomentum', () => {
  it('measures the creator’s own coverage, not external search interest', () => {
    const now = Date.parse('2026-02-01T00:00:00Z')
    addVideo('v1', 'Deadeye build part one', '2026-01-31T00:00:00Z', 100)
    addVideo('v2', 'Deadeye build part two', '2026-01-30T00:00:00Z', 100)
    addVideo('v3', 'Deadeye build part three', '2026-01-29T00:00:00Z', 100)

    const momentum = buildPublishingMomentum(repos, 'w1', { now })
    const deadeye = momentum.find((m) => m.topic === 'deadeye')
    expect(deadeye).toBeTruthy()
    expect(deadeye?.observations).toBe(3)
    expect(deadeye?.action.length).toBeGreaterThan(0)
  })

  it('is empty when the channel has no uploads', () => {
    expect(buildPublishingMomentum(repos, 'w1')).toEqual([])
  })
})

describe('buildAnalyticsOverview', () => {
  it('reports an honest empty state with no stored videos', () => {
    const overview = buildAnalyticsOverview(repos, 'w1')
    expect(overview.hasData).toBe(false)
    expect(overview.health).toBeNull()
    expect(overview.notes.join(' ')).toMatch(/sync a connected channel/i)
  })

  it('derives outliers, patterns and health from stored rows', () => {
    addVideo('v1', 'Deadeye build guide', '2026-01-01T00:00:00Z', 1000, 80, 20)
    addVideo('v2', 'Deadeye budget build', '2026-01-05T00:00:00Z', 1100, 70, 15)
    addVideo('v3', 'Random unboxing', '2026-01-09T00:00:00Z', 100, 2, 0)
    addVideo('v4', 'Deadeye boss kill', '2026-01-12T00:00:00Z', 6000, 90, 25)
    addVideo('v5', 'Deadeye league start', '2026-01-15T00:00:00Z', 1050, 75, 18)
    addVideo('v6', 'Deadeye gear', '2026-01-18T00:00:00Z', 980, 60, 12)

    const overview = buildAnalyticsOverview(repos, 'w1')
    expect(overview.hasData).toBe(true)
    expect(overview.videoCount).toBe(6)
    expect(overview.health).not.toBeNull()
    expect(overview.outliers.length).toBeGreaterThan(0)
    expect(overview.patterns.some((p) => p.token === 'deadeye')).toBe(true)
    expect(overview.series.length).toBeGreaterThan(0)
  })
})

describe('buildContentGaps', () => {
  it('flags topics competitors cover that the creator does not', () => {
    addVideo('v1', 'Deadeye build guide', '2026-01-01T00:00:00Z', 100)

    const report = buildContentGaps(repos, 'w1', [
      { topic: 'deadeye', count: 1 },
      { topic: 'bosses', count: 5 },
    ])
    expect(report.userTopics.some((t) => t.topic === 'deadeye')).toBe(true)
    expect(report.gaps.some((g) => g.topic === 'bosses')).toBe(true)
    expect(report.note).toMatch(/does not scrape/i)
  })
})

describe('rankOpportunities', () => {
  it('returns saved keywords ordered by the repository', () => {
    repos.upsertKeyword({ workspaceId: 'w1', term: 'poe 2 deadeye', opportunity: 80, source: 'locally_derived' })
    repos.upsertKeyword({ workspaceId: 'w1', term: 'poe 2 totem', opportunity: 40, source: 'locally_derived' })
    const rows = rankOpportunities(repos, 'w1')
    expect(rows.map((r) => r.term)).toEqual(['poe 2 deadeye', 'poe 2 totem'])
  })
})
