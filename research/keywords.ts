import { classifyIntent, type SearchIntent } from '../core/seo/intent'
import { opportunityScore } from '../core/scores/opportunity'

/**
 * Keyword research (spec §20–22, §64).
 *
 * IMPORTANT: this module never invents search volume. Where a legitimate source
 * provides an index we label it; otherwise demand is reported as a *relative*
 * band ("Low/Medium/High") plus an explicit source.
 */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'in', 'on', 'for', 'to', 'and', 'or', 'how', 'what', 'why',
  'with', 'my', 'your', 'best', 'vs', 'versus', 'is', 'are', 'do', 'does', 'can',
])

export function tokenize(term: string): string[] {
  return term
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
}

export interface KeywordCluster {
  label: string
  terms: string[]
}

/**
 * Groups keyword phrases by their most significant shared token, e.g.
 * "poe 2 deadeye build" and "poe 2 deadeye gear" both cluster under "deadeye"
 * when that is the most common distinctive token (spec §21).
 */
export function clusterKeywords(terms: string[]): KeywordCluster[] {
  const frequency = new Map<string, number>()
  for (const term of terms) {
    for (const token of tokenize(term)) {
      frequency.set(token, (frequency.get(token) ?? 0) + 1)
    }
  }

  const groups = new Map<string, string[]>()
  for (const term of terms) {
    const tokens = tokenize(term)
    let label = 'other'
    let bestScore = -1
    for (const token of tokens) {
      const score = frequency.get(token) ?? 0
      if (score > bestScore) {
        bestScore = score
        label = token
      }
    }
    const bucket = groups.get(label) ?? []
    bucket.push(term)
    groups.set(label, bucket)
  }

  return [...groups.entries()]
    .map(([label, clusterTerms]) => ({ label, terms: [...clusterTerms].sort() }))
    .sort((a, b) => b.terms.length - a.terms.length || a.label.localeCompare(b.label))
}

export type DemandBand = 'Low' | 'Medium' | 'High' | 'Unknown'
export type CompetitionBand = 'Low' | 'Medium' | 'High' | 'Unknown'

export interface KeywordInput {
  term: string
  /** 0–100 index from a legitimate observed signal (never a volume). */
  demandIndex?: number | null
  /** 0–100 estimate; higher means more competitive. */
  competitionIndex?: number | null
  channelFit?: number | null
  freshness?: number | null
  /** Where the signal came from, shown verbatim to the user. */
  source?: string
}

export interface KeywordInsight {
  term: string
  intent: SearchIntent
  intentConfidence: string
  opportunity: number | null
  confidence: 'high' | 'medium' | 'low'
  relativeDemand: DemandBand
  competitionEstimate: CompetitionBand
  source: string
  explanation: string[]
}

function bandFromIndex(index: number | null | undefined): DemandBand {
  if (index === null || index === undefined) return 'Unknown'
  if (index >= 67) return 'High'
  if (index >= 34) return 'Medium'
  return 'Low'
}

export function analyzeKeyword(input: KeywordInput): KeywordInsight {
  const intent = classifyIntent(input.term)
  const score = opportunityScore({
    demand: input.demandIndex ?? null,
    demandLabel: bandFromIndex(input.demandIndex) === 'Unknown' ? undefined : (bandFromIndex(input.demandIndex) as 'Low' | 'Medium' | 'High'),
    competition: input.competitionIndex ?? null,
    competitionLabel:
      bandFromIndex(input.competitionIndex) === 'Unknown'
        ? undefined
        : (bandFromIndex(input.competitionIndex) as 'Low' | 'Medium' | 'High'),
    channelFit: input.channelFit ?? null,
    freshness: input.freshness ?? null,
  })

  return {
    term: input.term,
    intent: intent.intent,
    intentConfidence: intent.confidence,
    opportunity: score.score,
    confidence: score.confidence,
    relativeDemand: bandFromIndex(input.demandIndex),
    competitionEstimate: bandFromIndex(input.competitionIndex),
    source: input.source ?? 'locally_derived',
    explanation: score.explanation,
  }
}

export interface ContentPlanItem {
  cluster: string
  term: string
  intent: SearchIntent
  opportunity: number | null
}

/** Turns clusters into an ordered content plan (spec §21). */
export function generateContentPlan(insights: KeywordInsight[]): ContentPlanItem[] {
  const clusters = clusterKeywords(insights.map((i) => i.term))
  const byTerm = new Map(insights.map((i) => [i.term, i]))

  return clusters.flatMap((cluster) =>
    cluster.terms.map((term) => {
      const insight = byTerm.get(term)
      return {
        cluster: cluster.label,
        term,
        intent: insight?.intent ?? 'entertainment',
        opportunity: insight?.opportunity ?? null,
      }
    }),
  ).sort((a, b) => (b.opportunity ?? -1) - (a.opportunity ?? -1))
}
