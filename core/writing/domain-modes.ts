/**
 * Domain modes (spec §110–112).
 *
 * Narrative, gaming and tech content follow different structures. Rather than
 * pretend to understand the script, each mode lists the beats it usually needs
 * and the app checks which of them appear in the creator's OWN outline using
 * keyword matching. The result is a checklist with an honest completeness
 * figure — not a quality score, and never a fact about performance.
 */

import { normalizeTitle } from '../planning/link-projects'

export type DomainModeId = 'general' | 'narrative' | 'gaming' | 'tech'

export interface DomainBeat {
  key: string
  label: string
  guidance: string
  /** Words that indicate this beat appears in the outline. */
  keywords: string[]
}

export interface DomainMode {
  id: DomainModeId
  label: string
  description: string
  beats: DomainBeat[]
  hookGuidance: string[]
  derivativeAngles: string[]
}

export const DOMAIN_MODES: DomainMode[] = [
  {
    id: 'general',
    label: 'General',
    description: 'The default four-beat structure: hook, body, payoff, next step.',
    beats: [
      { key: 'hook', label: 'Hook', guidance: 'Open on the promise or the result, not on a greeting.', keywords: ['hook', 'opening', 'intro', 'promise'] },
      { key: 'body', label: 'Body', guidance: 'Deliver the main content in a clear order.', keywords: ['body', 'main', 'step', 'section', 'explain'] },
      { key: 'payoff', label: 'Payoff', guidance: 'Show the result the viewer came for.', keywords: ['payoff', 'result', 'outcome', 'reveal', 'conclusion'] },
      { key: 'next', label: 'Next step', guidance: 'Tell the viewer what to do or watch next.', keywords: ['next', 'cta', 'subscribe', 'follow', 'watch'] },
    ],
    hookGuidance: [
      'Lead with the payoff, not the setup.',
      'Name who the video is for.',
    ],
    derivativeAngles: ['Turn the payoff into a short.', 'Turn the body into a thread.'],
  },
  {
    id: 'narrative',
    label: 'Narrative / story',
    description: 'Storytelling: setup, tension, a turning point, the payoff and a lesson.',
    beats: [
      { key: 'setup', label: 'Setup', guidance: 'Establish the situation and who is involved.', keywords: ['setup', 'context', 'backstory', 'started', 'origin'] },
      { key: 'tension', label: 'Tension', guidance: 'Make the stakes and the obstacle concrete.', keywords: ['tension', 'conflict', 'problem', 'stakes', 'struggle', 'failed'] },
      { key: 'turn', label: 'Turning point', guidance: 'Mark the moment something changed.', keywords: ['turn', 'change', 'decided', 'breakthrough', 'then'] },
      { key: 'payoff', label: 'Payoff', guidance: 'Resolve the tension with a real outcome.', keywords: ['payoff', 'result', 'ending', 'outcome', 'resolved'] },
      { key: 'lesson', label: 'Lesson', guidance: 'Leave the viewer with a takeaway.', keywords: ['lesson', 'takeaway', 'learned', 'moral', 'so what'] },
    ],
    hookGuidance: [
      'Open in the middle of the tension, then rewind.',
      'Promise the emotional payoff, not just the topic.',
      'Hint at the turning point without spoiling it.',
    ],
    derivativeAngles: ['Cut the turning point as a short.', 'Turn the lesson into a caption.'],
  },
  {
    id: 'gaming',
    label: 'Gaming',
    description: 'Gameplay: hook, build/setup, the test itself, the result and a verdict.',
    beats: [
      { key: 'hook', label: 'Hook', guidance: 'Lead with the claim or the highlight moment.', keywords: ['hook', 'intro', 'opening', 'highlight', 'clip'] },
      { key: 'setup', label: 'Build / setup', guidance: 'State patch, build, loadout or rules up front.', keywords: ['build', 'loadout', 'setup', 'gear', 'patch', 'rules'] },
      { key: 'test', label: 'Test / gameplay', guidance: 'Show the run, fight or match, not just the score.', keywords: ['test', 'gameplay', 'fight', 'run', 'match', 'boss', 'cleared', 'run'] },
      { key: 'result', label: 'Result', guidance: 'Show the outcome with the footage behind it.', keywords: ['result', 'cleared', 'win', 'score', 'dps', 'completed'] },
      { key: 'verdict', label: 'Verdict / next', guidance: 'Say whether it is worth it and what is next.', keywords: ['verdict', 'worth', 'should you', 'next', 'build next', 'conclusion'] },
    ],
    hookGuidance: [
      'Open on the highlight frame of the win or the fail.',
      'State the build and the patch in the first line.',
      'Promise the tested result, not a theoretical one.',
    ],
    derivativeAngles: ['Clip the highlight as a short.', 'Turn the verdict into a poll.'],
  },
  {
    id: 'tech',
    label: 'Tech / tutorial',
    description: 'Technical: problem, prerequisites, demo, trade-offs and a recommendation.',
    beats: [
      { key: 'problem', label: 'Problem', guidance: 'Name the pain point the viewer has.', keywords: ['problem', 'why', 'issue', 'pain', 'broken', 'slow'] },
      { key: 'context', label: 'Context / prereqs', guidance: 'State requirements and assumptions.', keywords: ['context', 'prereq', 'requirement', 'assumption', 'setup', 'version'] },
      { key: 'demo', label: 'Demo / steps', guidance: 'Walk through the steps in order.', keywords: ['demo', 'step', 'walkthrough', 'how to', 'install', 'configure'] },
      { key: 'tradeoffs', label: 'Trade-offs', guidance: 'Say the downsides and alternatives honestly.', keywords: ['tradeoff', 'trade-off', 'downside', 'caveat', 'alternative', 'limitation'] },
      { key: 'recommendation', label: 'Recommendation', guidance: 'Close with who should use it and when.', keywords: ['recommend', 'verdict', 'conclusion', 'bottom line', 'should you'] },
    ],
    hookGuidance: [
      'Open with the problem in the viewer’s words.',
      'Show the before/after state up front.',
      'Promise the working result, not a partial setup.',
    ],
    derivativeAngles: ['Turn the demo into a short.', 'Turn the trade-offs into a comparison post.'],
  },
]

