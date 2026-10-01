import { combine, type ScoreComponent, type ScoreResult } from './engine'

/**
 * Content Opportunity Score (spec §25, §62; docs/SCORING.md §3).
 *
 * `competition` is inverted so that lower competition yields a higher score.
 * All inputs are 0–100 and optional. Because no legitimate absolute
 * search-volume source exists for arbitrary terms, `demand` must be a *relative*
 * signal (Relative demand / Trend index) — never an invented volume (§64).
 */
export interface OpportunityInput {
  demand?: number | null
  competition?: number | null
  channelFit?: number | null
  freshness?: number | null
  historicalFit?: number | null
  audienceInterest?: number | null
  /** Human labels for the relative signals, shown in the UI. */
  demandLabel?: 'Low' | 'Medium' | 'High'
  competitionLabel?: 'Low' | 'Medium' | 'High'
}

export function opportunityScore(input: OpportunityInput): ScoreResult {
  const invertedCompetition = input.competition == null ? null : 100 - input.competition

  const components: ScoreComponent[] = [
    { key: 'demand', label: 'Demand', weight: 25, value: input.demand ?? null, detail: input.demandLabel ? `Relative demand: ${input.demandLabel}` : 'No demand signal available' },
    { key: 'competition', label: 'Competition (inverted)', weight: 20, value: invertedCompetition, detail: input.competitionLabel ? `Estimated competition: ${input.competitionLabel} → ${invertedCompetition == null ? 'n/a' : Math.round(invertedCompetition)}/100` : 'No competition estimate available' },
    { key: 'channel_fit', label: 'Channel fit', weight: 20, value: input.channelFit ?? null, detail: input.channelFit == null ? 'No creator-profile overlap computed' : `overlap with creator topics ${Math.round(input.channelFit)}/100` },
    { key: 'freshness', label: 'Freshness', weight: 15, value: input.freshness ?? null, detail: input.freshness == null ? 'No recency signal' : `signal recency ${Math.round(input.freshness)}/100` },
    { key: 'historical_fit', label: 'Historical fit', weight: 10, value: input.historicalFit ?? null, detail: input.historicalFit == null ? 'No comparable past videos' : `similar past videos ${Math.round(input.historicalFit)}/100` },
    { key: 'audience_interest', label: 'Audience interest', weight: 10, value: input.audienceInterest ?? null, detail: input.audienceInterest == null ? 'No comment/community signal' : `audience signals ${Math.round(input.audienceInterest)}/100` },
  ]

  return combine(components)
}
