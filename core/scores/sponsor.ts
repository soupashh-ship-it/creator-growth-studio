import { clamp, combine, lin, type ScoreResult } from './engine'
import type { VideoRow } from '../../database/repositories'

/**
 * Sponsor readiness (spec §68).
 *
 * Operational indicators only: recent average views, upload activity,
 * consistency, engagement and niche clarity — all computed from rows the
 * creator already stored. The score describes operational attractiveness to a
 * sponsor; it is NOT a promise of sponsorship, a platform metric, or a
 * brand-safety verdict, and the UI says so.
 */

export interface SponsorReadinessInput {
  videos: VideoRow[]
  /** Creator profile niche, if the creator stated one. */
  niche: string | null
  /** Now (ms epoch) for deterministic tests. */
  now?: number
}

export interface MediaKit {
  channelTitle: string
  niche: string | null
  videoCount: number
  recentAverageViews: number | null
  medianViews: number | null
  uploadsPerMonth: number | null
  engagementRatePct: number | null
  topVideos: Array<{ title: string; views: number | null; publishedAt: string | null }>
  /** Generated pitch outline the creator can edit — never auto-sent anywhere. */
  pitchOutline: string[]
  caveat: string
}

const DAY_MS = 24 * 60 * 60 * 1000
const RECENT_WINDOW_DAYS = 90

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const hi = sorted[mid] ?? 0
  if (sorted.length % 2 !== 0) return hi
  const lo = mid > 0 ? sorted[mid - 1] ?? hi : hi
  return (lo + hi) / 2
}

export { median }

export function sponsorReadiness(input: SponsorReadinessInput): ScoreResult {
  const now = input.now ?? Date.now()
  const windowStart = now - RECENT_WINDOW_DAYS * DAY_MS
  const recent = input.videos.filter(
    (v) => v.published_at !== null && Date.parse(v.published_at) >= windowStart,
  )
  const dated = input.videos.filter((v) => v.published_at !== null)
  const withViews = recent.filter((v) => typeof v.views === 'number' && v.views !== null) as Array<
    VideoRow & { views: number }
  >
  const allWithViews = input.videos.filter(
    (v) => typeof v.views === 'number' && v.views !== null,
  ) as Array<VideoRow & { views: number }>

  const recentAvg = withViews.length > 0
    ? Math.round(withViews.reduce((s, v) => s + v.views, 0) / withViews.length)
    : null

  const gapDays: number[] = []
  const sortedDates = dated
    .map((v) => Date.parse(v.published_at as string))
    .sort((a, b) => a - b)
  for (let i = 1; i < sortedDates.length; i++) {
    const prev = sortedDates[i - 1] ?? 0
    const curr = sortedDates[i] ?? 0
    gapDays.push((curr - prev) / DAY_MS)
  }
  const medianGap = median(gapDays)
  // Regularity: perfect at a steady 7-day cadence, degrading as the median gap
  // becomes irregular relative to the mean gap.
  let activityValue: number | null = null
  let regularityValue: number | null = null
  if (dated.length >= 2 && sortedDates.length >= 2) {
    const spanDays = ((sortedDates[sortedDates.length - 1] ?? 0) - (sortedDates[0] ?? 0)) / DAY_MS
    const perMonth = spanDays > 0 ? (dated.length / spanDays) * 30 : null
    activityValue = perMonth === null ? null : clamp(lin(perMonth, 0.5, 8))
    if (medianGap !== null && gapDays.length > 0) {
      const meanGap = gapDays.reduce((s, g) => s + g, 0) / gapDays.length
      const spread = meanGap === 0 ? 1 : Math.abs(medianGap - meanGap) / meanGap
      regularityValue = clamp(100 - spread * 100)
    }
  }

  let likesPerView: number | null = null
  if (allWithViews.length > 0) {
    const views = allWithViews.reduce((s, v) => s + v.views, 0)
    const likes = input.videos.reduce((s, v) => s + (v.likes ?? 0), 0)
    const comments = input.videos.reduce((s, v) => s + (v.comments ?? 0), 0)
    if (views > 0) likesPerView = ((likes + 2 * comments) / views) * 100
  }

  const nicheValue = input.niche && input.niche.trim().length > 0 ? 100 : null

  return combine([
    {
      key: 'recent_views',
      label: 'Recent average views (90d)',
      weight: 35,
      value: recentAvg === null ? null : clamp(lin(recentAvg, 100, 20_000)),
      detail: recentAvg === null ? 'No view data in the last 90 days' : `≈${recentAvg} average views across ${withViews.length} recent video(s)`,
    },
    {
      key: 'upload_activity',
      label: 'Upload activity',
      weight: 25,
      value: activityValue,
      detail: activityValue === null ? 'Not enough dated uploads to measure activity' : `${dated.length} dated uploads analysed`,
    },
    {
      key: 'consistency',
      label: 'Schedule consistency',
      weight: 15,
      value: regularityValue,
      detail: regularityValue === null ? 'Not enough uploads to measure a cadence' : `median gap ${medianGap === null ? '—' : Math.round(medianGap) + ' days'}`,
    },
    {
      key: 'engagement',
      label: 'Engagement (likes+2·comments per view)',
      weight: 15,
      value: likesPerView === null ? null : clamp(lin(likesPerView, 0.2, 8)),
      detail: likesPerView === null ? 'No engagement data stored' : `${likesPerView.toFixed(2)}% of views engage`,
    },
    {
      key: 'niche_clarity',
      label: 'Niche clarity (stated focus)',
      weight: 10,
      value: nicheValue,
      detail: nicheValue === null ? 'No niche stated in the creator profile' : `Niche: ${input.niche}`,
    },
  ])
}

