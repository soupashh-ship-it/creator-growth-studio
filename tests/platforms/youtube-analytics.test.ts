import { describe, expect, it } from 'vitest'
import {
  analyticsRowsToObjects,
  demographicsQuery,
  perVideoQuery,
  retentionQuery,
  toDemographicBuckets,
  toRetentionPoints,
} from '@platforms/youtube/analytics'

const range = { start: '2026-07-01', end: '2026-09-30' }

describe('query builders', () => {
  it('requests per-video metrics with a video dimension', () => {
    const query = perVideoQuery(range)
    expect(query.dimensions).toContain('video')
    expect(query.metrics).toContain('impressionClickThroughRate')
    expect(query.metrics).toContain('estimatedRevenue')
    expect(query.startDate).toBe('2026-07-01')
    expect(query.endDate).toBe('2026-09-30')
  })

  it('requests demographics by age group and gender', () => {
    const query = demographicsQuery(range)
    expect(query.dimensions).toEqual(['ageGroup', 'gender'])
    expect(query.metrics).toEqual(['viewerPercentage'])
  })

  it('filters a retention query to one video', () => {
    const query = retentionQuery('abc123', range)
    expect(query.filters).toBe('video==abc123')
    expect(query.dimensions).toEqual(['elapsedVideoTimeRatio'])
    expect(query.metrics).toContain('audienceWatchRatio')
  })
})

describe('analyticsRowsToObjects', () => {
  it('maps headers to values', () => {
    const rows = analyticsRowsToObjects({
      columnHeaders: [{ name: 'video' }, { name: 'views' }],
      rows: [['abc', 100], ['def', 50]],
    })
    expect(rows).toEqual([
      { video: 'abc', views: 100 },
      { video: 'def', views: 50 },
    ])
  })
})

describe('toDemographicBuckets', () => {
  it('splits age and gender rows into typed buckets', () => {
    const buckets = toDemographicBuckets([
      { ageGroup: 'age25-34', viewerPercentage: 42.5 },
      { gender: 'male', viewerPercentage: 70 },
    ])
    expect(buckets).toEqual([
      { dimension: 'ageGroup', bucket: 'age25-34', viewerPercentage: 42.5 },
      { dimension: 'gender', bucket: 'male', viewerPercentage: 70 },
    ])
  })

  it('skips rows with no viewer percentage', () => {
    expect(toDemographicBuckets([{ ageGroup: 'age18-24' }])).toEqual([])
  })
})

describe('toRetentionPoints', () => {
  it('sorts by elapsed ratio and keeps null watch ratios honest', () => {
    const points = toRetentionPoints([
      { elapsedVideoTimeRatio: 0.5, audienceWatchRatio: 0.4 },
      { elapsedVideoTimeRatio: 0.1, audienceWatchRatio: 0.9 },
      { elapsedVideoTimeRatio: 0.9 },
    ])
    expect(points.map((p) => p.elapsedRatio)).toEqual([0.1, 0.5, 0.9])
    expect(points[2]?.watchRatio).toBeNull()
  })
})
