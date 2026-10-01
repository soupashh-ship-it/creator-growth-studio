/**
 * Goal progress tracking (spec §119).
 *
 * Compares the creator's stated subscriber/view goals against the **newest
 * stored channel snapshot** and the *previous* one, showing the 30-day change
 * from real observations only. It never predicts a completion date — growth is
 * not assumed to be linear (spec §119, §66).
 */

export interface GoalSample {
  /** ISO timestamp of the stored observation. */
  at: string
  subscriberCount: number | null
  viewCount: number | null
}

export interface GoalProgress {
  goal: number
  metric: 'subscribers' | 'views'
  /** Latest observed value, or null when nothing has been stored yet. */
  current: number | null
  /** Value at (or nearest before) 30 days ago, or null when no snapshot that old exists. */
  baseline: number | null
  /** current − baseline; null when either side is unavailable. */
  change30d: number | null
  /** goal − current; null when current is unavailable. */
  remaining: number | null
  progressPct: number | null
  /** Human explanation of which snapshots produced these numbers. */
  basis: string
}

/** Parses a goal like "10k subs", "1,000 subscribers", "1000000 views". */
export function parseGoal(text: string): { goal: number; metric: 'subscribers' | 'views' } | null {
  const cleaned = text.toLowerCase().replace(/,/g, '').trim()
  const isViews = /\bviews?\b/.test(cleaned)
  const isSubs = /\bsub(s|scribers|criptions)?\b/.test(cleaned)
  if (!isViews && !isSubs) return null
  const match = cleaned.match(/(\d+(?:\.\d+)?)\s*(k|m)?/)
  if (!match) return null
  let value = Number(match[1])
  if (match[2] === 'k') value *= 1_000
  if (match[2] === 'm') value *= 1_000_000
  if (!Number.isFinite(value) || value <= 0) return null
  return { goal: Math.round(value), metric: isViews && !isSubs ? 'views' : 'subscribers' }
}

/**
 * Finds the value at (or immediately before) a target time so "30-day change"
 * uses the closest real observation, never an interpolation.
 */
function valueAt(samples: GoalSample[], targetMs: number): GoalSample | null {
  let best: GoalSample | null = null
  let bestDelta = Infinity
  for (const s of samples) {
    const at = Date.parse(s.at)
    if (!Number.isFinite(at) || at > targetMs) continue
    const delta = targetMs - at
    if (delta < bestDelta) {
      bestDelta = delta
      best = s
    }
  }
  return best
}

export function goalProgress(
  goal: number,
  metric: 'subscribers' | 'views',
  samples: GoalSample[],
  now = Date.now(),
): GoalProgress {
  const valid = samples
    .filter((s) => (metric === 'subscribers' ? s.subscriberCount !== null : s.viewCount !== null))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  const valueOf = (s: GoalSample | null | undefined): number | null =>
    s == null
      ? null
      : metric === 'subscribers'
        ? s.subscriberCount
        : s.viewCount

  const latest = valid.length > 0 ? (valid[valid.length - 1] ?? null) : null
  const current = valueOf(latest)

  const baselineSample = valueAt(valid, now - 30 * 24 * 60 * 60 * 1000)
  const baseline = valueOf(baselineSample)

  const change30d = current !== null && baseline !== null ? current - baseline : null
  const remaining = current === null ? null : Math.max(0, goal - current)
  const progressPct = current === null ? null : Math.max(0, Math.min(100, (current / goal) * 100))

  const basis =
    valid.length === 0
      ? 'No channel snapshots stored yet — connect a platform so background refreshes record history.'
      : baseline === null
        ? `Latest snapshot ${latest?.at ?? ''}; no snapshot from ~30 days ago exists yet, so the 30-day change is shown as Not available.`
        : `Compared snapshot ${baselineSample?.at ?? ''} against ${latest?.at ?? ''} — real stored observations, not interpolated.`

  return { goal, metric, current, baseline, change30d, remaining, progressPct, basis }
}
