/**
 * Shared scoring primitives (spec §62, §63, §96).
 *
 * Every application-defined score is built from weighted components and MUST be
 * explainable: `combine` returns the components, the weights actually used, the
 * input coverage, and a confidence label, so the UI can render "Why this score?"
 *
 * Missing inputs are excluded and the remaining weights are renormalized over
 * the present components. `coverage = presentWeight / totalWeight` and the
 * result is marked low-confidence below 60% coverage.
 */

export type Confidence = 'high' | 'medium' | 'low'

export interface ScoreComponent {
  key: string
  label: string
  /** 0–100, or null when the underlying input was unavailable. */
  value: number | null
  /** Relative weight; may be any positive number. */
  weight: number
  /** Human-readable explanation of how `value` was derived. */
  detail: string
}

export interface ScoreResult {
  /** 0–100, or null when nothing could be computed. */
  score: number | null
  /** Fraction of total weight that was actually available (0–1). */
  coverage: number
  confidence: Confidence
  components: ScoreComponent[]
  missing: string[]
  /** One line per contributing component, for the "Why this score?" panel. */
  explanation: string[]
}

export function clamp(value: number, lo = 0, hi = 100): number {
  return Math.min(hi, Math.max(lo, value))
}

/** Linear map of x in [lo, hi] onto 0–100, clamped. */
export function lin(value: number, lo: number, hi: number): number {
  if (hi === lo) return 100
  return clamp(((value - lo) / (hi - lo)) * 100)
}

/** Safe ratio that yields null instead of NaN/Infinity. */
export function ratio(numerator: number | null | undefined, denominator: number | null | undefined): number | null {
  if (numerator == null || denominator == null || denominator === 0) return null
  return numerator / denominator
}

export function combine(components: ScoreComponent[]): ScoreResult {
  const present = components.filter((c): c is ScoreComponent & { value: number } => c.value !== null)
  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0)
  const presentWeight = present.reduce((sum, c) => sum + c.weight, 0)
  const missing = components.filter((c) => c.value === null).map((c) => c.label)

  if (totalWeight === 0) {
    return {
      score: null,
      coverage: 0,
      confidence: 'low',
      components,
      missing,
      explanation: ['No components were defined for this score.'],
    }
  }

  if (presentWeight === 0) {
    return {
      score: null,
      coverage: 0,
      confidence: 'low',
      components,
      missing,
      explanation: ['None of the required inputs were available, so no score can be computed.'],
    }
  }

  const weighted = present.reduce((sum, c) => sum + c.value * c.weight, 0) / presentWeight
  const coverage = presentWeight / totalWeight
  const confidence: Confidence = coverage >= 0.85 ? 'high' : coverage >= 0.6 ? 'medium' : 'low'

  const explanation = present.map((c) => {
    const pct = Math.round((c.weight / totalWeight) * 100)
    return `${c.label}: ${Math.round(c.value)}/100 (weight ${pct}%) — ${c.detail}`
  })

  return {
    score: Math.round(clamp(weighted)),
    coverage,
    confidence,
    components,
    missing,
    explanation,
  }
}

/**
 * Builds a pillar component by scoring sub-components.
 * Returns `value: null` when no sub-input was available, so the parent
 * renormalizes rather than treating it as zero.
 */
export function pillar(
  key: string,
  label: string,
  weight: number,
  subComponents: ScoreComponent[],
): ScoreComponent {
  const result = combine(subComponents)
  return {
    key,
    label,
    weight,
    value: result.score,
    detail: result.score === null ? 'No inputs available' : result.explanation.join('; '),
  }
}

export function confidenceLabel(coverage: number): Confidence {
  return coverage >= 0.85 ? 'high' : coverage >= 0.6 ? 'medium' : 'low'
}
