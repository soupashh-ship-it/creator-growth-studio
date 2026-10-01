import { describe, expect, it } from 'vitest'
import { runSizeTests, SIZE_PRESETS } from '@core/thumbnail/sizes'

describe('thumbnail size test (§19)', () => {
  it('covers the four realistic feed sizes', () => {
    expect(SIZE_PRESETS.map((p) => p.key)).toEqual(['desktop', 'sidebar', 'search', 'mobile-feed'])
  })

  it('warns when text becomes unreadable at small sizes', () => {
    // Tiny text: 4% of height → under 9 px at every feed size, worst on mobile.
    const tiny = runSizeTests({ textHeightPct: 0.04, textContrast: 80, contrast: 70, clutter: 20 })
    const mobile = tiny.find((v) => v.preset.key === 'mobile-feed')!
    expect(mobile.warnings.some((w) => w.toLowerCase().includes('unreadable'))).toBe(true)
    // Desktop still renders ~8px — borderline but not flagged unreadable.
    const desktop = tiny.find((v) => v.preset.key === 'desktop')!
    expect(desktop.warnings.some((w) => w.toLowerCase().includes('unreadable'))).toBe(false)
  })

  it('keeps readable text warning-free when it is large and high-contrast', () => {
    const big = runSizeTests({ textHeightPct: 0.25, textContrast: 85, contrast: 85, clutter: 10 })
    for (const verdict of big) expect(verdict.warnings).toEqual([])
  })

  it('flags cluttered, low-contrast compositions at small sizes', () => {
    const messy = runSizeTests({ textHeightPct: null, textContrast: null, contrast: 25, clutter: 85 })
    const mobile = messy.find((v) => v.preset.key === 'mobile-feed')!
    expect(mobile.warnings.some((w) => w.includes('standing out'))).toBe(true)
  })

  it('reports no text warnings when no text was measured', () => {
    const noText = runSizeTests({ textHeightPct: null, textContrast: null, contrast: 80, clutter: 10 })
    for (const verdict of noText) {
      expect(verdict.textReadability).toBeNull()
      expect(verdict.warnings).toEqual([])
    }
  })
})
