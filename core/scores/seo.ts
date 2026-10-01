import { classifyIntent, type SearchIntent } from '../seo/intent'
import { clamp, combine, lin, type ScoreComponent, type ScoreResult } from './engine'

/**
 * Video SEO Score (spec §12, formula in docs/SCORING.md §2).
 *
 * Deterministic components only. AI may add qualitative commentary but cannot
 * change these numbers (that would be a separate, labelled `ai_estimate`).
 */
export interface SeoInput {
  title: string
  description: string
  tags: string[]
  primaryKeyword: string
  secondaryKeywords?: string[]
  category?: string | null
  language?: string | null
  videoType?: string | null
  /** Optional upstream opportunity signal, 0–100. */
  topicOpportunity?: number | null
  /** Expected subtopics for semantic coverage (e.g. from keyword clusters). */
  expectedSubtopics?: string[]
}

export interface SeoRecommendation {
  label: string
  /** Estimated point gain if applied (internal comparison, not a ranking promise). */
  delta: number
  rationale: string
}

export interface SeoResult {
  result: ScoreResult
  intent: { intent: SearchIntent; confidence: string; reasons: string[] }
  recommendations: SeoRecommendation[]
  /** Optimistic score if all recommendations were applied. */
  predictedOptimizedScore: number | null
}

const normalize = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ')

function containsTerm(haystack: string, term: string): boolean {
  const t = normalize(term).trim()
  if (!t) return false
  return normalize(haystack).includes(t)
}

/** Fraction of expected subtopics present anywhere in the analyzed text. */
export function semanticCoverage(text: string, subtopics: string[]): number | null {
  if (subtopics.length === 0) return null
  const present = subtopics.filter((topic) => containsTerm(text, topic)).length
  return (present / subtopics.length) * 100
}

