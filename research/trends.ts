/**
 * Trend velocity (spec §23–24).
 *
 * Computed only from observations the app actually collected (platform APIs,
 * public feeds, or local history). No anti-bot circumvention and no invented
 * momentum: if there are too few observations the result says so.
 */
export interface TrendObservation {
  topic: string
  observedAt: string
  /** Relative weight of the signal (defaults to 1). */
  weight?: number
}

export type TrendDirection = 'up' | 'flat' | 'down'

export interface TrendVelocity {
  topic: string
  direction: TrendDirection
  /** Visual indicator, e.g. "↑↑↑". */
  momentum: string
  /** 0–100: how recent/active the topic currently is. */
  freshness: number
  recentWeight: number
  priorWeight: number
  observations: number
  /** A concrete next action, phrased as guidance rather than a promise. */
  action: string
}

const HOUR = 60 * 60 * 1000

export function computeTrendVelocity(
  topic: string,
  observations: TrendObservation[],
  options: { now?: number; windowMs?: number } = {},
): TrendVelocity {
  const now = options.now ?? Date.now()
  const windowMs = options.windowMs ?? 24 * HOUR

  const relevant = observations.filter((o) => o.topic === topic)
  if (relevant.length === 0) {
    return {
      topic,
      direction: 'flat',
      momentum: '→',
      freshness: 0,
      recentWeight: 0,
      priorWeight: 0,
      observations: 0,
      action: 'Not enough observations yet — collect more signals before acting.',
    }
  }

  let recentWeight = 0
  let priorWeight = 0
  let lastObserved = 0

  for (const observation of relevant) {
    const at = Date.parse(observation.observedAt)
    if (Number.isNaN(at)) continue
    const weight = observation.weight ?? 1
    const age = now - at
    lastObserved = Math.max(lastObserved, at)
    if (age <= windowMs) recentWeight += weight
    else if (age <= windowMs * 2) priorWeight += weight
  }

  const direction: TrendDirection =
    recentWeight > priorWeight * 1.15 ? 'up' : recentWeight < priorWeight * 0.85 ? 'down' : 'flat'

  const momentum = direction === 'up' ? (recentWeight > priorWeight * 2 ? '↑↑↑' : recentWeight > priorWeight * 1.4 ? '↑↑' : '↑') : direction === 'down' ? '↓' : '→'

  const ageOfLast = Math.max(0, now - lastObserved)
  const freshness = Math.round(Math.max(0, 100 - (ageOfLast / (7 * 24 * HOUR)) * 100))

  const action =
    direction === 'up' && freshness > 70
      ? 'Interest is freshest now — publish while the trend is active.'
      : direction === 'up'
        ? 'Momentum is positive; worth planning content this week.'
        : direction === 'down'
          ? 'Interest is cooling; prioritise evergreen angles instead.'
          : 'Stable interest; treat this as an evergreen topic.'

  return {
    topic,
    direction,
    momentum,
    freshness,
    recentWeight,
    priorWeight,
    observations: relevant.length,
    action,
  }
}

export function rankTrends(
  observations: TrendObservation[],
  options: { now?: number; windowMs?: number } = {},
): TrendVelocity[] {
  const topics = [...new Set(observations.map((o) => o.topic))]
  return topics
    .map((topic) => computeTrendVelocity(topic, observations, options))
    .sort((a, b) => b.freshness - a.freshness || b.recentWeight - a.recentWeight)
}