export function buildMediaKit(
  channelTitle: string,
  input: SponsorReadinessInput,
): MediaKit {
  const recent = input.videos.filter((v) => v.published_at !== null)
  const withViews = input.videos.filter((v) => typeof v.views === 'number' && v.views !== null) as Array<
    VideoRow & { views: number }
  >
  const views = withViews.map((v) => v.views)
  const sortedDates = recent
    .map((v) => Date.parse(v.published_at as string))
    .sort((a, b) => a - b)
  const spanDays =
    sortedDates.length >= 2
      ? ((sortedDates[sortedDates.length - 1] ?? 0) - (sortedDates[0] ?? 0)) / DAY_MS
      : null
  const uploadsPerMonth = spanDays && spanDays > 0 ? (recent.length / spanDays) * 30 : null

  const totalViews = withViews.reduce((s, v) => s + v.views, 0)
  const totalLikes = input.videos.reduce((s, v) => s + (v.likes ?? 0), 0)
  const totalComments = input.videos.reduce((s, v) => s + (v.comments ?? 0), 0)
  const engagementRatePct = totalViews > 0 ? ((totalLikes + 2 * totalComments) / totalViews) * 100 : null
  const recentAverage = withViews.length > 0 ? Math.round(totalViews / withViews.length) : null
  const medianViews = median(views)

  const topVideos = [...input.videos]
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    .slice(0, 5)
    .map((v) => ({ title: v.title ?? '(untitled)', views: v.views, publishedAt: v.published_at }))

  const fmt = (n: number | null): string => (n === null ? 'Not available' : new Intl.NumberFormat().format(Math.round(n)))

  return {
    channelTitle,
    niche: input.niche,
    videoCount: input.videos.length,
    recentAverageViews: recentAverage,
    medianViews,
    uploadsPerMonth: uploadsPerMonth === null ? null : Math.round(uploadsPerMonth * 10) / 10,
    engagementRatePct: engagementRatePct === null ? null : Math.round(engagementRatePct * 100) / 100,
    topVideos,
    pitchOutline: [
      `Channel: ${channelTitle}${input.niche ? ` — ${input.niche}` : ''}`,
      `Reach: recent average ${fmt(recentAverage)} views per video (median ${fmt(medianViews)}).`,
      `Output: ${recent.length} uploads in the last 90 days (${uploadsPerMonth === null ? 'cadence not measurable' : `≈${Math.round(uploadsPerMonth * 10) / 10}/month`}).`,
      `Engagement: ${engagementRatePct === null ? 'not measurable from stored data' : `${engagementRatePct.toFixed(2)}% of views like or comment`}.`,
      'Best-performing work: see Top videos below; lead the pitch with the most relevant example for the sponsor.',
      'Ask: state the deliverables (dedicated video, integration, Short) and your rate.',
    ],
    caveat:
      'Generated locally from your own stored data. It describes operations, not promises — engagement and view counts must match your official analytics before sending.',
  }
}
