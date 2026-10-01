import { scoreSeo, type SeoInput, type SeoResult } from '../scores/seo'

/**
 * Batch SEO optimizer (spec §13, §18).
 *
 * A **deterministic**, offline "optimize everything" pass. It rewrites the
 * title, description and tags using explicit rules derived from the scoring
 * inputs, then re-scores the draft with the same engine. It never invents facts,
 * never promises a ranking, and every change records its own reason.
 *
 * AI may offer a *separate* labelled variant; it can never overwrite these
 * deterministic numbers.
 */
export interface OptimizeChange {
  field: 'title' | 'description' | 'tags'
  from: string
  to: string
  reason: string
}

export interface OptimizeDraft extends SeoInput {
  title: string
  description: string
  tags: string[]
}

export interface OptimizeResult {
  draft: OptimizeDraft
  changes: OptimizeChange[]
  before: SeoResult
  after: SeoResult
  /** Honest caveats shown next to the draft. */
  notes: string[]
}

const TITLE_MAX = 70
const TITLE_MIN = 30
const MAX_TAGS = 15
const KEYWORD_WINDOW = 150

const normalize = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').trim()
const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim()

function containsTerm(haystack: string, term: string): boolean {
  const needle = normalize(term)
  if (!needle) return false
  return normalize(haystack).includes(needle)
}

/** Truncates to `max` characters on a word boundary, dropping trailing punctuation. */
export function truncateTitle(title: string, max = TITLE_MAX): string {
  if (title.length <= max) return title
  const cut = title.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  const trimmed = (lastSpace > TITLE_MIN ? cut.slice(0, lastSpace) : cut).replace(/[\s\-–—|,:;.]+$/u, '')
  return trimmed
}

function normalizeTags(tags: string[], keywords: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of [...keywords, ...tags]) {
    const tag = collapse(raw).toLowerCase()
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    out.push(tag)
    if (out.length >= MAX_TAGS) break
  }
  return out
}

export function optimizeSeo(input: SeoInput): OptimizeResult {
  const changes: OptimizeChange[] = []
  const keyword = collapse(input.primaryKeyword ?? '')
  const subtopics = input.expectedSubtopics ?? []

  // --- title ---------------------------------------------------------------
  let title = collapse(input.title)
  const originalTitle = title

  if (title.length > TITLE_MAX) {
    title = truncateTitle(title)
  }

  if (keyword && !containsTerm(title, keyword)) {
    title = collapse(`${keyword} — ${title}`)
  }

  if (title.length > TITLE_MAX) {
    // Keyword-first guarantees the truncation keeps the primary keyword.
    title = truncateTitle(title)
  }

  if (title.length > 0 && title.length < TITLE_MIN && subtopics[0]) {
    title = collapse(`${title} (${subtopics[0]})`)
  }

  if (title !== originalTitle) {
    changes.push({
      field: 'title',
      from: originalTitle,
      to: title,
      reason: !keyword
        ? 'Brought the title within the recommended length and removed extra whitespace.'
        : 'Puts the primary keyword near the start and keeps the title within the recommended length.',
    })
  }

  // --- description ---------------------------------------------------------
  const originalDescription = input.description
  let description = input.description.replace(/[ \t]+/g, ' ').trim()

  if (keyword && !containsTerm(description.slice(0, KEYWORD_WINDOW), keyword)) {
    description = description.length === 0 ? `In this video: ${keyword}.` : `In this video: ${keyword}.\n\n${description}`
  }

  const topicList = [...subtopics, keyword].map((t) => collapse(t)).filter(Boolean)
  if (description.length < 200 && topicList.length > 0) {
    const unique = [...new Set(topicList.map((t) => t.toLowerCase()))]
    description = `${description}${description ? '\n\n' : ''}Topics covered: ${unique.join(', ')}.`
  }

  if (description !== originalDescription) {
    changes.push({
      field: 'description',
      from: originalDescription,
      to: description,
      reason: 'Front-loads the primary keyword and names the subtopics the description should cover.',
    })
  }

  // --- tags ----------------------------------------------------------------
  const tags = normalizeTags(input.tags, [keyword, ...subtopics])
  if (tags.join(',') !== input.tags.join(',')) {
    changes.push({
      field: 'tags',
      from: input.tags.join(', '),
      to: tags.join(', '),
      reason: 'Adds the primary keyword and expected subtopics, lowercases and de-duplicates, and caps the list.',
    })
  }

  const before = scoreSeo(input)
  const draft: OptimizeDraft = {
    ...input,
    title,
    description,
    tags,
    primaryKeyword: keyword,
    expectedSubtopics: subtopics,
  }
  const after = scoreSeo(draft)

  const notes = [
    'These edits are deterministic and applied locally; they are packaging improvements, not a ranking guarantee.',
    'Review the wording before publishing — the optimizer cannot check factual accuracy.',
  ]
  if (!keyword) {
    notes.unshift('No primary keyword was set, so keyword placement was left unchanged.')
  }

  return { draft, changes, before, after, notes }
}
