import { describe, expect, it } from 'vitest'
import { parseSubtitles, snippetAt } from '@core/media/subtitles'
import { analyzeTranscript } from '@core/writing/transcript'

const SRT = `1
00:00:00,000 --> 00:00:04,000
Hey guys welcome back to the channel um so basically today

2
00:00:04,000 --> 00:00:12,000
we are testing the lightning arrow build in Path of Exile 2 patch 0.4

3
00:00:12,000 --> 00:00:20,000
the build clears pinnacle bosses and it costs under ten divines

4
00:00:20,000 --> 00:01:20,000
and that is the result you came for so let us get into it
`

const VTT = `WEBVTT

00:00.000 --> 00:01.000
<b>Short cue</b>

00:01.000 --> 00:02.000
Second cue
`

describe('parseSubtitles', () => {
  it('parses SRT cues and joins the transcript', () => {
    const parsed = parseSubtitles(SRT)
    expect(parsed.format).toBe('srt')
    expect(parsed.cues).toHaveLength(4)
    expect(parsed.cues[0]?.startS).toBe(0)
    expect(parsed.transcript).toContain('lightning arrow build')
  })

  it('parses WebVTT and strips tags', () => {
    const parsed = parseSubtitles(VTT)
    expect(parsed.format).toBe('vtt')
    expect(parsed.cues).toHaveLength(2)
    expect(parsed.cues[0]?.text).toBe('Short cue')
  })

  it('treats plain text as an untimed transcript', () => {
    const parsed = parseSubtitles('just some words without any timing at all')
    expect(parsed.format).toBe('plain')
    expect(parsed.cues).toHaveLength(0)
    expect(parsed.transcript).toBe('just some words without any timing at all')
  })

  it('cites real snippets near a timestamp', () => {
    const parsed = parseSubtitles(SRT)
    expect(snippetAt(parsed, 6)).toContain('lightning arrow')
  })
})

describe('analyzeTranscript', () => {
  it('reports filler ratio, pacing and weak CTA with real timestamps', () => {
    const report = analyzeTranscript(parseSubtitles(SRT))
    expect(report.wordCount).toBeGreaterThan(40)
    expect(report.durationS).toBeCloseTo(80, 0)
    expect(report.wordsPerMinute).not.toBeNull()
    expect(report.findings.length).toBeGreaterThan(0)
    expect(report.findings.some((finding) => finding.kind === 'weak-cta' && finding.clock !== null)).toBe(true)
    expect(report.notes.join(' ')).toContain('real positions')
  })

  it('never invents timestamps for plain transcripts', () => {
    const long = Array.from({ length: 260 }, (_, index) => `word${index}`).join(' ')
    const report = analyzeTranscript(parseSubtitles(long))
    expect(report.notes.join(' ')).toContain('never invented')
    expect(report.findings.every((finding) => finding.clock === null)).toBe(true)
  })
})
