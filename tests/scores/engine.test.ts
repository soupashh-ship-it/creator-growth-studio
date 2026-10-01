import { describe, expect, it } from 'vitest'
import { combine, lin, ratio, type ScoreComponent } from '@core/scores/engine'

const c = (key: string, value: number | null, weight = 1): ScoreComponent => ({
  key,
  label: key,
  value,
  weight,
  detail: 'x',
})

describe('score engine', () => {
  it('computes a weighted average of present components', () => {
    const r = combine([c('a', 100, 1), c('b', 50, 1)])
    expect(r.score).toBe(75)
    expect(r.coverage).toBe(1)
    expect(r.confidence).toBe('high')
  })

  it('renormalizes over present components and reports missing ones', () => {
    const r = combine([c('a', 80, 1), c('b', null, 1)])
    expect(r.score).toBe(80)
    expect(r.coverage).toBe(0.5)
    expect(r.confidence).toBe('low')
    expect(r.missing).toEqual(['b'])
  })

  it('returns null (never zero) when nothing is available', () => {
    const r = combine([c('a', null, 1), c('b', null, 1)])
    expect(r.score).toBeNull()
    expect(r.coverage).toBe(0)
    expect(r.explanation[0]).toMatch(/no score/i)
  })

  it('honours differing weights', () => {
    const r = combine([c('a', 100, 3), c('b', 0, 1)])
    expect(r.score).toBe(75)
  })

  it('exposes an explanation line per contributing component', () => {
    const r = combine([c('a', 90, 1)])
    expect(r.explanation.join(' ')).toContain('a')
  })
})

describe('math helpers', () => {
  it('lin maps a range onto 0–100 and clamps', () => {
    expect(lin(5, 0, 10)).toBe(50)
    expect(lin(-5, 0, 10)).toBe(0)
    expect(lin(50, 0, 10)).toBe(100)
  })

  it('ratio returns null instead of NaN/Infinity', () => {
    expect(ratio(10, 2)).toBe(5)
    expect(ratio(10, 0)).toBeNull()
    expect(ratio(null, 2)).toBeNull()
  })
})
