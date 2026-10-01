import { clamp, combine, lin, type ScoreComponent, type ScoreResult } from '../scores/engine'

/**
 * Hook strength (spec §33, docs/SCORING.md §7).
 *
 * A deterministic, explainable heuristic for the FIRST SPOKEN SENTENCES of a
 * video. It is app-defined and explicitly NOT a retention prediction. Missing
 * inputs are excluded and the remaining weights renormalized, never treated as
 * zero (docs/SCORING.md §1).
 */
export interface HookStrengthInput {
  text: string
}

/** Typical conversational speech rate, words per second. */
const WORDS_PER_SECOND = 2.6

export function hookStrength(input: HookStrengthInput): ScoreResult {
  const text = input.text.trim()
  const words = text.split(/\s+/).filter(Boolean)
  const wordCount = words.length
  const seconds = wordCount / WORDS_PER_SECOND
  const hasText = wordCount > 0

  const components: ScoreComponent[] = [
    {
      key: 'length',
      label: 'Length & pacing',
      weight: 25,
      value: hasText ? clamp(100 - lin(seconds, 8, 20) * 0.6 - lin(wordCount, 30, 60) * 0.4) : null,
      detail: `${wordCount} words ≈ ${Math.round(seconds)}s spoken — strong hooks land within a few seconds`,
    },
    {
      key: 'frontload',
      label: 'Front-loaded payoff',
      weight: 25,
      value: hasText ? clamp(100 - Math.min(60, wordCount <= 12 ? 0 : (wordCount - 12) * 2.5)) : null,
      detail: hasText ? 'Value stated early beats a slow warm-up' : 'No hook text entered',
    },
    {
      key: 'specificity',
      label: 'Specificity',
      weight: 25,
      value: hasText ? clamp((/\d/.test(text) ? 40 : 0) + (wordCount >= 6 ? 30 : 0) + (/\b[a-z]{6,}\b/i.test(text) ? 30 : 0)) : null,
      detail: hasText ? 'Numbers, concrete nouns and named things read as specific' : 'No hook text entered',
    },
    {
      key: 'energy',
      label: 'Direct address / tension',
      weight: 25,
      value: hasText
        ? clamp(
            (/\byou\b/i.test(text) ? 34 : 0) +
              (/\?/.test(text) ? 33 : 0) +
              (/[.!?]$/.test(text) ? 33 : 0),
          )
        : null,
      detail: hasText ? 'Second person, a question, or a bold complete statement' : 'No hook text entered',
    },
  ]

  return combine(components)
}
