import type { ScoreResult } from '../scores/engine'
import { hookStrength } from './hooks'

/**
 * Deterministic script & shorts helpers (spec §34–36, docs/SCORING.md §7).
 *
 * Structure feedback ONLY — the app never claims to predict retention, and it
 * never fabricates facts. Where the creator's own material is missing the
 * result says so.
 */
export interface SegmentInput {
  label: string
  purpose: string
  guidance: string
}

export interface ScriptFeedback {
  segmentCount: number
  hasOpening: boolean
  hasPayoff: boolean
  hasCallToNext: boolean
  openingHook: ScoreResult | null
  notes: string[]
}

const OPENING_WORDS = ['intro', 'opening', 'hook', 'cold open', 'start']
const PAYOFF_WORDS = ['payoff', 'result', 'reveal', 'conclusion', 'summary', 'recap']
const NEXT_WORDS = ['next', 'cta', 'call to', 'follow-up', 'end screen', 'outro']

function matchesAny(label: string, words: string[]): boolean {
  const lower = label.toLowerCase()
  return words.some((word) => lower.includes(word))
}

/**
 * Structural review of a segmented outline. Opening/hook segments get a real
 * deterministic hook score; everything else is presence + honest notes.
 */
export function reviewScriptStructure(segments: SegmentInput[], openingText?: string): ScriptFeedback {
  const hasOpening = segments.some((s) => matchesAny(s.label, OPENING_WORDS))
  const hasPayoff = segments.some((s) => matchesAny(s.label, PAYOFF_WORDS))
  const hasCallToNext = segments.some((s) => matchesAny(s.label, NEXT_WORDS))

  const notes: string[] = []
  if (!hasOpening) notes.push('No opening/hook segment — viewers decide within the first sentences.')
  if (!hasPayoff) notes.push('No labelled payoff segment — state what the viewer walks away with.')
  if (!hasCallToNext) notes.push('No next-step segment — plan where a viewer goes after the video (honestly, not engagement-bait).')
  if (segments.length > 0 && segments.every((s) => s.guidance.trim().length === 0)) {
    notes.push('Segments have no guidance yet — add what happens in each beat.')
  }

  return {
    segmentCount: segments.length,
    hasOpening,
    hasPayoff,
    hasCallToNext,
    openingHook: openingText && openingText.trim().length > 0 ? hookStrength({ text: openingText }) : null,
    notes,
  }
}

export interface ShortIdeaInput {
  concept: string
  onScreenText: string
  firstLine: string
  sourceTimestampHint: string
}

export interface ShortIdeaReview {
  idea: ShortIdeaInput
  firstLineHook: ScoreResult
  /** Honest flags the creator must resolve before filming. */
  needsTimestamp: boolean
  notes: string[]
}

/**
 * Reviews planned shorts. The hook of each clip is scored with the same local
 * engine used for long-form; anything unresolved (like a real timestamp) is
 * surfaced as a todo, never smoothed over.
 */
export function reviewShortIdea(idea: ShortIdeaInput): ShortIdeaReview {
  const needsTimestamp = /unknown|verify/i.test(idea.sourceTimestampHint)
  const notes: string[] = []
  if (needsTimestamp) notes.push('Timestamp not located in source material — find it before filming.')
  if (idea.onScreenText.trim().length > 40) notes.push('On-screen text is long; shorts carry ~3–6 words on screen.')
  if (idea.concept.trim().length === 0) notes.push('Concept is empty.')

  return {
    idea,
    firstLineHook: hookStrength({ text: idea.firstLine }),
    needsTimestamp,
    notes,
  }
}
