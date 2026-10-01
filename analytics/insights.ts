import { channelHealth, deriveEngagementRatios } from '../core/scores/channel-health'
import type { ScoreResult } from '../core/scores/engine'
import { tokenize } from '../research/keywords'
import { detectSeries, findContentGaps, type ContentGap, type TopicCount } from '../research/gaps'
import { rankTrends, type TrendObservation, type TrendVelocity } from '../research/trends'
import type { Repositories, VideoRow } from '../database/repositories'
import { compareByPeriod, findOutliers, findWinningPatterns, summarizeVideos } from './query'

/**
 * Read-only analytics/research composition (spec §28–29, §23–26, §104).
 *
 * Everything here is derived from rows the user already stored. Where a signal
 * does not exist (external trend feeds, retention curves, demographics) the
 * functions return empty results and the UI explains why — no invented numbers.
 */

/** Frequency of title tokens across the creator's own uploads (one vote per video). */
export function deriveUserTopics(videos: VideoRow[], limit = 20): TopicCount[] {
  const counts = new Map<string, number>()
  for (const video of videos) {
    const seen = new Set<string>()
    for (const token of tokenize(video.title ?? '')) {
      if (seen.has(token)) continue
      seen.add(token)
      counts.set(token, (counts.get(token) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic))
    .slice(0, limit)
}

function titleHasToken(title: string | null, token: string): boolean {
  return tokenize(title ?? '').includes(token)
}

/**
 * Publishing momentum for the creator's own recurring topics.
 *
 * This measures how recently and how often the channel has covered a topic — it
 * is explicitly **not** platform search interest, and the UI says so.
 */
export function buildPublishingMomentum(
  repos: Repositories,
  workspaceId: string,
  options: { now?: number; limit?: number } = {},
): TrendVelocity[] {
  const videos = repos.listVideos(workspaceId)
  const topics = deriveUserTopics(videos, options.limit ?? 12)
  const observations: TrendObservation[] = []
  for (const { topic } of topics) {
    for (const video of videos) {
      if (!video.published_at) continue
      if (!titleHasToken(video.title, topic)) continue
      observations.push({ topic, observedAt: video.published_at, weight: 1 })
    }
  }
  const ranked = rankTrends(observations, { ...(options.now !== undefined ? { now: options.now } : {}) })
  return ranked
}

export interface AnalyticsOverview {
  hasData: boolean
  videoCount: number
  totalViews: number
  averageViews: number | null
  medianViews: number | null
  comparison: {
    start: string
    end: string
    currentViews: number
    previousViews: number
    changePct: number | null
  } | null
  topVideos: Array<{ title: string; views: number | null; publishedAt: string | null }>
  outliers: Array<{ title: string; views: number; multiple: number }>
  patterns: Array<{ token: string; sample: number; liftPct: number | null; confidence: string }>
  series: Array<{ format: string; examples: string[] }>
  health: ScoreResult | null
  notes: string[]
}

const DAY_MS = 24 * 60 * 60 * 1000

export function buildAnalyticsOverview(
  repos: Repositories,
  workspaceId: string,
  options: { range?: { start: string; end: string }; now?: number } = {},
): AnalyticsOverview {
  const videos = repos.listVideos(workspaceId)
  const now = options.now ?? Date.now()
  const end = options.range?.end ?? new Date(now).toISOString()
  const start = options.range?.start ?? new Date(now - 30 * DAY_MS).toISOString()

  const summary = summarizeVideos(videos)
  const comparisonResult = compareByPeriod(videos, { start, end })

  const topVideos = [...videos]
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    .slice(0, 8)
    .map((v) => ({ title: v.title ?? '(untitled)', views: v.views, publishedAt: v.published_at }))

  const outliers = findOutliers(videos).slice(0, 8).map((o) => ({
    title: o.video.title ?? '(untitled)',
    views: o.video.views as number,
    multiple: Math.round(o.multiple * 10) / 10,
  }))

  const tokens = deriveUserTopics(videos, 8).map((t) => t.topic)
  const patterns = findWinningPatterns(videos, tokens)
    .filter((p) => p.sample > 0)
    .slice(0, 8)

  const titles = videos.map((v) => v.title ?? '').filter(Boolean)
  const series = detectSeries(titles).slice(0, 5)

  const totalViews = videos.reduce((sum, v) => sum + (v.views ?? 0), 0)
  const totalLikes = videos.reduce((sum, v) => sum + (v.likes ?? 0), 0)
  const totalComments = videos.reduce((sum, v) => sum + (v.comments ?? 0), 0)
  const hasMetrics = videos.some((v) => v.views !== null && v.views > 0)
  const ratios = deriveEngagementRatios(totalViews, totalLikes, totalComments)

  const health = hasMetrics
    ? channelHealth({ likesPerView: ratios.likesPerView, commentsPerView: ratios.commentsPerView })
    : null

  const notes = [
    'Outlier multiples compare a video against the channel median; they are not causal.',
    'Pattern lift reports a sample size and never claims causation.',
    'Retention, CTR and audience demographics require a YouTube Analytics sync and are shown as "Not available" until then.',
  ]
  if (!hasMetrics) notes.unshift('No stored view counts yet — sync a connected channel to populate analytics.')

  return {
    hasData: videos.length > 0,
    videoCount: summary.count,
    totalViews: summary.totalViews,
    averageViews: summary.averageViews,
    medianViews: summary.medianViews,
    comparison: {
      start,
      end,
      currentViews: comparisonResult.current.totalViews,
      previousViews: comparisonResult.previous.totalViews,
      changePct: comparisonResult.viewsChangePct,
    },
    topVideos,
    outliers,
    patterns,
    series,
    health,
    notes,
  }
}

export interface ContentGapReport {
  userTopics: TopicCount[]
  gaps: ContentGap[]
  note: string
}

/**
 * Compares the topics the creator covers against competitor topics the user
 * supplies (e.g. from public research). Nothing is scraped.
 */
export function buildContentGaps(
  repos: Repositories,
  workspaceId: string,
  competitorTopics: TopicCount[],
  options: { minCompetitorCount?: number } = {},
): ContentGapReport {
  const videos = repos.listVideos(workspaceId)
  const userTopics = deriveUserTopics(videos, 50)
  const gaps = findContentGaps(userTopics, competitorTopics, options)
  return {
    userTopics,
    gaps,
    note:
      'Your topics come from your own uploaded videos. Competitor topics are whatever public data you entered — the app does not scrape platforms.',
  }
}

export interface OpportunityRow {
  term: string
  intent: string | null
  relative_demand: string | null
  competition_estimate: string | null
  opportunity: number | null
  source: string
}

/** Ranked keyword opportunities (already ordered by the repository). */
export function rankOpportunities(repos: Repositories, workspaceId: string, limit = 50): OpportunityRow[] {
  return repos.listKeywords(workspaceId).slice(0, limit)
}

export { summarizeVideos }
