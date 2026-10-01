import { getPlatformInstance } from './platform-service'
import { getServices } from './services'
import type { YouTubePlatform } from '../platforms/youtube'
import { toDemographicBuckets, toRetentionPoints } from '../platforms/youtube/analytics'

/**
 * YouTube Analytics sync (spec §36, §67).
 *
 * Pulls OFFICIAL impressions, CTR, average-view percentage/duration, subscribers
 * gained and estimated revenue per video, plus the audience age/gender
 * breakdown and per-video retention curves. It only runs against a connected
 * YouTube channel; without one it reports the honest reason. Nothing is
 * estimated or back-filled.
 */

export interface AnalyticsSyncResult {
  ok: boolean
  videosUpdated: number
  demographicBuckets: number
  retentionCurves: number
  error?: string
}

const MAX_RETENTION_VIDEOS = 10

function num(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toMicros(amount: unknown): number | null {
  const value = num(amount)
  return value === null ? null : Math.round(value * 1_000_000)
}

function defaultRange(days: number): { start: string; end: string } {
  const end = new Date()
  const start = new Date(end.getTime() - days * 86_400_000)
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}

export async function syncYouTubeAnalytics(workspaceId: string, days = 90): Promise<AnalyticsSyncResult> {
  let platform: YouTubePlatform
  try {
    platform = (await getPlatformInstance('youtube')) as YouTubePlatform
  } catch (error) {
    return {
      ok: false,
      videosUpdated: 0,
      demographicBuckets: 0,
      retentionCurves: 0,
      error: error instanceof Error ? error.message : 'YouTube is not configured.',
    }
  }

  const { repos } = getServices()
  const range = defaultRange(days)

  try {
    const perVideo = await platform.getPerVideoMetrics(range)
    let videosUpdated = 0
    const matched: Array<{ externalId: string; videoId: string }> = []

    for (const row of perVideo.rows) {
      const externalId = String(row['video'] ?? '')
      if (!externalId) continue
      const video = repos.findVideoByExternalId(workspaceId, externalId)
      if (!video) continue
      repos.recordVideoAnalyticsSnapshot({
        videoId: video.id,
        views: num(row['views']),
        impressions: num(row['impressions']),
        ctr: num(row['impressionClickThroughRate']),
        avgViewDurationS: num(row['averageViewDuration']),
        avgViewPct: num(row['averageViewPercentage']),
        subsGained: num(row['subscribersGained']),
        revenueMicros: toMicros(row['estimatedRevenue']),
      })
      matched.push({ externalId, videoId: video.id })
      videosUpdated += 1
    }

    // Audience breakdown (§67).
    const demographics = await platform.getDemographics(range)
    const buckets = toDemographicBuckets(demographics.rows)
    repos.replaceAudienceDemographics(workspaceId, buckets)

    // Retention curves (§36) for the most-viewed videos, bounded to protect quota.
    let retentionCurves = 0
    for (const item of matched.slice(0, MAX_RETENTION_VIDEOS)) {
      try {
        const retention = await platform.getRetention(item.externalId, range)
        const points = toRetentionPoints(retention.rows)
        if (points.length > 0) {
          repos.replaceVideoRetention(item.videoId, points)
          retentionCurves += 1
        }
      } catch {
        // A single video's retention failing must not abort the whole sync.
      }
    }

    return {
      ok: true,
      videosUpdated,
      demographicBuckets: buckets.length,
      retentionCurves,
    }
  } catch (error) {
    return {
      ok: false,
      videosUpdated: 0,
      demographicBuckets: 0,
      retentionCurves: 0,
      error: error instanceof Error ? error.message : 'Analytics sync failed.',
    }
  }
}

export interface AnalyticsSnapshot {
  videos: Array<{
    video_id: string
    title: string | null
    impressions: number | null
    ctr: number | null
    avg_view_pct: number | null
    avg_view_duration_s: number | null
    subs_gained: number | null
    revenue_micros: number | null
  }>
  demographics: Array<{ dimension: string; bucket: string; viewer_percentage: number | null }>
  /** True once any official analytics row exists for this workspace. */
  hasData: boolean
  note: string
}

export function getAnalyticsSnapshot(workspaceId: string): AnalyticsSnapshot {
  const { repos } = getServices()
  const videos = repos.listLatestVideoAnalytics(workspaceId)
  const demographics = repos.listAudienceDemographics(workspaceId)
  return {
    videos,
    demographics,
    hasData: videos.some((v) => v.impressions !== null || v.ctr !== null || v.avg_view_pct !== null),
    note:
      'Impressions, CTR, average view percentage/duration, subscribers gained and estimated revenue come from the official YouTube Analytics API. Values are “Not available” until an Analytics sync runs for a connected channel.',
  }
}

export function getVideoRetention(videoId: string): Array<{ elapsed_ratio: number; watch_ratio: number | null }> {
  return getServices().repos.listVideoRetention(videoId)
}
