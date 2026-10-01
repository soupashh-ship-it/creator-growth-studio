import { describe, expect, it } from 'vitest'
import { channelHealth } from '@core/scores/channel-health'

describe('channel health score', () => {
  it('produces a score with all pillars and full coverage', () => {
    const r = channelHealth({
      ctrPct: 6,
      avgViewPercentage: 45,
      durationRatio: 1.1,
      likesPerView: 0.05,
      commentsPerView: 0.006,
      returningSharePct: 35,
      subsPer1000Views: 8,
      impressionsTrendPct: 12,
      trafficShares: [0.4, 0.3, 0.2, 0.1],
      uploadIntervalVariation: 0.2,
    })
    expect(r.score).not.toBeNull()
    expect(r.coverage).toBe(1)
    expect(r.components.map((c) => c.key)).toEqual([
      'discovery',
      'retention',
      'engagement',
      'consistency',
      'conversion',
    ])
    expect(r.explanation.length).toBeGreaterThan(0)
  })

  it('drops unavailable pillars and lowers confidence', () => {
    const r = channelHealth({ ctrPct: 5, avgViewPercentage: 40 })
    // engagement/consistency/conversion are all absent -> coverage < 1
    expect(r.coverage).toBeLessThan(1)
    expect(r.missing).toContain('Engagement')
    expect(r.confidence === 'low' || r.confidence === 'medium').toBe(true)
  })

  it('returns null rather than a fabricated score when no data exists', () => {
    const r = channelHealth({})
    expect(r.score).toBeNull()
    expect(r.coverage).toBe(0)
  })

  it('scores a strong channel above a weak one', () => {
    const strong = channelHealth({
      ctrPct: 7.5,
      avgViewPercentage: 55,
      durationRatio: 1.3,
      likesPerView: 0.07,
      commentsPerView: 0.009,
      returningSharePct: 42,
      subsPer1000Views: 18,
      impressionsTrendPct: 25,
      trafficShares: [0.3, 0.3, 0.2, 0.2],
      uploadIntervalVariation: 0.1,
    })
    const weak = channelHealth({
      ctrPct: 1.2,
      avgViewPercentage: 22,
      durationRatio: 0.7,
      likesPerView: 0.005,
      commentsPerView: 0.0005,
      returningSharePct: 12,
      subsPer1000Views: 1,
      impressionsTrendPct: -25,
      trafficShares: [0.9, 0.1],
      uploadIntervalVariation: 0.9,
    })
    expect(strong.score! > weak.score!).toBe(true)
  })
})
