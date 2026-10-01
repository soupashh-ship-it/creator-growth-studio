/**
 * Subtitle parsing (spec §35, §37).
 *
 * Pure text transforms — no dependencies. Supports SRT and WebVTT, the two
 * formats YouTube Studio exports. Produces a plain transcript plus optional
 * per-cue timestamps so analysis can point at real positions in the source.
 */

export interface SubtitleCue {
  startS: number
  endS: number
  text: string
}

export interface ParsedSubtitles {
  cues: SubtitleCue[]
  format: 'srt' | 'vtt' | 'plain'
  /** Full transcript joined with spaces (timestamps stripped). */
  transcript: string
}

const TIME_RE = /(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})|(\d{1,2}):(\d{2})[.,](\d{1,3})/

function parseTimestamp(raw: string): number | null {
  const match = TIME_RE.exec(raw.trim())
  if (!match) return null
  if (match[1] !== undefined) {
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000
  }
  const minutes = match[5]
  const seconds = match[6]
  const millis = match[7]
  if (minutes === undefined || seconds === undefined || millis === undefined) return null
  return Number(minutes) * 60 + Number(seconds) + Number(millis) / 1000
}

function looksLikeTimestampLine(line: string): boolean {
  return /^\s*\d+\s*$/.test(line) || (line.includes('-->') && TIME_RE.test(line))
}

function stripCueTags(text: string): string {
  return text
    .replace(/<[^>]+>/g, '') // VTT tags like <c>, <i>
    .replace(/\{\\[^}]*\}/g, '') // ASS-style overrides
    .trim()
}

export function parseSubtitles(input: string): ParsedSubtitles {
  const text = input.replace(/\r\n?/g, '\n')
  const isVtt = /^\s*WEBVTT/.test(text)
  const isSrt = text.includes('-->')

  if (!isVtt && !isSrt) {
    // Plain text: treat as a transcript with no timing.
    const transcript = text.trim()
    return { cues: [], format: 'plain', transcript }
  }

  const cues: SubtitleCue[] = []
  const blocks = text.split(/\n{2,}/)
  for (const block of blocks) {
    const lines = block.split('\n').filter((line) => line.trim().length > 0)
    if (lines.length === 0) continue

    const timeLineIndex = lines.findIndex((line) => line.includes('-->'))
    if (timeLineIndex === -1) continue
    const [rawStart, rawEnd] = lines[timeLineIndex]!.split('-->')
    const startS = rawStart ? parseTimestamp(rawStart) : null
    const endS = rawEnd ? parseTimestamp(rawEnd) : null
    if (startS === null || endS === null) continue

    const body = lines
      .slice(timeLineIndex + 1)
      .map(stripCueTags)
      .filter(Boolean)
      .join(' ')
    if (body) cues.push({ startS, endS, text: body })
  }

  return {
    cues,
    format: isVtt ? 'vtt' : 'srt',
    transcript: cues.map((cue) => cue.text).join(' '),
  }
}

/** "mm:ss" rendering used by analysis output. */
export function clock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Extracts the text around a timestamp for citation-style snippets. */
export function snippetAt(parsed: ParsedSubtitles, atS: number, radiusS = 10): string {
  if (parsed.cues.length === 0) return ''
  const window = parsed.cues.filter((cue) => cue.endS >= atS - radiusS && cue.startS <= atS + radiusS)
  return window.map((cue) => cue.text).join(' ').slice(0, 240)
}

export { looksLikeTimestampLine }
