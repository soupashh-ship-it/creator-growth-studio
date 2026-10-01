import { describe, expect, it } from 'vitest'
import {
  compareByPeriod,
  computeAverage,
  computeMedian,
  findOutliers,
  findWinningPatterns,
  percentChange,
  summarizeVideos,
} from '@analytics/query'
import type { VideoRow } from '@database/repositories'

const video = (externalId: string, publishedAt: string, views: number, title = ''): VideoRow => ({
  id: externalId,
  workspace_id: 'w1',
  platform: 'youtube',
  external_id: externalId,
  title,
  published_at: publishedAt,
  views,
  likes: null,
  comments: null,
  project_id: null,
})

describe('stats helpers', () => {
  it('computes median for odd and even counts', () => {
    expect(computeMedian([1, 3, 2])).toBe(2)
    expect(computeMedian([1, 2, 3, 4])).toBe(2.5)
    expect(computeMedian([])).toBeNull()
  })

  it('computes average and ignores non-finite values', () => {
    expect(computeAverage([10, 20])).toBe(15)
    expect(computeAverage([])).toBeNull()
  })

  it('returns null percent change without a baseline', () => {
    expect(percentChange(150, 100)).toBe(50)
    expect(percentChange(150, null)).toBeNull()
    expect(percentChange(150, 0)).toBeNull()
  })
})

describe('summarizeVideos', () => {
  it('summarises views honestly', () => {
    const summary = summarizeVideos([video('a', '2026-09-01T00:00:00Z', 100), video('b', '2026-09-02T00:00:00Z', 300)])
    expect(summary.count).toBe(2)
    expect(summary.totalViews).toBe(400)
    expect(summary.medianViews).toBe(200)
  })
})

describe('comparison mode', () => {
  it('compares a period against the previous equal period', () => {
    const videos = [
      video('cur', '2026-09-15T00:00:00Z', 150),
      video('prev', '2026-08-15T00:00:00Z', 100),
    ]
    const comparison = compareByPeriod(videos, { start: '2026-09-01T00:00:00Z', end: '2026-09-30T00:00:00Z' })
    expect(comparison.current.count).toBe(1)
    expect(comparison.previous.count).toBe(1)
    expect(comparison.viewsChangePct).toBe(50)
  })

  it('reports null change when there is no previous data', () => {
    const comparison = compareByPeriod([video('a', '2026-09-15T00:00:00Z', 10)], {
      start: '2026-09-01T00:00:00Z',
      end: '2026-09-30T00:00:00Z',
    })
    expect(comparison.viewsChangePct).toBeNull()
  })
})

describe('outlier detection', () => {
  it('finds videos far above the channel median without claiming causation', () => {
    const videos = [
      video('a', '2026-09-01T00:00:00Z', 14000),
      video('b', '2026-09-02T00:00:00Z', 15000),
      video('c', '2026-09-03T00:00:00Z', 13000),
      video('out', '2026-09-04T00:00:00Z', 96000),
    ]
    const outliers = findOutliers(videos, 2)
    expect(outliers).toHaveLength(1)
    expect(outliers[0]!.video.external_id).toBe('out')
    expect(outliers[0]!.multiple).toBeGreaterThan(5)
  })

  it('returns nothing without a usable baseline', () => {
    expect(findOutliers([video('a', '2026-09-01T00:00:00Z', 0)])).toEqual([])
  })
})

describe('winning patterns', () => {
  it('reports lift with sample size and confidence', () => {
    const videos = [
      ...Array.from({ length: 10 }, (_, i) => video(`m${i}`, '2026-09-01T00:00:00Z', 40000, `FIX your FPS ${i}`)),
      ...Array.from({ length: 10 }, (_, i) => video(`o${i}`, '2026-09-01T00:00:00Z', 10000, `Random vlog ${i}`)),
    ]
    const patterns = findWinningPatterns(videos, ['fix'])
    const fix = patterns.find((p) => p.token === 'fix')!
    expect(fix.sample).toBe(10)
    expect(fix.liftPct).toBeGreaterThan(0)
    expect(fix.confidence).toBe('moderate')
  })
})
