import { describe, expect, it } from 'vitest'
import { planFromSavedKeywords, suggestTitleFor, type SavedKeywordLike } from '@research/ideas'

const row = (overrides: Partial<SavedKeywordLike>): SavedKeywordLike => ({
  term: 'poe 2 deadeye',
  intent: 'build-guide',
  relative_demand: 'High',
  competition_estimate: 'Medium',
  opportunity: 70,
  source: 'locally_derived',
  ...overrides,
})

describe('planFromSavedKeywords', () => {
  it('returns nothing for no keywords', () => {
    expect(planFromSavedKeywords([])).toEqual([])
  })

  it('carries the stored opportunity through instead of recomputing it', () => {
    const plan = planFromSavedKeywords([
      row({ term: 'poe 2 deadeye build', opportunity: 88 }),
      row({ term: 'poe 2 deadeye endgame', opportunity: 40 }),
    ])
    expect(plan.length).toBe(2)
    expect(plan[0]?.term).toBe('poe 2 deadeye build')
    expect(plan[0]?.opportunity).toBe(88)
    // Sorted by opportunity, highest first.
    expect((plan[0]?.opportunity ?? 0) >= (plan[1]?.opportunity ?? 0)).toBe(true)
  })

  it('tolerates missing intent/demand values', () => {
    const plan = planFromSavedKeywords([row({ intent: null, relative_demand: null, opportunity: null })])
    expect(plan[0]?.intent).toBe('entertainment')
    expect(plan[0]?.opportunity).toBeNull()
  })
})

describe('suggestTitleFor', () => {
  it('capitalises and handles empty input', () => {
    expect(suggestTitleFor('poe 2 deadeye')).toBe('Poe 2 deadeye')
    expect(suggestTitleFor('   ')).toBe('')
  })
})
