import { clamp, combine, lin, type ScoreComponent, type ScoreResult } from '../scores/engine'
import { scoreTitleClarity } from '../scores/seo'

/**
 * Stream Title Assistant (spec §42, docs/SCORING.md §16).
 *
 * A deterministic, explainable score for LIVE STREAM titles. Live titles trade
 * some search intent for "right now" clarity — a viewer browsing the category
 * decides in about a second — so weights differ from the on-demand title score.
 * Improvements are produced by mechanical rules, not invented "+CTR" promises.
 */
export interface StreamTitleInput {
  title: string
  category?: string | null
  /** e.g. 'PoE 2' — checked for presence in the title. */
  game?: string | null
  platform?: 'twitch' | 'youtube'
}

export interface StreamTitleAssessment {
  score: ScoreResult
  improvements: Array<{ label: string; detail: string; severity: 'high' | 'medium' | 'low' }>
}

const SHOUTING = /^([^a-z]*[A-Z][^a-z]*){4,}$/
const PATCH = /(\bpatch\b|\bv?\d+\.\d+\b|\bseason\b|\bleague\b|\bnew\b|\bupdate\b)/i
const GOAL = /\b(road to|run|grind|ranked|first time|attempt|speedrun|no commentary|tutorial|build|review|testing)\b/i

export function assessStreamTitle(input: StreamTitleInput): StreamTitleAssessment {
  const title = input.title.trim()
  const words = title.split(/\s+/).filter(Boolean)
  const len = title.length
  const category = input.category?.trim() ?? ''
  const game = input.game?.trim() ?? ''

  // A title that only restates the category wastes the slot: the category is
  // already shown by Twitch/YouTube next to the title.
  const repeatsCategory =
    category.length > 0 && title.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim() === category.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()

  const specific = clamp((PATCH.test(title) ? 50 : 0) + (/\d/.test(title) ? 30 : 0) + (words.length >= 4 ? 20 : 0))
  const goal = clamp(GOAL.test(title) ? 80 : 40)
  const clarityResult = scoreTitleClarity(title)
  // Live titles get a bit more room than search titles before truncation.
  const lengthFit = clamp(len === 0 ? 0 : len <= 80 ? 100 : 100 - (len - 80) * 2.5)
  const freshness = clamp((PATCH.test(title) ? 60 : 20) + (game.length > 0 && title.toLowerCase().includes(game.toLowerCase()) ? 20 : 10) + lin(words.length, 2, 8) * 0.2)

  const components: ScoreComponent[] = [
    { key: 'specificity', label: 'Specificity', weight: 25, value: words.length === 0 ? null : specific, detail: PATCH.test(title) ? 'names a patch/version/update' : 'no patch or version marker' },
    { key: 'goal', label: 'Stated goal or content', weight: 20, value: words.length === 0 ? null : goal, detail: GOAL.test(title) ? 'says what will happen in the stream' : 'unclear what the stream will be' },
    { key: 'clarity', label: 'Clarity', weight: 20, value: words.length === 0 ? null : clarityResult.value, detail: clarityResult.detail },
    { key: 'length_fit', label: 'Length fit', weight: 15, value: words.length === 0 ? null : lengthFit, detail: `${len} chars (live soft limit ~80)` },
    { key: 'freshness', label: 'Freshness signals', weight: 10, value: words.length === 0 ? null : freshness, detail: 'patch/version words and game name read as current' },
    { key: 'not_category', label: 'Adds beyond category', weight: 10, value: words.length === 0 ? null : repeatsCategory ? 0 : 100, detail: repeatsCategory ? 'title only restates the category' : 'title adds information beyond the category name' },
  ]

  const improvements: StreamTitleAssessment['improvements'] = []
  if (!PATCH.test(title)) improvements.push({ label: 'Add the current patch or version', detail: 'e.g. "Patch 0.4" — live category browsers look for what is current', severity: 'high' })
  if (!GOAL.test(title)) improvements.push({ label: 'Clarify the challenge or goal', detail: 'e.g. "road to endgame", "first attempt", "ranked grind"', severity: 'medium' })
  if (SHOUTING.test(title)) improvements.push({ label: 'Reduce capitalization', detail: 'ALL-CAPS words read as spam in category listings', severity: 'medium' })
  if (repeatsCategory) improvements.push({ label: 'Say more than the category name', detail: 'the category is already displayed next to your title', severity: 'high' })
  if (len > 80) improvements.push({ label: 'Shorten the title', detail: `${len} chars — the tail truncates in most layouts`, severity: 'low' })
  if (len > 0 && len < 20) improvements.push({ label: 'Add a little more detail', detail: 'very short titles rarely say why to watch this stream', severity: 'low' })

  return { score: combine(components), improvements }
}
