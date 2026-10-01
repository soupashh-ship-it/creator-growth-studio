/**
 * Data-freshness badges (spec §137). Stale data must never masquerade as
 * current, so every cached read is labelled with how old it is.
 */
export type FreshnessLevel = 'live' | 'recent' | 'today' | 'stale'

export interface FreshnessBadge {
  label: string
  level: FreshnessLevel
  ageMs: number
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function freshnessBadge(updatedAt: string, now: number = Date.now()): FreshnessBadge {
  const parsed = Date.parse(updatedAt)
  if (Number.isNaN(parsed)) {
    return { label: 'Unknown', level: 'stale', ageMs: Number.POSITIVE_INFINITY }
  }

  const ageMs = Math.max(0, now - parsed)

  if (ageMs < 2 * MINUTE) return { label: 'LIVE', level: 'live', ageMs }
  if (ageMs < HOUR) return { label: `${Math.round(ageMs / MINUTE)}m old`, level: 'recent', ageMs }
  if (ageMs < DAY) return { label: `${Math.round(ageMs / HOUR)}h old`, level: 'today', ageMs }
  if (ageMs < 2 * DAY) return { label: 'Yesterday', level: 'today', ageMs }
  return { label: 'Stale', level: 'stale', ageMs }
}

/** Relative time for a "Last refreshed …" line (spec §138). */
export function relativeTime(updatedAt: string, now: number = Date.now()): string {
  const badge = freshnessBadge(updatedAt, now)
  if (badge.level === 'live') return 'just now'
  return badge.label.toLowerCase()
}
