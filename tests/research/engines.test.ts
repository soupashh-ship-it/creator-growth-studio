import { describe, expect, it } from 'vitest'
import { analyzeKeyword, clusterKeywords, generateContentPlan, tokenize } from '@research/keywords'
import { computeTrendVelocity, rankTrends } from '@research/trends'
import { detectSeries, findContentGaps } from '@research/gaps'

describe('keyword clustering', () => {
  it('groups terms by their most significant shared token', () => {
    const clusters = clusterKeywords([
      'poe 2 deadeye build',
      'poe 2 deadeye gear',
      'poe 2 lightning arrow build',
      'lightning arrow endgame',
    ])
    expect(clusters.length).toBeGreaterThan(0)
    expect(clusters.flatMap((c) => c.terms)).toContain('poe 2 deadeye build')
  })

  it('removes stopwords but keeps meaningful domain words', () => {
    expect(tokenize('how to build the best deadeye')).toEqual(['build', 'deadeye'])
  })
})

describe('keyword analysis', () => {
  it('never fabricates demand when no signal exists', () => {
    const insight = analyzeKeyword({ term: 'poe 2 deadeye' })
    expect(insight.relativeDemand).toBe('Unknown')
    expect(insight.opportunity).toBeNull()
    expect(insight.source).toBe('locally_derived')
  })

  it('bands demand from a supplied index and reports the source', () => {
    const insight = analyzeKeyword({
      term: 'poe 2 league starter',
      demandIndex: 80,
      competitionIndex: 30,
      source: 'observed_search_interest',
    })
    expect(insight.relativeDemand).toBe('High')
    expect(insight.competitionEstimate).toBe('Low')
    expect(insight.opportunity).not.toBeNull()
    expect(insight.source).toBe('observed_search_interest')
  })

  it('orders a content plan by opportunity', () => {
    const plan = generateContentPlan([
      analyzeKeyword({ term: 'a keyword', demandIndex: 90, competitionIndex: 10 }),
      analyzeKeyword({ term: 'b keyword', demandIndex: 20, competitionIndex: 90 }),
    ])
    expect(plan[0]!.opportunity!).toBeGreaterThanOrEqual(plan.at(-1)!.opportunity!)
  })
})

describe('trend velocity', () => {
  const now = Date.parse('2026-09-30T12:00:00Z')
  const hour = 60 * 60 * 1000

  it('detects rising interest from recent observations', () => {
    const velocity = computeTrendVelocity(
      'PoE 2 Patch 0.4',
      [
        { topic: 'PoE 2 Patch 0.4', observedAt: new Date(now - hour).toISOString(), weight: 5 },
        { topic: 'PoE 2 Patch 0.4', observedAt: new Date(now - 30 * hour).toISOString(), weight: 1 },
      ],
      { now },
    )
    expect(velocity.direction).toBe('up')
    expect(velocity.momentum).toContain('↑')
    expect(velocity.freshness).toBeGreaterThan(70)
    expect(velocity.action).toMatch(/publish/i)
  })

  it('says so when there are not enough observations', () => {
    const velocity = computeTrendVelocity('Nothing', [], { now })
    expect(velocity.observations).toBe(0)
    expect(velocity.action).toMatch(/not enough/i)
  })

  it('ranks trends by freshness', () => {
    const ranked = rankTrends(
      [
        { topic: 'fresh', observedAt: new Date(now - hour).toISOString(), weight: 3 },
        { topic: 'old', observedAt: new Date(now - 100 * hour).toISOString(), weight: 3 },
      ],
      { now },
    )
    expect(ranked[0]!.topic).toBe('fresh')
  })
})

describe('content gaps', () => {
  it('flags topics competitors cover that the channel does not', () => {
    const gaps = findContentGaps(
      [{ topic: 'boss guides', count: 6 }],
      [
        { topic: 'boss guides', count: 3 },
        { topic: 'budget builds', count: 5 },
      ],
    )
    expect(gaps.map((g) => g.topic)).toContain('budget builds')
    expect(gaps.find((g) => g.topic === 'budget builds')!.reason).toMatch(/has not covered/i)
  })

  it('detects a recurring series format', () => {
    const series = detectSeries([
      'Best Settings for Valorant',
      'Best Settings for CS2',
      'Best Settings for PoE 2',
      'An unrelated vlog',
    ])
    expect(series.some((s) => s.format.includes('best settings'))).toBe(true)
  })
})
