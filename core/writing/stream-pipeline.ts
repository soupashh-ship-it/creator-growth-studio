/**
 * Stream → content pipeline (spec §113).
 *
 * Turns ONE recorded stream session into a planning checklist for the content
 * that can follow it: clips, a standalone short, a community post and the next
 * stream's seed. Everything here is a deterministic template derived from the
 * session the creator already recorded — no fabricated timestamps, no invented
 * statistics, and no automatic uploading. Cutting and posting stay manual.
 */

export interface StreamPipelineInput {
  title: string
  category?: string | null
  /** Length of the recorded session in minutes, when known. */
  durationMinutes?: number | null
}

export interface StreamPipelineStage {
  stage: string
  goal: string
  items: string[]
}

export interface StreamPipelinePlan {
  clipTarget: number
  stages: StreamPipelineStage[]
  shortsFirstLines: string[]
  poll: { question: string; options: string[] }
  nextStreamSeed: string
  notes: string[]
}

/** Number of clips to aim for, based only on how long the session ran. */
export function suggestClipCount(durationMinutes: number | null | undefined): number {
  if (durationMinutes === null || durationMinutes === undefined || durationMinutes <= 0) return 3
  if (durationMinutes < 45) return 2
  if (durationMinutes < 120) return 3
  if (durationMinutes < 240) return 4
  return 6
}

export function buildStreamPipeline(input: StreamPipelineInput): StreamPipelinePlan {
  const title = input.title.trim() || 'your stream'
  const topic = input.category?.trim() || title
  const clipTarget = suggestClipCount(input.durationMinutes)

  const stages: StreamPipelineStage[] = [
    {
      stage: '1. Keep the VOD',
      goal: 'Preserve the full recording before you cut anything.',
      items: [
        'Export or publish the VOD so the raw material is safe.',
        'Note where the highlight(s) happened using the platform’s own clip tool while it is fresh.',
        'Add the stream to a project so the derivatives stay linked (§124).',
      ],
    },
    {
      stage: `2. Mine ${clipTarget} clip(s)`,
      goal: 'Cut the moments that stand alone without context.',
      items: [
        'Look for a self-contained payoff — a win, a reveal, or a clear mistake.',
        'Start the clip on the last line BEFORE the payoff, so it lands fast.',
        'Write a one-sentence hook for each clip instead of a timestamp you have to remember.',
        'Keep vertical-safe framing in mind when you crop.',
      ],
    },
    {
      stage: '3. Standalone short',
      goal: 'Publish one short that does not depend on the VOD.',
      items: [
        'Reuse the strongest clip’s hook as the first line.',
        'Add on-screen text for the payoff so it works muted.',
        'Point viewers to the full stream/VOD, not to a made-up statistic.',
      ],
    },
    {
      stage: '4. Community post',
      goal: 'Keep the audience warm between streams.',
      items: [
        'Ask a question tied to this session’s topic.',
        'Share the best clip with one line of context.',
        'Tease what the next stream will test.',
      ],
    },
    {
      stage: '5. Seed the next stream',
      goal: 'Turn this session’s open threads into the next title.',
      items: [
        'List the questions you could not finish on stream — those are the next session’s promise.',
        'Use the Stream Title Assistant above to score the working title.',
        'Schedule the session in the Calendar so the plan stays visible.',
      ],
    },
  ]

  return {
    clipTarget,
    stages,
    shortsFirstLines: [
      `This ${topic} run ended better than it started — here is the moment everything clicked.`,
      `The part of ${title} most people will skip.`,
      `One thing I got wrong on ${topic}, and how I fixed it live.`,
    ],
    poll: {
      question: `What should I test next in ${topic}?`,
      options: [
        'The harder route / higher difficulty',
        'A beginner-friendly version',
        'The opposite setup, for comparison',
        'Something else (comment it)',
      ],
    },
    nextStreamSeed: `${topic}: finishing what we started`,
    notes: [
      'This is a planning checklist built from the session you recorded — the app does not cut video or invent clip timestamps.',
      'Clip count is derived only from session length; it is a starting point, not a target you must hit.',
      'Cutting, posting and scheduling are manual by design.',
    ],
  }
}
