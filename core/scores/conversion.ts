import type { ChannelRow, VideoRow } from '../../database/repositories'

/**
 * Conversion Studio engine (spec §45, docs/SCORING.md §17).
 *
 * Computes conversion funnel stages ONLY from numbers the user actually stored.
 * Where a stage cannot be computed (e.g. Twitch followers over time, or member
 * counts that no API exposes) the stage is honestly unavailable — never
 * inferred, never estimated.
 */
export interface ConversionStage {
  key: string
  label: string
  numerator: number | null
  denominator: number | null
  /** Percentage 0–100, or null when unavailable. */
  rate: number | null
  source: string
  whyUnavailable?: string
}

export interface ConversionFunnel {
  stages: ConversionStage[]
  availableCount: number
  notes: string[]
}

function pct(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator <= 0) return null
  return Math.round((numerator / denominator) * 1000) / 10
}

export function buildConversionFunnel(
  channel: ChannelRow | null,
  videos: VideoRow[],
): ConversionFunnel {
  const totalViews = videos.reduce((sum, v) => sum + (v.views ?? 0), 0)
  const totalLikes = videos.reduce((sum, v) => sum + (v.likes ?? 0), 0)
  const totalComments = videos.reduce((sum, v) => sum + (v.comments ?? 0), 0)
  const subscribers = channel?.subscriber_count ?? null
  const lifetimeViews = channel?.view_count ?? null

  const stages: ConversionStage[] = [
    {
      key: 'views_to_subs',
      label: 'Lifetime views → subscribers',
      numerator: subscribers,
      denominator: lifetimeViews,
      rate: pct(subscribers, lifetimeViews),
      source: channel ? 'official channel totals from last sync' : 'channel not synced',
      whyUnavailable: channel ? undefined : 'Sync a channel to use official lifetime totals.',
    },
    {
      key: 'views_to_engagement',
      label: 'Views → likes (recent uploads)',
      numerator: totalLikes > 0 ? totalLikes : null,
      denominator: totalViews > 0 ? totalViews : null,
      rate: pct(totalLikes > 0 ? totalLikes : null, totalViews > 0 ? totalViews : null),
      source: 'latest stored snapshot per video',
      whyUnavailable: totalViews > 0 ? undefined : 'No stored view/like counts yet — sync a channel.',
    },
    {
      key: 'views_to_comments',
      label: 'Views → comments (recent uploads)',
      numerator: totalComments > 0 ? totalComments : null,
      denominator: totalViews > 0 ? totalViews : null,
      rate: pct(totalComments > 0 ? totalComments : null, totalViews > 0 ? totalViews : null),
      source: 'latest stored snapshot per video',
      whyUnavailable: totalViews > 0 ? undefined : 'No stored view/comment counts yet — sync a channel.',
    },
    {
      key: 'subs_to_members',
      label: 'Subscribers → members',
      numerator: null,
      denominator: subscribers,
      rate: null,
      source: 'not exposed by official APIs',
      whyUnavailable: 'YouTube/Twitch do not expose member counts to third-party apps; this stage stays unavailable by design (§66).',
    },
  ]

  const notes = [
    'Rates are computed from the numbers shown, using the most recent sync. They are descriptions of your data, not benchmarks to feel bad about.',
    'Members stage is unavailable by design — official APIs do not expose member counts to third-party apps.',
  ]

  return {
    stages,
    availableCount: stages.filter((s) => s.rate !== null).length,
    notes,
  }
}

export interface ConversionSuggestion {
  title: string
  detail: string
}

/**
 * Deterministic, legitimacy-safe suggestions derived from the funnel. No
 * engagement-bait, no "algorithm hacks".
 */
export function conversionSuggestions(funnel: ConversionFunnel): ConversionSuggestion[] {
  const suggestions: ConversionSuggestion[] = []
  const byKey = new Map(funnel.stages.map((s) => [s.key, s]))

  const viewsToSubs = byKey.get('views_to_subs')
  if (viewsToSubs?.rate !== null && viewsToSubs?.rate !== undefined) {
    suggestions.push({
      title: 'Make the subscribe reason specific',
      detail: `Your views→subscribers rate is ${viewsToSubs.rate}%. A content-specific reason ("I update this build every league") converts better than a generic ask.`,
    })
  }
  const likes = byKey.get('views_to_engagement')
  if (likes?.rate !== null && likes?.rate !== undefined && likes.rate < 3) {
    suggestions.push({
      title: 'Ask one clear question per video',
      detail: `Your likes-per-view is ${likes.rate}%. A single, specific question in the video ("which league starter should I test next?") gives viewers a reason to engage.`,
    })
  }
  const comments = byKey.get('views_to_comments')
  if (comments?.rate !== null && comments?.rate !== undefined && comments.rate < 0.5) {
    suggestions.push({
      title: 'Answer real comments on camera',
      detail: `Your comments-per-view is ${comments.rate}%. Dedicating a short segment to answering the previous video's best question reliably deepens comment activity.`,
    })
  }
  suggestions.push({
    title: 'Put the next step in the description',
    detail: 'A single description CTA pointing at your best related video keeps momentum after the video ends — measure the change in the Experiments page.',
  })
  return suggestions
}
