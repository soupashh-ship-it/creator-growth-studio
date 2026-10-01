import { describe, expect, it } from 'vitest'
import { DOMAIN_MODES, applyDomainMode, getDomainMode } from '@core/writing/domain-modes'

describe('getDomainMode', () => {
  it('finds a known mode', () => {
    expect(getDomainMode('gaming').label).toBe('Gaming')
  })

  it('falls back to general for an unknown id', () => {
    expect(getDomainMode('nonsense').id).toBe('general')
    expect(getDomainMode(null).id).toBe('general')
  })

  it('exposes narrative, gaming and tech modes', () => {
    const ids = DOMAIN_MODES.map((mode) => mode.id)
    expect(ids).toEqual(expect.arrayContaining(['narrative', 'gaming', 'tech']))
  })
})

describe('applyDomainMode', () => {
  it('detects gaming beats in a matching outline', () => {
    const review = applyDomainMode(
      'gaming',
      'Hook — the 10 divine claim\nBuild — budget league starter\nTest — three pinnacle fights\nResult — cleared all three\nVerdict — worth it if you are starting',
    )
    expect(review.completeness).toBe(100)
    expect(review.missing).toHaveLength(0)
    expect(review.hookGuidance.length).toBeGreaterThan(0)
  })

  it('reports missing beats without inventing content', () => {
    const review = applyDomainMode('tech', 'Problem — my build is slow')
    expect(review.present).toContain('Problem')
    expect(review.missing).toContain('Demo / steps')
    expect(review.completeness).not.toBeNull()
    expect((review.completeness ?? 0) < 100).toBe(true)
  })

  it('returns null completeness for an empty outline', () => {
    const review = applyDomainMode('narrative', '   ')
    expect(review.completeness).toBeNull()
    expect(review.present).toHaveLength(0)
    expect(review.missing).toHaveLength(review.mode.beats.length)
  })

  it('is honest about being keyword matching', () => {
    const review = applyDomainMode('gaming', 'anything')
    expect(review.notes.join(' ')).toContain('keyword matching')
  })
})