const CLICKBAIT = /\b(insane|broken|secret|you won'?t believe|shocking|must watch)\b/i

export function scoreTitleClarity(title: string): { value: number; detail: string } {
  const letters = title.replace(/[^A-Za-z]/g, '')
  const capsRatio = letters.length === 0 ? 0 : title.replace(/[^A-Z]/g, '').length / letters.length
  const words = title.trim().split(/\s+/).filter(Boolean)
  const lengthPenalty = words.length === 0 ? 100 : words.length > 18 ? 30 : 0
  const capsPenalty = capsRatio > 0.35 ? 35 : capsRatio > 0.2 ? 15 : 0
  const clickbaitPenalty = CLICKBAIT.test(title) ? 15 : 0
  const value = clamp(100 - lengthPenalty - capsPenalty - clickbaitPenalty)
  return {
    value,
    detail: `${words.length} words, ${Math.round(capsRatio * 100)}% capitals${
      clickbaitPenalty ? ', clickbait phrasing' : ''
    }`,
  }
}

export function scoreTitleLength(title: string): { value: number; detail: string } {
  const len = title.length
  // Sweet spot ~40–70 characters; falls off outside 25–100.
  const value = len === 0 ? 0 : len < 25 ? lin(len, 0, 25) : len > 100 ? clamp(100 - (len - 100) * 2) : len < 40 ? lin(len, 25, 40) * 0.3 + 70 : len > 70 ? 100 - (len - 70) * 1.2 : 100
  return { value: clamp(value), detail: `${len} characters (sweet spot 40–70)` }
}

export function scoreSeo(input: SeoInput): SeoResult {
  const combined = `${input.title}\n${input.description}\n${input.tags.join(' ')}`
  const primaryInTitle = containsTerm(input.title, input.primaryKeyword)
  const primaryPos = normalize(input.title).indexOf(normalize(input.primaryKeyword).trim())
  const first150 = input.description.slice(0, 150)

  const titleRelevanceValue = !input.primaryKeyword
    ? null
    : clamp((primaryInTitle ? 60 : 0) + (primaryPos >= 0 && primaryPos < 25 ? 25 : primaryPos >= 0 ? 10 : 0) + scoreTitleLength(input.title).value * 0.15)

  const placementChecks = [
    primaryInTitle,
    containsTerm(first150, input.primaryKeyword),
    input.tags.some((t) => containsTerm(t, input.primaryKeyword)),
  ]
  const secondaryCovered = (input.secondaryKeywords ?? []).filter((k) => containsTerm(combined, k)).length
  const secondaryTotal = (input.secondaryKeywords ?? []).length
  const keywordPlacement =
    !input.primaryKeyword
      ? null
      : clamp((placementChecks.filter(Boolean).length / placementChecks.length) * 80 + (secondaryTotal ? (secondaryCovered / secondaryTotal) * 20 : 20))

  const descLen = input.description.trim().length
  const descValue = clamp(
    (descLen >= 250 ? 40 : lin(descLen, 0, 250) * 0.4) +
      (containsTerm(first150, input.primaryKeyword) ? 25 : 0) +
      (/(^|\n)\s*\d{1,2}:\d{2}/.test(input.description) ? 20 : 0) +
      (/https?:\/\//.test(input.description) ? 15 : 0),
  )

  const metadataChecks = [
    Boolean(input.category),
    Boolean(input.language),
    input.tags.length >= 5,
    input.tags.length >= 1,
    /#[A-Za-z0-9_]+/.test(`${input.title} ${input.description}`),
  ]
  const metadata = (metadataChecks.filter(Boolean).length / metadataChecks.length) * 100

  const coverage = semanticCoverage(combined, input.expectedSubtopics ?? [])

  const detected = classifyIntent(`${input.title} ${input.description} ${input.tags.join(' ')}`)
  const declared = (input.videoType ?? '').toLowerCase()
  const intentMatch =
    !declared ? (detected.confidence === 'high' ? 80 : 60) : detected.intent.toString().includes(declared.split(' ')[0] ?? '') ? 100 : 55

  const clarity = scoreTitleClarity(input.title)
  const length = scoreTitleLength(input.title)

  const components: ScoreComponent[] = [
    { key: 'title_relevance', label: 'Title relevance', weight: 20, value: titleRelevanceValue, detail: input.primaryKeyword ? `${primaryInTitle ? 'primary term present' : 'primary term missing'} at position ${primaryPos}; ${length.detail}` : 'No primary keyword provided' },
    { key: 'search_intent', label: 'Search intent match', weight: 15, value: intentMatch, detail: `detected "${detected.intent}" (${detected.confidence}); declared "${input.videoType ?? 'none'}"` },
    { key: 'semantic_coverage', label: 'Semantic topic coverage', weight: 15, value: coverage, detail: coverage == null ? 'No expected subtopics provided' : `${Math.round(coverage)}% of expected subtopics present` },
    { key: 'description', label: 'Description quality', weight: 10, value: descValue, detail: `${descLen} chars, ${containsTerm(first150, input.primaryKeyword) ? 'term in first 150 chars' : 'term not in first 150 chars'}` },
    { key: 'keyword_placement', label: 'Keyword placement', weight: 10, value: keywordPlacement, detail: `${placementChecks.filter(Boolean).length}/3 primary placements; ${secondaryCovered}/${secondaryTotal || 'n/a'} secondary terms` },
    { key: 'topic_opportunity', label: 'Topic opportunity', weight: 15, value: input.topicOpportunity ?? null, detail: input.topicOpportunity == null ? 'No trend/keyword signal provided' : `upstream opportunity ${input.topicOpportunity}/100` },
    { key: 'metadata', label: 'Metadata completeness', weight: 5, value: metadata, detail: `${metadataChecks.filter(Boolean).length}/${metadataChecks.length} metadata checks passed` },
    { key: 'title_clarity', label: 'Title clarity', weight: 10, value: clarity.value, detail: clarity.detail },
  ]

  const result = combine(components)
  const recommendations: SeoRecommendation[] = []

  const totalWeight = components.reduce((s, c) => s + c.weight, 0)
  const gain = (componentKey: string, target: number): number => {
    const c = components.find((x) => x.key === componentKey)
    if (!c || c.value === null) return 0
    return Math.round(((target - c.value) * c.weight) / totalWeight)
  }

  if (input.primaryKeyword && !primaryInTitle) {
    recommendations.push({ label: `Add the primary term "${input.primaryKeyword}" to the title`, delta: gain('title_relevance', 85), rationale: 'The primary search term is absent from the title.' })
  }
  if (input.primaryKeyword && primaryPos >= 25) {
    recommendations.push({ label: 'Move the primary term earlier in the title', delta: Math.max(2, Math.round(gain('title_relevance', 85) * 0.4)), rationale: 'Terms near the start of a title are clearer and more relevant.' })
  }
  if (descLen < 250) {
    recommendations.push({ label: 'Expand the description to at least 250 characters', delta: gain('description', 80), rationale: 'Longer, substantive descriptions cover more query phrasing.' })
  }
  if (!containsTerm(first150, input.primaryKeyword)) {
    recommendations.push({ label: 'Mention the primary term in the first 150 characters', delta: gain('description', 75), rationale: 'The opening of a description has the most weight.' })
  }
  if (!/(^|\n)\s*\d{1,2}:\d{2}/.test(input.description)) {
    recommendations.push({ label: 'Add chapter timestamps', delta: gain('description', 70), rationale: 'Chapters improve navigation and retention.' })
  }
  if (input.tags.length < 5) {
    recommendations.push({ label: 'Add more tags (at least 5)', delta: gain('metadata', 100), rationale: 'Tags are part of metadata completeness.' })
  }
  if (coverage !== null && coverage < 70) {
    recommendations.push({ label: 'Cover more expected subtopics in the title/description', delta: gain('semantic_coverage', 85), rationale: 'Broader semantic coverage matches more query variations.' })
  }

  const predicted = result.score === null ? null : clamp(result.score + recommendations.reduce((s, r) => s + r.delta, 0))

  return {
    result,
    intent: { intent: detected.intent, confidence: detected.confidence, reasons: detected.reasons },
    recommendations: recommendations.sort((a, b) => b.delta - a.delta),
    predictedOptimizedScore: predicted,
  }
}
