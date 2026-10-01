import { describe, expect, it } from 'vitest'
import { compareCategories, summarizeOwnStreams } from '@research/stream-research'
import type { TwitchCategoryStats } from '@platforms/twitch/client'
import type { StreamRow } from '@database/repositories'

function stat(over: Partial<TwitchCategoryStats> & { gameName: string }): TwitchCategoryStats {
  return {
    gameId: over.gameName.toLowerCase().replace(/\s+/g, '-'),
    viewers: 30000,
    channels: 1000,
    viewersPerChannel: 30,
    observed: true,
    sampleSize: 100,
    ...over,
  }
}

function stream(over: Partial<StreamRow> = {}): StreamRow {
  return {
    id: crypto.randomUUID(),
    workspace_id: 'w1',
    platform: 'twitch',
    external_id: crypto.randomUUID(),
    title: 'session',
    category: null,
    started_at: '2026-09-01T00:00:00Z',
    ended_at: '2026-09-01T04:00:00Z',
    peak_viewers: 42,
    avg_viewers: null,
    ...over,
  }
}

describe('summarizeOwnStreams', () => {
  it('computes median peak per category from stored sessions', () => {
    const summary = summarizeOwnStreams([
      stream({ category: 'A', peak_viewers: 10 }),
      stream({ category: 'A', peak_viewers: 30 }),
      stream({ category: 'A', peak_viewers: 100 }),
      stream({ category: 'B', peak_viewers: 5 }),
    ])
    expect(summary.totalSessions).toBe(4)
    expect(summary.medianPeakViewers).toBe(20)
    expect(summary.perCategory[0]?.category).toBe('A')
    expect(summary.perCategory[0]?.medianPeakViewers).toBe(30)
  })

  it('keeps sessions with unknown peaks as sessions but not as metric values', () => {
    const summary = summarizeOwnStreams([stream({ category: 'A', peak_viewers: null })])
    expect(summary.totalSessions).toBe(1)
    expect(summary.medianPeakViewers).toBeNull()
  })
})

describe('compareCategories', () => {
  it('ranks observed categories by discovery score and keeps explanations', () => {
    const own = summarizeOwnStreams([
      stream({ category: 'Small Game', peak_viewers: 20 }),
      stream({ category: 'Small Game', peak_viewers: 24 }),
    ])
    const result = compareCategories(
      [
        stat({ gameName: 'Small Game', viewers: 5000, channels: 400, viewersPerChannel: 12.5 }),
        stat({ gameName: 'Huge Game', viewers: 200000, channels: 3000, viewersPerChannel: 66.7 }),
      ],
      own,
    )
    expect(result).toHaveLength(2)
    for (const row of result) {
      expect(row.observed).toBe(true)
      expect(row.discovery?.score).not.toBeNull()
      expect(row.discovery?.explanation.length).toBeGreaterThan(0)
    }
  })

  it('never fabricates numbers for categories absent from the sample', () => {
    const result = compareCategories([stat({ gameName: 'Tiny Game', observed: false, viewers: 0, channels: 0 })], summarizeOwnStreams([]))
    const row = result[0]!
    expect(row.observed).toBe(false)
    expect(row.discovery).toBeNull()
    expect(row.viewers).toBe(0)
    expect(row.fitDetail).toContain('Not observed')
    expect(row.fitDetail).toContain('not "zero viewers"')
  })

  it('uses stored session history as the creator-history input', () => {
    const own = summarizeOwnStreams([
      stream({ category: 'Solo', peak_viewers: 10 }),
      stream({ category: 'Solo', peak_viewers: 12 }),
      stream({ category: 'Other', peak_viewers: 8 }),
    ])
    const result = compareCategories(
      [
        stat({ gameName: 'Solo', viewers: 6000, channels: 500, viewersPerChannel: 12 }),
        stat({ gameName: 'Unheard Of', viewers: 6000, channels: 500, viewersPerChannel: 12 }),
      ],
      own,
    )
    const solo = result.find((r) => r.category === 'Solo')!
    const unheard = result.find((r) => r.category === 'Unheard Of')!
    expect(solo.fitDetail).toContain('2 of your 3 stored sessions')
    expect(unheard.fitDetail).toContain('no stored sessions')
  })

  it('produces size-fit detail from median concurrent viewers', () => {
    const own = summarizeOwnStreams([stream({ category: 'X', peak_viewers: 50 })])
    const result = compareCategories(
      [stat({ gameName: 'X', viewers: 120000, channels: 400, viewersPerChannel: 300 })],
      own,
    )
    expect(result[0]!.fitDetail).toContain('viewers/channel vs your median 50')
  })
})
