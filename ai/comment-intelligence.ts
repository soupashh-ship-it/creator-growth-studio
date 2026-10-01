/**
 * Comment intelligence (spec §49).
 *
 * Runs locally with rule-based classification, so it works with no AI provider
 * connected. The AI layer can add nuance later but the local signal already
 * answers "what are viewers repeatedly asking for?", which drives content ideas.
 */
export type CommentCategory =
  | 'question'
  | 'praise'
  | 'criticism'
  | 'feature_request'
  | 'confusion'
  | 'repeated_request'
  | 'video_idea'
  | 'bug'

export interface ClassifiedComment {
  text: string
  category: CommentCategory
  confidence: 'high' | 'medium' | 'low'
  reasons: string[]
}

interface Signal {
  category: CommentCategory
  patterns: RegExp[]
  reason: string
}

const SIGNALS: Signal[] = [
  { category: 'bug', patterns: [/\b(doesn'?t|does not|won'?t|not) work\b/i, /\bbroken\b/i, /\berror\b/i, /\bcrash(es|ed|ing)?\b/i, /\bbug\b/i], reason: 'reports something not working' },
  { category: 'confusion', patterns: [/\bconfus(ed|ing)\b/i, /\bdon'?t understand\b/i, /\bnot sure (how|what|why)\b/i, /\blost\b/i], reason: 'expresses confusion' },
  { category: 'feature_request', patterns: [/\bcan you (please )?(make|add|do|show)\b/i, /\bwould love\b/i, /\bplease (make|add|cover)\b/i, /\bsuggestion\b/i], reason: 'requests something be made or added' },
  { category: 'video_idea', patterns: [/\bvideo (about|on|idea)\b/i, /\bcover\b.*\?/i, /\bnext video\b/i, /\bdo a video\b/i], reason: 'suggests a future video' },
  { category: 'criticism', patterns: [/\b(worst|bad|dislike|hate|disappoint|clickbait|misleading)\b/i], reason: 'expresses criticism' },
  { category: 'praise', patterns: [/\b(thanks|thank you|great|awesome|amazing|love (this|it)|helped me|goat|underrated)\b/i], reason: 'expresses appreciation' },
  { category: 'question', patterns: [/\?/, /\bhow (do|did|can)\b/i, /\bwhat (is|are|should)\b/i, /\bwhich\b/i], reason: 'asks a question' },
]

export function classifyComment(text: string): ClassifiedComment {
  const reasons: string[] = []
  let best: CommentCategory = 'question'
  let bestScore = 0

  for (const signal of SIGNALS) {
    let hits = 0
    for (const pattern of signal.patterns) if (pattern.test(text)) hits += 1
    if (hits > 0) reasons.push(`${signal.category}: ${signal.reason}`)
    if (hits > bestScore) {
      bestScore = hits
      best = signal.category
    }
  }

  if (bestScore === 0) {
    return { text, category: 'praise', confidence: 'low', reasons: ['No strong signal; treated as neutral.'] }
  }
  return { text, category: best, confidence: bestScore >= 2 ? 'high' : 'medium', reasons }
}

export interface CommentSummary {
  total: number
  byCategory: Record<CommentCategory, number>
  repeatedRequests: Array<{ phrase: string; count: number; example: string }>
  suggestedVideoTitles: string[]
}

function emptyCounts(): Record<CommentCategory, number> {
  return {
    question: 0,
    praise: 0,
    criticism: 0,
    feature_request: 0,
    confusion: 0,
    repeated_request: 0,
    video_idea: 0,
    bug: 0,
  }
}

/**
 * Detects requests that appear repeatedly across comments (spec §49) — a strong
 * signal for the next video. Uses shared significant phrases, not exact matches.
 */
export function summarizeComments(comments: string[]): CommentSummary {
  const byCategory = emptyCounts()
  const classified: ClassifiedComment[] = []

  for (const text of comments) {
    const result = classifyComment(text)
    classified.push(result)
    byCategory[result.category] += 1
  }

  const phraseMap = new Map<string, { count: number; example: string }>()
  for (const comment of classified) {
    if (!['question', 'feature_request', 'video_idea', 'confusion', 'bug'].includes(comment.category)) continue
    const words = comment.text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3)
    for (let size = 2; size <= 3; size += 1) {
      for (let i = 0; i + size <= words.length; i += 1) {
        const phrase = words.slice(i, i + size).join(' ')
        if (phrase.length < 8) continue
        const entry = phraseMap.get(phrase) ?? { count: 0, example: comment.text }
        entry.count += 1
        phraseMap.set(phrase, entry)
      }
    }
  }

  const repeatedRequests = [...phraseMap.entries()]
    .filter(([, entry]) => entry.count >= 2)
    .map(([phrase, entry]) => ({ phrase, count: entry.count, example: entry.example }))
    .sort((a, b) => b.count - a.count)
    // Drop sub-phrases of stronger matches to avoid near-duplicates.
    .filter((candidate, index, all) => !all.slice(0, index).some((other) => other.phrase.includes(candidate.phrase)))
    .slice(0, 10)

  return {
    total: comments.length,
    byCategory,
    repeatedRequests,
    suggestedVideoTitles: repeatedRequests.map((r) => titleCase(r.phrase)),
  }
}

function titleCase(phrase: string): string {
  return phrase
    .split(' ')
    .map((word) => (word.length <= 2 ? word : word[0]?.toUpperCase() + word.slice(1)))
    .join(' ')
}
