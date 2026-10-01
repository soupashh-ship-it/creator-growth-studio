import { clamp, combine, lin, ratio, type ScoreComponent, type ScoreResult } from './engine'

/**
 * Stream Discovery Score (spec §41; docs/SCORING.md §5).
 *
 * Helps a creator choose a category. This is NOT a Twitch metric and the UI must
 * say so. Requires live category data; without it the score is unavailable
 * rather than fabricated (§40).
 */
export interface StreamDiscoveryInput {
  /** Current live viewers in the category. */
  viewers?: number | null
  /** Current live channels in the category. */
  channels?: number | null
  /** Creator's historical performance in/near this category, 0–100. */
  creatorHistory?: number | null
  /** Fit vs the creator's typical concurrent viewers, 0–100. */
  channelSizeFit?: number | null
  /** Change in viewers/channels over the window, 0–100. */
  trend?: number | null
}

export function streamDiscoveryScore(input: StreamDiscoveryInput): ScoreResult {
  const vcRatio = ratio(input.viewers, input.channels)
  const ratioScore = vcRatio == null ? null : lin(vcRatio, 5, 120)
  const audienceSize = input.viewers == null ? null : lin(input.viewers, 500, 60000)
  const competition = input.channels == null ? null : clamp(100 - lin(input.channels, 200, 8000))

  const components: ScoreComponent[] = [
    { key: 'audience_size', label: 'Audience size', weight: 20, value: audienceSize, detail: input.viewers == null ? 'No live data' : `${input.viewers} live viewers mapped from 500–60,000` },
    { key: 'competition', label: 'Competition (inverted)', weight: 20, value: competition, detail: input.channels == null ? 'No live data' : `${input.channels} live channels mapped from 200–8,000` },
    { key: 'viewer_channel_ratio', label: 'Viewer/channel ratio', weight: 25, value: ratioScore, detail: vcRatio == null ? 'Needs viewers and channels' : `${Math.round(vcRatio)} viewers per channel mapped from 5–120` },
    { key: 'creator_history', label: 'Creator history', weight: 15, value: input.creatorHistory ?? null, detail: input.creatorHistory == null ? 'No history in this category' : `past performance ${Math.round(input.creatorHistory)}/100` },
    { key: 'channel_size_fit', label: 'Channel size fit', weight: 10, value: input.channelSizeFit ?? null, detail: input.channelSizeFit == null ? 'No comparable sessions' : `fit ${Math.round(input.channelSizeFit)}/100` },
    { key: 'trend', label: 'Trend', weight: 10, value: input.trend ?? null, detail: input.trend == null ? 'No trend window' : `viewer/channel change ${Math.round(input.trend)}/100` },
  ]

  return combine(components)
}
