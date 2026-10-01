import { describe, expect, it } from 'vitest'
import { scoreTitle, compareTitles } from '@core/scores/title'
import { scoreThumbnail, thumbnailIssues, analyzeTitleThumbnailPair } from '@core/scores/thumbnail'
import { opportunityScore } from '@core/scores/opportunity'
import { streamDiscoveryScore } from '@core/scores/stream-discovery'

describe('title score', () => {
  it('rewards specificity and curiosity over a vague title', () => {
    const strong = scoreTitle({ title: 'Lightning Arrow Deadeye Is INSANE After Patch 0.4', primaryKeyword: 'lightning arrow' })
    const vague = scoreTitle({ title: 'A Video About Arrows', primaryKeyword: 'lightning arrow' })
    const spec = (r: typeof strong) => r.components.find((c) => c.key === 'specificity')!.value!
    const cur = (r: typeof strong) => r.components.find((c) => c.key === 'curiosity')!.value!
    expect(spec(strong)).toBeGreaterThan(spec(vague))
    expect(cur(strong)).toBeGreaterThan(cur(vague))
  })

  it('A/B comparison never claims a certain CTR outcome', () => {
    const cmp = compareTitles(
      { title: 'Best Lightning Arrow Build in PoE 2' },
      { title: 'Lightning Arrow Is BROKEN in PoE 2 0.4' },
    )
    expect(cmp.summary.a.likelyStrength).toBeTruthy()
    expect(cmp.summary.b.likelyWeakness).toBeTruthy()
    expect(JSON.stringify(cmp)).not.toMatch(/ctr/i)
  })
})

describe('thumbnail score', () => {
  const base = {
    focalPointStrength: 80,
    contrast: 75,
    clutter: 20,
    hierarchy: 70,
    textHeightPct: 0.14,
    textContrast: 80,
    mobileLegibility: 85,
    colorSeparation: 70,
    faceVisible: true,
    objectSizeRatio: 0.5,
  }

  it('scores a clean, readable thumbnail highly', () => {
    const r = scoreThumbnail(base)
    expect(r.score!).toBeGreaterThan(70)
    expect(thumbnailIssues(base).problems).toHaveLength(0)
  })

  it('flags unreadably small text and clutter', () => {
    const r = scoreThumbnail({ ...base, textHeightPct: 0.04, clutter: 80 })
    const issues = thumbnailIssues({ ...base, textHeightPct: 0.04, clutter: 80 })
    expect(issues.textTooSmall).toBe(true)
    expect(issues.problems.join(' ')).toMatch(/too small/i)
    expect(issues.problems.join(' ')).toMatch(/cluttered/i)
    expect(r.score!).toBeLessThan(scoreThumbnail(base).score!)
  })

  it('detects a thumbnail that merely repeats the title', () => {
    const dup = analyzeTitleThumbnailPair('BEST POE 2 BUILD', 'Best PoE 2 Build')
    expect(dup.duplicates).toBe(true)
    expect(dup.recommendation).toMatch(/repeats/i)

    const complementary = analyzeTitleThumbnailPair('20 DIVINES', 'Best PoE 2 Build')
    expect(complementary.duplicates).toBe(false)
  })
})

describe('opportunity score', () => {
  it('prefers high demand with low competition', () => {
    const good = opportunityScore({ demand: 90, competition: 20, channelFit: 90, freshness: 90 })
    const bad = opportunityScore({ demand: 20, competition: 90, channelFit: 20, freshness: 20 })
    expect(good.score!).toBeGreaterThan(bad.score!)
  })

  it('surfaces relative demand labels, never a fabricated volume', () => {
    const r = opportunityScore({ demand: 80, demandLabel: 'High', competition: 40, competitionLabel: 'Medium' })
    const text = r.explanation.join(' ')
    expect(text).toMatch(/Relative demand: High/)
    expect(text).not.toMatch(/search volume/i)
  })
})

describe('stream discovery score', () => {
  it('rewards a high viewer/channel ratio', () => {
    const good = streamDiscoveryScore({ viewers: 40000, channels: 600 })
    const bad = streamDiscoveryScore({ viewers: 5000, channels: 5000 })
    expect(good.score!).toBeGreaterThan(bad.score!)
  })

  it('is unavailable without live category data', () => {
    expect(streamDiscoveryScore({}).score).toBeNull()
  })
})
