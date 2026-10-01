import { clock, type ParsedSubtitles } from '../media/subtitles'

/**
 * Transcript analyzer (spec §35, docs/SCORING.md §21).
 *
 * Deterministic diagnostics over the creator's own transcript: pacing, filler,
 * repetition and structural weak points. Where cue timestamps exist, findings
 * cite real positions; without them, findings are reported without invented
 * times. Nothing here is a retention measurement.
 */
export interface TranscriptFinding {
  kind: 'slow-section' | 'filler' | 'repetition' | 'weak-intro' | 'weak-cta' | 'topic-drift'
  atS: number | null
  clock: string | null
  detail: string
  snippet?: string
}

export interface TranscriptReport {
  wordCount: number
  durationS: number | null
  wordsPerMinute: number | null
  fillerRatio: number | null
  findings: TranscriptFinding[]
  notes: string[]
}

const FILLERS = ['um', 'uh', 'er', 'ah', 'like', 'basically', 'actually', 'literally', 'sort of', 'kind of', 'you know', 'i mean']
const CTA_WORDS = /\b(subscribe|follow|comment below|link in the description|check out the channel|hit the bell)\b/i
const INTRO_MIN_WORDS = 12

function words(text: string): string[] {
  return text.toLowerCase().split(/\s+/).filter(Boolean)
}

function tokenKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 4)
    .slice(0, 8)
    .join(' ')
}

export function analyzeTranscript(parsed: ParsedSubtitles, options: { expectedWpm?: number } = {}): TranscriptReport {
  const transcript = parsed.transcript.trim()
  const allWords = words(transcript)
  const wordCount = allWords.length
  const timed = parsed.cues.length > 0
  const durationS = timed ? Math.max(...parsed.cues.map((cue) => cue.endS)) : null
  const wpm = durationS !== null && durationS > 30 ? Math.round((wordCount / durationS) * 60) : null

  const findings: TranscriptFinding[] = []
  const notes = timed
    ? ['Timestamps come from the cues in your file and cite real positions.']
    : ['No timestamps in the source, so findings are reported without positions — timestamps are never invented.']

  // Pacing: slow sections (or overall, when untimed).
  const expectedWpm = options.expectedWpm ?? 150
  if (timed && parsed.cues.length >= 4) {
    // Group cues into ~30s windows and flag slow ones.
    const windowS = 30
    for (let start = 0; start < (durationS ?? 0); start += windowS) {
      const windowWords = parsed.cues
        .filter((cue) => cue.startS >= start && cue.startS < start + windowS)
        .reduce((sum, cue) => sum + words(cue.text).length, 0)
      const windowWpm = (windowWords / windowS) * 60
      if (windowWords > 0 && windowWpm < expectedWpm * 0.55) {
        findings.push({
          kind: 'slow-section',
          atS: start,
          clock: clock(start),
          detail: `Very sparse speech (~${Math.round(windowWpm)} wpm around here) — dead air or b-roll with no narration.`,
          snippet: parsed.cues.find((cue) => cue.startS >= start)?.text,
        })
      }
    }
  } else if (!timed && wordCount > 0 && durationS === null && parsed.format === 'plain') {
    // No timing at all: nothing to compute. Stated honestly.
    notes.push('Pacing and slow-section detection need timed subtitles (SRT/VTT).')
  }

  // Filler ratio with the worst offender positions (timed) or overall.
  const fillerCount = allWords.filter((word) => FILLERS.includes(word)).length
  const fillerRatio = wordCount > 0 ? Math.round((fillerCount / wordCount) * 1000) / 10 : null
  if (fillerRatio !== null && fillerRatio > 4) {
    const cueWithMostFiller = timed
      ? parsed.cues
          .map((cue) => ({ cue, count: words(cue.text).filter((w) => FILLERS.includes(w)).length }))
          .sort((a, b) => b.count - a.count)[0]
      : undefined
    findings.push({
      kind: 'filler',
      atS: cueWithMostFiller ? Math.round(cueWithMostFiller.cue.startS) : null,
      clock: cueWithMostFiller ? clock(cueWithMostFiller.cue.startS) : null,
      detail: `Filler words are ${fillerRatio}% of speech ("um", "basically", "you know"…). Trimming the worst spots tightens pacing at zero cost.`,
      snippet: cueWithMostFiller?.cue.text,
    })
  }

  // Repetition of ~8-word segments.
  const seen = new Map<string, number>()
  for (let i = 0; i < allWords.length - 8; i += 1) {
    const key = allWords.slice(i, i + 8).join(' ')
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }
  const repeated = [...seen.entries()].filter(([, count]) => count >= 3).sort((a, b) => b[1] - a[1])[0]
  if (repeated) {
    const firstIndex = transcript.toLowerCase().indexOf(repeated[0])
    const approxS =
      timed && durationS !== null && wordCount > 0 ? Math.round((firstIndex / Math.max(1, transcript.length)) * durationS) : null
    findings.push({
      kind: 'repetition',
      atS: approxS,
      clock: approxS !== null ? clock(approxS) : null,
      detail: `The phrase "${repeated[0]}" repeats ${repeated[1]}×. Repeated explanations usually mean a section needs a rewrite, not a re-record.`,
    })
  }

  // Weak intro: too little content before the first substantive stretch.
  if (wordCount >= INTRO_MIN_WORDS * 2) {
    const firstFifty = allWords.slice(0, 50)
    const introFiller = firstFifty.filter((word) => FILLERS.includes(word)).length
    if (introFiller >= 5 || /^(hey guys|what'?s up|welcome back|so basically)\b/i.test(transcript)) {
      const atS = timed ? (parsed.cues[0]?.startS ?? null) : null
      findings.push({
        kind: 'weak-intro',
        atS: atS === null ? null : Math.round(atS),
        clock: atS !== null ? clock(atS) : null,
        detail: 'The opening leans on greetings/filler instead of the payoff. Stating the result first reliably holds the early audience.',
        snippet: allWords.slice(0, 24).join(' '),
      })
    }
  }

  // Weak/absent CTA at the end.
  const tail = allWords.slice(-80).join(' ')
  if (!CTA_WORDS.test(tail)) {
    const atS = timed && durationS !== null ? Math.max(0, durationS - 60) : null
    findings.push({
      kind: 'weak-cta',
      atS,
      clock: atS !== null ? clock(atS) : null,
      detail: 'The ending has no next step for the viewer. One specific, content-linked CTA beats three generic ones.',
    })
  }

  // Topic drift: last quarter shares almost no content words with the first.
  if (wordCount > 200) {
    const head = tokenKey(allWords.slice(0, Math.floor(wordCount / 4)).join(' '))
    const tailTokens = new Set(words(allWords.slice(Math.floor((wordCount * 3) / 4)).join(' ')))
    const headWords = head.split(' ').filter(Boolean)
    const overlap = headWords.filter((word) => tailTokens.has(word)).length
    if (headWords.length >= 4 && overlap === 0) {
      findings.push({
        kind: 'topic-drift',
        atS: timed && durationS !== null ? Math.round(durationS * 0.75) : null,
        clock: timed && durationS !== null ? clock(durationS * 0.75) : null,
        detail: 'The final quarter shares no key terms with the opening — check whether this is a planned section or drift.',
      })
    }
  }

  return { wordCount, durationS: durationS === null ? null : Math.round(durationS), wordsPerMinute: wpm, fillerRatio, findings, notes }
}
