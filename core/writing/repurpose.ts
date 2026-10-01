/**
 * Repurposing Studio (spec §114).
 *
 * Deterministic, template-driven derivatives of ONE video, built from the
 * creator's own inputs (title, keyword, what the video proves). Templates keep
 * everything honest: no invented stats, no fabricated quotes — the creator
 * fills the bracketed slots with their real material.
 */
export interface RepurposeInput {
  title: string
  /** The main claim or payoff of the video, in the creator's words. */
  payoff: string
  /** Primary keyword/topic, used for search-oriented derivatives. */
  keyword?: string
  /** Optional video URL/id for the pinned comment. */
  videoUrl?: string
}

export interface RepurposedKit {
  shortsConcepts: Array<{ concept: string; firstLine: string; onScreenText: string }>
  captions: string[]
  communityPoll: { question: string; options: string[] }
  followUpIdea: { title: string; angle: string }
  livestreamTopic: string
  pinnedComment: string
  notes: string[]
}

export function buildRepurposeKit(input: RepurposeInput): RepurposedKit {
  const title = input.title.trim() || 'your video'
  const payoff = input.payoff.trim() || 'the main result from the video'
  const keyword = input.keyword?.trim() || title

  return {
    shortsConcepts: [
      {
        concept: 'The payoff first',
        firstLine: `${payoff} — here is the short version.`,
        onScreenText: keyword.slice(0, 30).toUpperCase(),
      },
      {
        concept: 'The mistake angle',
        firstLine: `Most people get this wrong about ${keyword}.`,
        onScreenText: 'THE COMMON MISTAKE',
      },
      {
        concept: 'Before/after',
        firstLine: `Before this: the old way. After this: ${payoff}.`,
        onScreenText: 'BEFORE → AFTER',
      },
    ],
    captions: [
      `${title} — full breakdown on the channel. ${payoff}.`,
      `I tested ${keyword} so you don't have to. What I found surprised me (link in bio/video).`,
      `${payoff}. If that's the problem you're having, the full video walks through it step by step.`,
    ],
    communityPoll: {
      question: `What should I cover next around ${keyword}?`,
      options: ['A deeper dive on this', 'The opposite/budget approach', 'A beginner version', 'Something else (comment it)'],
    },
    followUpIdea: {
      title: `${title} — what I'd do differently`,
      angle: 'Revisit the topic after real usage: what held up, what broke, and who should skip it.',
    },
    livestreamTopic: `Live testing session: ${keyword} — questions from the video answered on stream.`,
    pinnedComment: `Full timestamps and resources are in the description. If you tried this, tell me how it went${
      input.videoUrl ? '' : ''
    } — I read everything and it shapes the follow-up.`,
    notes: [
      'Templates are starters — replace the bracketed parts with your real results. Nothing here is measured performance.',
      'Cutting and posting are manual by design; the app never uploads or auto-posts.',
    ],
  }
}
