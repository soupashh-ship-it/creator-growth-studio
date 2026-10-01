import { combine, lin, pillar, ratio, type ScoreComponent, type ScoreResult } from './engine'

/**
 * Channel Health Score (spec §11, formula documented in docs/SCORING.md §1).
 *
 * Five pillars, each 0–100, averaged by fixed weights. Not an official
 * YouTube/Twitch metric. All inputs optional — missing ones are excluded and
 * the remaining weights renormalized.
 */
export interface ChannelHealthInputs {
  /** Click-through rate as a percentage, e.g. 5.1 for 5.1%. */
  ctrPct?: number | null
  /** Average view percentage, e.g. 42 for 42%. */
  avgViewPercentage?: number | null
  /** Average view duration ÷ channel median duration. */
  durationRatio?: number | null
  likesPerView?: number | null
  commentsPerView?: number | null
  /** % of viewers who have watched before. */
  returningSharePct?: number | null
  /** Subscribers gained per 1,000 views. */
  subsPer1000Views?: number | null
  /** Impressions change vs the previous equal period, as a percentage. */
  impressionsTrendPct?: number | null
  /** Traffic-source shares as fractions summing to ~1. */
  trafficShares?: number[] | null
  /** Coefficient of variation of inter-upload intervals (0 = perfectly regular). */
  uploadIntervalVariation?: number | null
}

function sub(
  key: string,
  label: string,
  weight: number,
  value: number | null,
  detail: string,
): ScoreComponent {
  return { key, label, weight, value, detail }
}

export function channelHealth(input: ChannelHealthInputs): ScoreResult {
  const ctr = input.ctrPct == null ? null : lin(input.ctrPct, 1, 8)
  const impressionsTrend =
    input.impressionsTrendPct == null ? null : lin(input.impressionsTrendPct, -30, 30)
  const maxShare =
    input.trafficShares && input.trafficShares.length > 0 ? Math.max(...input.trafficShares) : null
  const trafficDiversity = maxShare == null ? null : 100 * (1 - maxShare)

  const discovery = pillar('discovery', 'Discovery', 25, [
    sub('ctr', 'Click-through rate', 0.4, ctr, input.ctrPct == null ? 'Not available' : `CTR ${input.ctrPct}% mapped from 1–8%`),
    sub('impressions_trend', 'Impressions trend', 0.3, impressionsTrend, input.impressionsTrendPct == null ? 'Not available' : `${input.impressionsTrendPct}% vs previous period, mapped from -30%–+30%`),
    sub('traffic_diversity', 'Traffic-source diversity', 0.3, trafficDiversity, maxShare == null ? 'Not available' : `largest source is ${Math.round(maxShare * 100)}% of traffic`),
  ])

  const retention = pillar('retention', 'Retention', 25, [
    sub('avp', 'Average view percentage', 0.7, input.avgViewPercentage == null ? null : lin(input.avgViewPercentage, 20, 60), input.avgViewPercentage == null ? 'Not available' : `${input.avgViewPercentage}% mapped from 20–60%`),
    sub('duration_ratio', 'Duration vs median', 0.3, input.durationRatio == null ? null : lin(input.durationRatio, 0.6, 1.4), input.durationRatio == null ? 'Not available' : `${input.durationRatio}× channel median, mapped from 0.6–1.4`),
  ])

  const engagement = pillar('engagement', 'Engagement', 20, [
    sub('likes', 'Likes per view', 0.6, input.likesPerView == null ? null : lin(input.likesPerView, 0, 0.08), input.likesPerView == null ? 'Not available' : `${(input.likesPerView * 100).toFixed(1)} per 100 views`),
    sub('comments', 'Comments per view', 0.4, input.commentsPerView == null ? null : lin(input.commentsPerView, 0, 0.01), input.commentsPerView == null ? 'Not available' : `${(input.commentsPerView * 1000).toFixed(1)} per 1,000 views`),
  ])

  const consistency = pillar('consistency', 'Consistency', 15, [
    sub('cadence', 'Upload cadence regularity', 1, input.uploadIntervalVariation == null ? null : 100 * (1 - Math.min(input.uploadIntervalVariation, 1)), input.uploadIntervalVariation == null ? 'Not available' : `variation ${input.uploadIntervalVariation.toFixed(2)} → ${Math.round(100 * (1 - Math.min(input.uploadIntervalVariation, 1)))}/100`),
  ])

  const conversion = pillar('conversion', 'Conversion', 15, [
    sub('subs', 'Subscribers per 1,000 views', 0.6, input.subsPer1000Views == null ? null : lin(input.subsPer1000Views, 0, 20), input.subsPer1000Views == null ? 'Not available' : `${input.subsPer1000Views.toFixed(1)} per 1,000 views`),
    sub('returning', 'Returning-viewer share', 0.4, input.returningSharePct == null ? null : lin(input.returningSharePct, 10, 45), input.returningSharePct == null ? 'Not available' : `${input.returningSharePct}% mapped from 10–45%`),
  ])

  return combine([discovery, retention, engagement, consistency, conversion])
}

/** Convenience: derive the common ratio inputs from a snapshot. */
export function deriveEngagementRatios(
  views: number | null | undefined,
  likes: number | null | undefined,
  comments: number | null | undefined,
): { likesPerView: number | null; commentsPerView: number | null } {
  return {
    likesPerView: ratio(likes, views),
    commentsPerView: ratio(comments, views),
  }
}
