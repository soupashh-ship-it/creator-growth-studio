import type { Repositories, VideoRow } from '../database/repositories'

/**
 * Analytics query engine (spec §104–106).
 *
 * All numerical work happens locally; only aggregated results are ever passed to
 * an AI provider. The pure helpers below are unit-tested and used by the
 * `AnalyticsQuery` class.
 */

export function computeMedian(values: number[]): number | null {
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (clean.length === 0) return null
  const mid = Math.floor(clean.length / 2)
  if (clean.length % 2 === 1) return clean[mid] ?? null
  const a = clean[mid - 1] ?? 0
  const b = clean[mid] ?? 0
  return (a + b) / 2
}

export function computeAverage(values: number[]): number | null {
  const clean = values.filter((v) => Number.isFinite(v))
  if (clean.length === 0) return null
  return clean.reduce((s, v) => s + v, 0) / clean.length
}

/** Percentage change with an honest null when there is no baseline (§104). */
export function percentChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null
  return ((current - previous) / previous) * 100
}

export interface VideoSummary {
  count: number
  totalViews: number
  averageViews: number | null
  medianViews: number | null
}

export function summarizeVideos(videos: VideoRow[]): VideoSummary {
  const views = videos.map((v) => v.views).filter((v): v is number => v !== null)
  return {
    count: videos.length,
    totalViews: views.reduce((s, v) => s + v, 0),
    averageViews: computeAverage(views),
    medianViews: computeMedian(views),
  }
}

export interface PerformanceComparison {
  current: VideoSummary
  previous: VideoSummary
  /** Percentage change in total views, or null when there is no baseline. */
  viewsChangePct: number | null
}

/**
 * Comparison mode (spec §104). Splits a bounded date range from a previous
 * equal-length period. Returns a real percentage only when both periods have
 * data.
 */
export function compareByPeriod(
  videos: VideoRow[],
  range: { start: string; end: string },
): PerformanceComparison {
  const start = Date.parse(range.start)
  const end = Date.parse(range.end)
  const span = Math.max(0, end - start)

  const current: VideoRow[] = []
  const previous: VideoRow[] = []

  for (const video of videos) {
    const published = Date.parse(video.published_at ?? '')
    if (Number.isNaN(published)) continue
    if (published >= start && published <= end) current.push(video)
    else if (published >= start - span && published < start) previous.push(video)
  }

  const currentSummary = summarizeVideos(current)
  const previousSummary = summarizeVideos(previous)

  return {
    current: currentSummary,
    previous: previousSummary,
    viewsChangePct: percentChange(currentSummary.totalViews, previousSummary.totalViews),
  }
}

export interface OutlierResult {
  video: VideoRow
  multiple: number
}

/**
 * Outlier detection (spec §28): compares a video's views against the channel
 * median. Never claims causation.
 */
export function findOutliers(videos: VideoRow[], threshold = 2): OutlierResult[] {
  const median = computeMedian(videos.map((v) => v.views ?? 0).filter((v) => v > 0))
  if (!median || median === 0) return []
  return videos
    .filter((v): v is VideoRow & { views: number } => v.views !== null)
    .map((video) => ({ video, multiple: video.views / median }))
    .filter((r) => r.multiple >= threshold)
    .sort((a, b) => b.multiple - a.multiple)
}

/**
 * Winning-pattern detection (spec §29): how much better do videos whose title
 * contains a token perform? Reports sample size and never claims causation.
 */
export function findWinningPatterns(
  videos: VideoRow[],
  tokens: string[],
): Array<{ token: string; sample: number; liftPct: number | null; confidence: 'low' | 'moderate' | 'high' }> {
  const baseline = computeMedian(videos.map((v) => v.views ?? 0).filter((v) => v > 0))
  if (!baseline) return []

  return tokens.map((token) => {
    const matching = videos.filter((v) => (v.title ?? '').toLowerCase().includes(token.toLowerCase()) && v.views !== null)
    const others = videos.filter((v) => !(v.title ?? '').toLowerCase().includes(token.toLowerCase()) && v.views !== null)
    const matchMedian = computeMedian(matching.map((v) => v.views as number))
    const otherMedian = computeMedian(others.map((v) => v.views as number))
    const liftPct = percentChange(matchMedian, otherMedian ?? baseline)
    const confidence = matching.length >= 20 ? 'high' : matching.length >= 8 ? 'moderate' : 'low'
    return { token, sample: matching.length, liftPct, confidence }
  })
}

/** Thin DB-backed query layer used by the UI and the AI read tools (§107). */
export class AnalyticsQuery {
  constructor(private readonly repos: Repositories) {}

  channelSummary(workspaceId: string): VideoSummary {
    return summarizeVideos(this.repos.listVideos(workspaceId))
  }

  comparison(workspaceId: string, range: { start: string; end: string }): PerformanceComparison {
    return compareByPeriod(this.repos.listVideos(workspaceId), range)
  }

  outliers(workspaceId: string): OutlierResult[] {
    return findOutliers(this.repos.listVideos(workspaceId))
  }

  topVideos(workspaceId: string, limit = 5): VideoRow[] {
    return [...this.repos.listVideos(workspaceId)]
      .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
      .slice(0, limit)
  }
}
