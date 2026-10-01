import { clamp, combine, lin, type ScoreComponent, type ScoreResult } from './engine'
import { scoreTitleClarity, scoreTitleLength } from './seo'

export type TitlePlatform = 'youtube' | 'youtube-shorts' | 'twitch' | 'instagram' | 'tiktok'

export interface TitleScoreInput {
  title: string
  primaryKeyword?: string | null
  platform?: TitlePlatform
}

const CURIOSITY = /\b(why|how|what|secret|truth|actually|really|insane|broken|tested|i tried)\b/i
const SPECIFICITY = /(\d+(\.\d+)?|\bv?\d+\b|patch|update|season|league|episode|#\d+)/i

const normalize = (t: string): string => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ')

/** Deterministic, explainable title score used by the generator and the A/B lab. */
export function scoreTitle(input: TitleScoreInput): ScoreResult {
  const platform = input.platform ?? 'youtube'
  const title = input.title.trim()
  const normalized = normalize(title)

  const keyword = input.primaryKeyword?.trim() ?? ''
  const keywordPresent = keyword.length > 0 && normalized.includes(normalize(keyword).trim())
  const keywordPos = keyword.length > 0 ? normalized.indexOf(normalize(keyword).trim()) : -1

  const searchRelevance = keyword.length === 0 ? null : clamp((keywordPresent ? 70 : 0) + (keywordPos >= 0 && keywordPos < 25 ? 30 : keywordPos >= 0 ? 12 : 0))

  const specificity = clamp((SPECIFICITY.test(title) ? 60 : 20) + (title.split(/\s+/).length >= 6 ? 25 : 10) + (/\|/.test(title) ? 15 : 0))
  const curiosity = clamp((CURIOSITY.test(title) ? 55 : 25) + (/\.\.\.|\?$/.test(title) ? 20 : 0) + (/\b(insane|broken|worth it)\b/i.test(title) ? 25 : 0))
  const clarity = scoreTitleClarity(title).value
  const length = scoreTitleLength(title)

  const idealMax = platform === 'youtube-shorts' || platform === 'tiktok' || platform === 'instagram' ? 55 : 70
  const len = title.length
  const platformFit = clamp(len === 0 ? 0 : len <= idealMax ? 100 : 100 - (len - idealMax) * 2.5)

  const components: ScoreComponent[] = [
    { key: 'search_relevance', label: 'Search relevance', weight: 25, value: searchRelevance, detail: keyword.length === 0 ? 'No primary keyword provided' : `${keywordPresent ? 'term present' : 'term missing'} (position ${keywordPos})` },
    { key: 'specificity', label: 'Specificity', weight: 15, value: specificity, detail: SPECIFICITY.test(title) ? 'contains a number/version/patch marker' : 'no concrete number or version' },
    { key: 'curiosity', label: 'Curiosity gap', weight: 15, value: curiosity, detail: CURIOSITY.test(title) ? 'uses a curiosity-driving construction' : 'little curiosity pull' },
    { key: 'clarity', label: 'Clarity', weight: 20, value: clarity, detail: scoreTitleClarity(title).detail },
    { key: 'length_fit', label: 'Length fit', weight: 10, value: length.value, detail: length.detail },
    { key: 'platform_fit', label: 'Platform fit', weight: 15, value: platformFit, detail: `${len} chars vs ${platform} soft limit ${idealMax}` },
  ]

  return combine(components)
}

export interface TitleComparison {
  searchRelevance: number | null
  specificity: number | null
  curiosity: number | null
  clarity: number | null
  evergreenPotential: number | null
  newsPotential: number | null
  likelyStrength: string
  likelyWeakness: string
  bestAudience: string
}

/**
 * A/B comparison (spec §15). Deliberately does NOT claim a statistically
 * certain CTR difference — only likely strengths/weaknesses, as required.
 */
export function compareTitles(a: TitleScoreInput, b: TitleScoreInput): {
  a: ScoreResult
  b: ScoreResult
  summary: { a: TitleComparison; b: TitleComparison }
} {
  const scoreA = scoreTitle(a)
  const scoreB = scoreTitle(b)

  const build = (input: TitleScoreInput, result: ScoreResult): TitleComparison => {
    const get = (key: string): number | null => result.components.find((c) => c.key === key)?.value ?? null
    const newsPotential = get('specificity')
    const evergreen = get('clarity') == null ? null : clamp((get('clarity') as number) * 0.6 + (get('search_relevance') ?? 50) * 0.4)
    const strongest = [...result.components].filter((c) => c.value !== null).sort((x, y) => (y.value as number) - (x.value as number))[0]
    const weakest = [...result.components].filter((c) => c.value !== null).sort((x, y) => (x.value as number) - (y.value as number))[0]
    return {
      searchRelevance: get('search_relevance'),
      specificity: get('specificity'),
      curiosity: get('curiosity'),
      clarity: get('clarity'),
      evergreenPotential: evergreen,
      newsPotential,
      likelyStrength: strongest ? strongest.label : 'Unknown',
      likelyWeakness: weakest ? weakest.label : 'Unknown',
      bestAudience: input.platform === 'youtube-shorts' ? 'mobile/short-form viewers' : 'search-oriented viewers',
    }
  }

  return { a: scoreA, b: scoreB, summary: { a: build(a, scoreA), b: build(b, scoreB) } }
}

/** Length-fit helper reused by generators. */
export const titleLengthValue = (title: string): number => lin(title.length, 0, 70)
