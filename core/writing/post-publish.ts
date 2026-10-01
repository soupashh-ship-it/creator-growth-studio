import type { ScoreResult } from '../scores/engine'
import { scoreTitle } from '../scores/title'

/**
 * Post-publish optimizer (spec §54, docs/SCORING.md §20).
 *
 * Deterministic suggestions for a PUBLISHED video, computed from the title and
 * stored performance vs the channel median. The app NEVER edits anything on the
 * platform: every suggestion is an action the creator takes manually, and
 * packaging changes should be logged in the Experiments page.
 */
export interface PostPublishSuggestion {
  action: string
  detail: string
  /** Where the user acts on this. */
  linkPage?: string
}

export interface PostPublishReview {
  titleScore: ScoreResult
  belowMedian: boolean
  medianRatio: number | null
  suggestions: PostPublishSuggestion[]
  notes: string[]
}

export interface PostPublishInput {
  title: string
  primaryKeyword?: string | null
  views: number | null
  /** Channel median views over comparable uploads, or null if unknown. */
  channelMedianViews: number | null
  likes: number | null
  comments: number | null
}

export function reviewPublishedVideo(input: PostPublishInput): PostPublishReview {
  const titleScore = scoreTitle({ title: input.title, primaryKeyword: input.primaryKeyword ?? null })
  const suggestions: PostPublishSuggestion[] = []

  const medianRatio =
    input.views !== null && input.channelMedianViews !== null && input.channelMedianViews > 0
      ? Math.round((input.views / input.channelMedianViews) * 10) / 10
      : null
  const belowMedian = medianRatio !== null && medianRatio < 0.7

  // Title quality signals from the deterministic engine.
  const keywordMissing = titleScore.components.find((c) => c.key === 'search_relevance')?.value === 0
  const weakClarity = (titleScore.components.find((c) => c.key === 'clarity')?.value ?? 100) < 50
  const overlong = (titleScore.components.find((c) => c.key === 'platform_fit')?.value ?? 100) < 60

  if (keywordMissing) {
    suggestions.push({
      action: 'Test a title with the primary keyword',
      detail: 'The title has no clear search term. Write a search-first variant in Titles, then log the change as a title experiment.',
      linkPage: 'Titles',
    })
  }
  if (weakClarity) {
    suggestions.push({
      action: 'Simplify the title',
      detail: 'Clarity is scored low (caps/length/structure). A clearer title usually lifts search click-through on older videos.',
      linkPage: 'Titles',
    })
  }
  if (overlong) {
    suggestions.push({
      action: 'Shorten the title',
      detail: 'The tail truncates in most placements. Front-load the keyword and cut filler.',
      linkPage: 'Titles',
    })
  }
  if (belowMedian) {
    suggestions.push({
      action: 'Consider a thumbnail revision',
      detail: `Views are ${medianRatio}× the channel median. Packaging is the usual lever for published videos — change one element at a time and log it.`,
      linkPage: 'Thumbnails',
    })
  }
  if ((input.comments ?? 0) === 0 && (input.views ?? 0) > 500) {
    suggestions.push({
      action: 'Add a pinned comment with one question',
      detail: 'The video has views but no comments. A single specific question in a pinned comment is the lightest-touch fix.',
    })
  }
  if (medianRatio !== null && medianRatio > 1.5) {
    suggestions.push({
      action: 'Make a follow-up',
      detail: `This video is at ${medianRatio}× the channel median — audience demand for this topic is proven. Plan a follow-up or series entry.`,
      linkPage: 'Video Ideas',
    })
  }
  if (suggestions.length === 0) {
    suggestions.push({
      action: 'Healthy — no packaging changes suggested',
      detail: 'Title scores are reasonable and performance is near the channel median. Leave it alone; constant edits reset packaging experiments.',
    })
  }

  const notes = [
    'Suggestions are heuristics. A published video can be edited, but change one variable at a time and record it in Experiments — otherwise the cause of any change is unknowable.',
    'The app never edits platform content on its own; every action here is manual.',
  ]

  return { titleScore, belowMedian, medianRatio, suggestions, notes }
}
