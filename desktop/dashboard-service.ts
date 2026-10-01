import { AnalyticsQuery, computeAverage, summarizeVideos } from '../analytics/query'
import { channelHealth, deriveEngagementRatios } from '../core/scores/channel-health'
import type { ScoreResult } from '../core/scores/engine'
import type { Repositories, VideoRow } from '../database/repositories'

/**
 * Dashboard data (spec §10, §11).
 *
 * Every field is derived from rows the user's own connected accounts produced.
 * When a channel has not been synced the summary is `null` and the UI shows the
 * honest "connect a channel" empty state — no placeholder numbers (§66, §93).
 */
export interface DashboardChannel {
  platform: string
  title: string
  subscriberCount: number | null
  videoCount: number | null
  viewCount: number | null
  fetchedAt: string | null
}

export interface DashboardVideo {
  title: string
  platform: string
  publishedAt: string | null
  views: number | null
  likes: number | null
  comments: number | null
}

export interface DashboardSummary {
  channels: DashboardChannel[]
  connections: Array<{ platform: string; status: string; lastCheckedAt: string | null }>
  videoSummary: { count: number; totalViews: number; averageViews: number | null; medianViews: number | null } | null
  recentVideos: DashboardVideo[]
  health: ScoreResult | null
  /** Why health is unavailable, when it is. */
  healthNote: string | null
  lastSyncedAt: string | null
}

/** Coefficient of variation of inter-upload gaps (0 = perfectly regular). */
export function uploadIntervalVariation(publishedDates: string[]): number | null {
  const timestamps = publishedDates
    .map((d) => Date.parse(d))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b)
  if (timestamps.length < 3) return null
  const gaps: number[] = []
  for (let i = 1; i < timestamps.length; i += 1) {
    gaps.push((timestamps[i] as number) - (timestamps[i - 1] as number))
  }
  const mean = computeAverage(gaps)
  if (!mean || mean <= 0) return null
  const variance = gaps.reduce((sum, gap) => sum + (gap - mean) ** 2, 0) / gaps.length
  return Math.sqrt(variance) / mean
}

function toDashboardVideo(video: VideoRow): DashboardVideo {
  return {
    title: video.title ?? '(untitled)',
    platform: video.platform,
    publishedAt: video.published_at,
    views: video.views,
    likes: video.likes,
    comments: video.comments,
  }
}

export function buildDashboardSummary(repos: Repositories, workspaceId: string): DashboardSummary {
  const channels = repos.listChannels(workspaceId)
  const connections = repos.listPlatformConnections(workspaceId)
  const videos = repos.listVideos(workspaceId)

  const totalViews = videos.reduce((sum, v) => sum + (v.views ?? 0), 0)
  const totalLikes = videos.reduce((sum, v) => sum + (v.likes ?? 0), 0)
  const totalComments = videos.reduce((sum, v) => sum + (v.comments ?? 0), 0)
  const withViews = videos.filter((v) => v.views !== null && v.views > 0)
  const hasMetrics = withViews.length > 0

  const ratios = deriveEngagementRatios(totalViews, totalLikes, totalComments)
  const variation = uploadIntervalVariation(
    videos.map((v) => v.published_at).filter((d): d is string => Boolean(d)),
  )

  const health = hasMetrics
    ? channelHealth({
        likesPerView: ratios.likesPerView,
        commentsPerView: ratios.commentsPerView,
        uploadIntervalVariation: variation,
      })
    : null

  const recentVideos = [...videos]
    .sort((a, b) => Date.parse(b.published_at ?? '') - Date.parse(a.published_at ?? ''))
    .slice(0, 8)
    .map(toDashboardVideo)

  const fetchedTimes = channels.map((c) => c.fetched_at).filter((t): t is string => Boolean(t))

  return {
    channels: channels.map((c) => ({
      platform: c.platform,
      title: c.title ?? '(untitled)',
      subscriberCount: c.subscriber_count,
      videoCount: c.video_count,
      viewCount: c.view_count,
      fetchedAt: c.fetched_at,
    })),
    connections: connections.map((c) => ({
      platform: c.platform,
      status: c.status,
      lastCheckedAt: c.last_checked_at,
    })),
    videoSummary: hasMetrics ? summarizeVideos(videos) : null,
    recentVideos,
    health,
    healthNote: health
      ? 'Derived from stored engagement totals only; retention, CTR and audience inputs require a YouTube Analytics sync.'
      : 'Connect and sync a channel to compute channel health. No estimates are shown.',
    lastSyncedAt: fetchedTimes.length > 0 ? (fetchedTimes.sort().at(-1) ?? null) : null,
  }
}

/** Read-only analytics tools exposed to the AI copilot (spec §107). */
export function createAnalyticsQuery(repos: Repositories): AnalyticsQuery {
  return new AnalyticsQuery(repos)
}
