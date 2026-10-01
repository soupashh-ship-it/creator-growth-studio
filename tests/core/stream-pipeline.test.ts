import { describe, expect, it } from 'vitest'
import { buildStreamPipeline, suggestClipCount } from '@core/writing/stream-pipeline'

describe('suggestClipCount', () => {
  it('scales with session length', () => {
    expect(suggestClipCount(30)).toBe(2)
    expect(suggestClipCount(90)).toBe(3)
    expect(suggestClipCount(180)).toBe(4)
    expect(suggestClipCount(360)).toBe(6)
  })

  it('falls back to 3 when the duration is unknown', () => {
    expect(suggestClipCount(null)).toBe(3)
    expect(suggestClipCount(0)).toBe(3)
  })
})

describe('buildStreamPipeline', () => {
  it('produces a five-stage plan using the category as the topic', () => {
    const plan = buildStreamPipeline({
      title: 'PoE 2 0.4 testing',
      category: 'Path of Exile 2',
      durationMinutes: 150,
    })
    expect(plan.stages).toHaveLength(5)
    expect(plan.clipTarget).toBe(4)
    expect(plan.stages[1]?.stage).toContain('4 clip')
    expect(plan.poll.question).toContain('Path of Exile 2')
    expect(plan.nextStreamSeed).toContain('Path of Exile 2')
  })

  it('falls back to the title when no category is given', () => {
    const plan = buildStreamPipeline({ title: 'Late night ranked', durationMinutes: null })
    expect(plan.poll.question).toContain('Late night ranked')
  })

  it('never claims to cut video or invent timestamps', () => {
    const plan = buildStreamPipeline({ title: 'Anything', durationMinutes: 60 })
    expect(plan.notes.join(' ')).toContain('does not cut video')
    expect(JSON.stringify(plan)).not.toMatch(/\d{1,2}:\d{2}/)
  })

  it('handles an empty title honestly', () => {
    const plan = buildStreamPipeline({ title: '   ' })
    expect(plan.shortsFirstLines[0]).toContain('your stream')
  })
})
