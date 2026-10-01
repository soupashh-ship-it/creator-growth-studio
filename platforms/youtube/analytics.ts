/**
 * YouTube Analytics query shapes + parsing (spec §36, §67).
 *
 * These are the exact official `reports.query` requests. The builders are pure
 * and unit-tested so the request shape is verifiable without hitting Google;
 * the raw rows are converted to typed buckets/curves before storage.
 *
 * IMPORTANT: every value produced here is an official YouTube figure. Nothing in
 * this module estimates, interpolates or invents analytics.
 */

export interface AnalyticsQuery {
  startDate: string
  endDate: string
  metrics: string[]
  dimensions?: string[]
  filters?: string
  sort?: string
  maxResults?: number
  ids?: string
}

export type AnalyticsRow = Record<string, string | number>

/** Core per-video metrics, covering §36 (CTR/retention) and §67 (revenue). */
export const PER_VIDEO_METRICS = [
  'views',
  'estimatedMinutesWatched',
  'averageViewDuration',
  'averageViewPercentage',
  'impressions',
  'impressionClickThroughRate',
  'subscribersGained',
  'estimatedRevenue',
] as const

/** Dimensions for the audience breakdown (§67). */
export const DEMOGRAPHIC_DIMENSIONS = ['ageGroup', 'gender'] as const

export const RETENTION_METRIC = 'audienceWatchRatio'

export function perVideoQuery(range: { start: string; end: string }): AnalyticsQuery {
  return {
    startDate: range.start,
    endDate: range.end,
    metrics: [...PER_VIDEO_METRICS],
    dimensions: ['video'],
    sort: '-views',
    maxResults: 200,
  }
}

export function demographicsQuery(range: { start: string; end: string }): AnalyticsQuery {
  return {
    startDate: range.start,
    endDate: range.end,
    metrics: ['viewerPercentage'],
    dimensions: [...DEMOGRAPHIC_DIMENSIONS],
  }
}

export function retentionQuery(videoId: string, range?: { start: string; end: string }): AnalyticsQuery {
  return {
    startDate: range?.start ?? '2000-01-01',
    endDate: range?.end ?? new Date().toISOString().slice(0, 10),
    metrics: [RETENTION_METRIC, 'relativeRetentionPerformance'],
    dimensions: ['elapsedVideoTimeRatio'],
    filters: `video==${videoId}`,
  }
}

/** Converts `{columnHeaders, rows}` into named objects. */
export function analyticsRowsToObjects(payload: {
  columnHeaders?: Array<{ name?: string }>
  rows?: Array<Array<string | number>>
}): AnalyticsRow[] {
  const headers = (payload.columnHeaders ?? []).map((header) => header.name ?? '')
  return (payload.rows ?? []).map((row) => {
    const record: AnalyticsRow = {}
    headers.forEach((header, index) => {
      const value = row[index]
      if (header && value !== undefined) record[header] = value
    })
    return record
  })
}

export interface DemographicBucket {
  dimension: string
  bucket: string
  viewerPercentage: number
}

export function toDemographicBuckets(rows: AnalyticsRow[]): DemographicBucket[] {
  const buckets: DemographicBucket[] = []
  for (const row of rows) {
    const percentage = Number(row['viewerPercentage'])
    if (!Number.isFinite(percentage)) continue
    if (row['ageGroup'] !== undefined) {
      buckets.push({ dimension: 'ageGroup', bucket: String(row['ageGroup']), viewerPercentage: percentage })
    }
    if (row['gender'] !== undefined) {
      buckets.push({ dimension: 'gender', bucket: String(row['gender']), viewerPercentage: percentage })
    }
  }
  return buckets
}

export interface RetentionPoint {
  elapsedRatio: number
  watchRatio: number | null
}

export function toRetentionPoints(rows: AnalyticsRow[]): RetentionPoint[] {
  return rows
    .map((row) => {
      const elapsed = Number(row['elapsedVideoTimeRatio'])
      const watch = Number(row[RETENTION_METRIC])
      return {
        elapsedRatio: elapsed,
        watchRatio: Number.isFinite(watch) ? watch : null,
      }
    })
    .filter((point) => Number.isFinite(point.elapsedRatio))
    .sort((a, b) => a.elapsedRatio - b.elapsedRatio)
}
