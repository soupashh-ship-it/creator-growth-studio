import { describe, expect, it } from 'vitest'
import { hookStrength } from '@core/writing/hooks'
import { reviewScriptStructure, reviewShortIdea } from '@core/writing/scripts'
import { assessBriefCompleteness } from '@core/writing/brief'

describe('hookStrength', () => {
  it('scores a concrete, direct hook higher than a vague long one', () => {
    const strong = hookStrength({
      text: 'I tested this 10-divine build in three pinnacle fights — here is what actually worked.',
    })
    const weak = hookStrength({
      text:
        'So in this video today we are going to be taking a look at something that I have been working on for a while now and it is finally ready to show you all so please do make sure to stick around because later on it gets really interesting I promise.',
    })
    expect(strong.score).not.toBeNull()
    expect(weak.score).not.toBeNull()
    expect(strong.score!).toBeGreaterThan(weak.score!)
  })

  it('reports not-available instead of a score when there is no text', () => {
    const result = hookStrength({ text: '   ' })
    expect(result.score).toBeNull()
    expect(result.coverage).toBe(0)
  })

  it('explains every contributing component', () => {
    const result = hookStrength({ text: 'You are losing 2 divines per map — here is the fix.' })
    expect(result.explanation.length).toBe(4)
    for (const line of result.explanation) {
      expect(line).toMatch(/weight/)
    }
  })
})

describe('reviewScriptStructure', () => {
  it('detects opening, payoff and next-step segments', () => {
    const feedback = reviewScriptStructure([
      { label: 'Hook', purpose: '', guidance: 'cold open' },
      { label: 'Test', purpose: '', guidance: 'fights' },
      { label: 'Payoff', purpose: '', guidance: 'results' },
      { label: 'Next step', purpose: '', guidance: 'full guide' },
    ])
    expect(feedback.hasOpening).toBe(true)
    expect(feedback.hasPayoff).toBe(true)
    expect(feedback.hasCallToNext).toBe(true)
    expect(feedback.notes).toHaveLength(0)
  })

  it('lists what is missing instead of inventing structure', () => {
    const feedback = reviewScriptStructure([{ label: 'Middle', purpose: '', guidance: '' }])
    expect(feedback.hasOpening).toBe(false)
    expect(feedback.hasPayoff).toBe(false)
    expect(feedback.hasCallToNext).toBe(false)
    expect(feedback.notes.some((n) => n.includes('No opening/hook'))).toBe(true)
  })

  it('scores the opening text with the hook engine when supplied', () => {
    const feedback = reviewScriptStructure(
      [{ label: 'Hook', purpose: '', guidance: 'x' }],
      'Two divines, three fights, one answer.',
    )
    expect(feedback.openingHook?.score).not.toBeNull()
  })
})

describe('reviewShortIdea', () => {
  it('flags unresolved timestamps instead of hiding them', () => {
    const review = reviewShortIdea({
      concept: 'Budget reveal',
      onScreenText: '10 divines',
      firstLine: 'This whole build cost less than a single Headhunter.',
      sourceTimestampHint: 'unknown — verify manually',
    })
    expect(review.needsTimestamp).toBe(true)
    expect(review.notes.some((n) => n.includes('Timestamp'))).toBe(true)
  })

  it('does not flag a literal source marker', () => {
    const review = reviewShortIdea({
      concept: 'Boss kill',
      onScreenText: 'One attempt',
      firstLine: 'First try.',
      sourceTimestampHint: 'the section titled "pinnacle attempt"',
    })
    expect(review.needsTimestamp).toBe(false)
  })

  it('flags overly long on-screen text', () => {
    const review = reviewShortIdea({
      concept: 'c',
      onScreenText: 'this line is far too long to be readable on a short vertical video screen',
      firstLine: 'Short.',
      sourceTimestampHint: 'section one',
    })
    expect(review.notes.some((n) => n.includes('On-screen text'))).toBe(true)
  })
})

describe('assessBriefCompleteness', () => {
  it('counts filled sections and names the missing ones', () => {
    const result = assessBriefCompleteness({ promise: 'A budget build that works', packaging: 'keyword + honest curiosity' })
    expect(result.filled).toBe(2)
    expect(result.total).toBe(6)
    expect(result.missing).toContain('Proof / credibility plan')
  })

  it('warns when proof is missing and when packaging precedes the promise', () => {
    const noProof = assessBriefCompleteness({ promise: 'x', audience: 'y' })
    expect(noProof.notes.some((n) => n.includes('proof plan'))).toBe(true)

    const packagingFirst = assessBriefCompleteness({ packaging: 'thumbnail idea' })
    expect(packagingFirst.notes.some((n) => n.includes('Packaging is drafted before the promise'))).toBe(true)
  })
})
