/**
 * Retention Planner (spec §34, docs/SCORING.md §19).
 *
 * Produces a proportional beat timeline for a planned video. Times are derived
 * from the target duration and the chosen beats — they are PLANNING aids, not
 * measurements. The creator supplies the format; nothing is predicted.
 */
export interface RetentionBeat {
  label: string
  /** Proportional share of the video, 0–1. */
  share: number
  why: string
}

export interface PlannedMoment extends RetentionBeat {
  /** Seconds from the start, derived proportionally. */
  startS: number
  endS: number
  clock: string
}

export interface RetentionPlan {
  durationS: number
  beats: PlannedMoment[]
  notes: string[]
}

const FORMAT_BEATS: Record<string, RetentionBeat[]> = {
  tutorial: [
    { label: 'Hook: show the end result', share: 0.08, why: 'prove the video pays off before asking for attention' },
    { label: 'Setup: what you need', share: 0.14, why: 'viewers stay when they know the scope' },
    { label: 'First quick win', share: 0.18, why: 'an early payoff rewards the click' },
    { label: 'Main walkthrough', share: 0.38, why: 'the core value; change visuals often here' },
    { label: 'Common mistake', share: 0.12, why: 're-engages drifting viewers with a warning' },
    { label: 'Final result + next step', share: 0.1, why: 'close the loop and point to the next video' },
  ],
  gaming: [
    { label: 'Hook: the moment everyone clicks for', share: 0.07, why: 'open on the peak, not the preamble' },
    { label: 'Stakes: what we are trying tonight', share: 0.13, why: 'goals make gameplay watchable' },
    { label: 'First big moment', share: 0.2, why: 'deliver action early' },
    { label: 'The grind (condensed)', share: 0.35, why: 'cut downtime; keep escalation visible' },
    { label: 'Climax', share: 0.15, why: 'the promised payoff' },
    { label: 'Reaction + next episode hook', share: 0.1, why: 'convert the high into a return visit' },
  ],
  review: [
    { label: 'Verdict teaser', share: 0.08, why: 'state where you land, then earn it' },
    { label: 'Context: what it is', share: 0.15, why: 'align on the basics fast' },
    { label: 'What it does well', share: 0.27, why: 'credit before criticism keeps trust' },
    { label: 'What it does badly', share: 0.27, why: 'the section people skip to — keep it concrete' },
    { label: 'Who it is for', share: 0.13, why: 'the most actionable line for viewers' },
    { label: 'Final verdict', share: 0.1, why: 'pay off the teaser honestly' },
  ],
  storytelling: [
    { label: 'Cold open: strangest line of the story', share: 0.07, why: 'curiosity before context' },
    { label: 'Setting the scene', share: 0.15, why: 'orientation without stalling' },
    { label: 'Rising tension', share: 0.33, why: 'escalate in steps, each raising a question' },
    { label: 'Turning point', share: 0.2, why: 'the pivot the open promised' },
    { label: 'Resolution', share: 0.15, why: 'satisfy the curiosity you created' },
    { label: 'Reflection + next story hint', share: 0.1, why: 'bring the viewer to the next video' },
  ],
}

export const RETENTION_FORMATS = Object.keys(FORMAT_BEATS)

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function buildRetentionPlan(format: string, targetMinutes: number): RetentionPlan {
  const beats = FORMAT_BEATS[format] ?? FORMAT_BEATS['tutorial']!
  const durationS = Math.max(1, Math.round(targetMinutes * 60))

  let cursor = 0
  const planned: PlannedMoment[] = beats.map((beat) => {
    const start = cursor
    const end = cursor + beat.share * durationS
    cursor = end
    return { ...beat, startS: Math.round(start), endS: Math.round(end), clock: clock(start) }
  })

  return {
    durationS,
    beats: planned,
    notes: [
      'Times are proportional planning aids derived from your target length — they are not measured retention.',
      'Measured retention needs a YouTube Analytics sync; compare the plan against real curves there later.',
    ],
  }
}
