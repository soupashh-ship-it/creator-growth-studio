import { generateContentPlan, type ContentPlanItem, type KeywordInsight } from './keywords'

/**
 * Turns saved keyword rows into a content plan (spec §21, §31).
 *
 * Deterministic and offline: it reuses the stored opportunity values rather than
 * recomputing (or inventing) demand, and clusters the terms. An idea from this
 * plan is a suggestion, not a promise of performance.
 */
export interface SavedKeywordLike {
  term: string
  intent: string | null
  relative_demand: string | null
  competition_estimate: string | null
  opportunity: number | null
  source: string
}

export function planFromSavedKeywords(keywords: SavedKeywordLike[]): ContentPlanItem[] {
  if (keywords.length === 0) return []

  const insights: KeywordInsight[] = keywords.map((keyword) => ({
    term: keyword.term,
    intent: (keyword.intent ?? 'entertainment') as KeywordInsight['intent'],
    intentConfidence: 'low',
    opportunity: keyword.opportunity,
    confidence: 'low',
    relativeDemand: (keyword.relative_demand ?? 'Unknown') as KeywordInsight['relativeDemand'],
    competitionEstimate: (keyword.competition_estimate ?? 'Unknown') as KeywordInsight['competitionEstimate'],
    source: keyword.source,
    explanation: [],
  }))

  return generateContentPlan(insights)
}

/** Suggested working title for a plan item — plain and factual. */
export function suggestTitleFor(term: string): string {
  const cleaned = term.trim()
  if (!cleaned) return ''
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}