export function getDomainMode(id: string | null | undefined): DomainMode {
  return DOMAIN_MODES.find((mode) => mode.id === id) ?? DOMAIN_MODES[0]!
}

export interface DomainModeReview {
  mode: DomainMode
  present: string[]
  missing: string[]
  /** Share of the mode's beats found in the outline (0–100). Null when no outline. */
  completeness: number | null
  hookGuidance: string[]
  derivativeAngles: string[]
  notes: string[]
}

/**
 * Checks which of a mode's beats appear in the creator's outline via keyword
 * matching. Empty/whitespace outlines report completeness null rather than 0.
 */
export function applyDomainMode(id: string | null | undefined, outline: string): DomainModeReview {
  const mode = getDomainMode(id)
  const haystack = normalizeTitle(outline)
  const present: string[] = []
  const missing: string[] = []

  for (const beat of mode.beats) {
    const found =
      haystack.length > 0 &&
      beat.keywords.some((keyword) => haystack.includes(normalizeTitle(keyword)))
    if (found) present.push(beat.label)
    else missing.push(beat.label)
  }

  return {
    mode,
    present,
    missing,
    completeness: haystack.length === 0 ? null : Math.round((present.length / mode.beats.length) * 100),
    hookGuidance: mode.hookGuidance,
    derivativeAngles: mode.derivativeAngles,
    notes: [
      'Beat detection is keyword matching against your own outline — it does not judge quality and never uses performance data.',
      'A beat can be present in your script and still missed here if the wording differs; this is a prompt to re-read, not a verdict.',
    ],
  }
}
