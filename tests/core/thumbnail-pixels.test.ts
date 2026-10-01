import { describe, expect, it } from 'vitest'
import { analyzePixels, rgbToHue, type PixelBuffer } from '@core/thumbnail/pixels'
import { scoreThumbnail, thumbnailIssues } from '@core/scores/thumbnail'

type Fill = (x: number, y: number) => [number, number, number]

function makeImage(width: number, height: number, fill: Fill, format: 'rgba' | 'bgra' = 'rgba'): PixelBuffer {
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = fill(x, y)
      const i = (y * width + x) * 4
      if (format === 'bgra') {
        data[i] = b
        data[i + 1] = g
        data[i + 2] = r
      } else {
        data[i] = r
        data[i + 1] = g
        data[i + 2] = b
      }
      data[i + 3] = 255
    }
  }
  return { data, width, height, format }
}

describe('analyzePixels', () => {
  it('throws rather than scoring a truncated buffer', () => {
    expect(() => analyzePixels({ data: new Uint8Array(10), width: 100, height: 100 })).toThrow(/smaller/)
    expect(() => analyzePixels({ data: new Uint8Array(0), width: 0, height: 0 })).toThrow(/positive/)
  })

  it('reads a flat image as flat: no colour spread, no edges', () => {
    const analysis = analyzePixels(makeImage(80, 60, () => [128, 128, 128]))
    expect(Math.round(analysis.brightness)).toBe(128)
    expect(analysis.saturation).toBeCloseTo(0, 3)
    expect(analysis.uniqueColorCount).toBe(1)
    expect(analysis.contrast).toBeLessThan(1)
    expect(analysis.edgeDensity).toBeLessThan(1)
    expect(analysis.colorSeparation).toBeLessThan(1)
  })

  it('reads a black/white split as high contrast with edges', () => {
    const flat = analyzePixels(makeImage(80, 60, () => [128, 128, 128]))
    const split = analyzePixels(makeImage(80, 60, (x) => (x < 40 ? [0, 0, 0] : [255, 255, 255])))
    expect(split.contrast).toBeGreaterThan(90)
    expect(split.contrast).toBeGreaterThan(flat.contrast)
    expect(split.edgeDensity).toBeGreaterThan(flat.edgeDensity)
  })

  it('separates a coloured subject from its background', () => {
    const analysis = analyzePixels(
      makeImage(100, 100, (x, y) => {
        const inCenter = x >= 25 && x <= 75 && y >= 20 && y <= 80
        return inCenter ? [255, 220, 0] : [0, 0, 120]
      }),
    )
    expect(analysis.colorSeparation).toBeGreaterThan(50)
    expect(analysis.focalPointStrength).toBeGreaterThan(60)
    expect(analysis.dominantColor.r).toBeGreaterThan(200)
    expect(analysis.objectSizeRatio).toBeGreaterThan(0.2)
  })

  it('honours the BGRA byte order used by Electron', () => {
    const fill: Fill = (x, y) => (x >= 25 && x <= 75 && y >= 20 && y <= 80 ? [255, 220, 0] : [0, 0, 120])
    const rgba = analyzePixels(makeImage(100, 100, fill, 'rgba'))
    const bgra = analyzePixels(makeImage(100, 100, fill, 'bgra'))
    expect(bgra.dominantColor).toEqual(rgba.dominantColor)
    expect(bgra.dominantColor.r).toBeGreaterThan(200)
  })

  it('never fabricates face or text detection it cannot do', () => {
    const analysis = analyzePixels(makeImage(40, 40, () => [10, 200, 90]))
    expect(analysis.faceVisible).toBe(false)
    expect(analysis.textHeightPct).toBeNull()
    expect(analysis.textContrast).toBeNull()
    expect(analysis.mobileLegibility).toBeNull()
  })

  it('feeds the thumbnail scorer, which reports text as Not available', () => {
    const analysis = analyzePixels(
      makeImage(120, 80, (x, y) => (x > 30 && x < 90 && y > 10 && y < 70 ? [250, 30, 30] : [10, 10, 60])),
    )
    const result = scoreThumbnail(analysis)
    expect(result.score).not.toBeNull()
    const missing = result.missing.join(' ')
    expect(missing).toMatch(/Text readability/)
    expect(thumbnailIssues(analysis)).toBeTruthy()
  })
})

describe('rgbToHue', () => {
  it('maps the primaries correctly', () => {
    expect(rgbToHue({ r: 255, g: 0, b: 0 })).toBeCloseTo(0, 3)
    expect(rgbToHue({ r: 0, g: 255, b: 0 })).toBeCloseTo(120, 3)
    expect(rgbToHue({ r: 0, g: 0, b: 255 })).toBeCloseTo(240, 3)
  })
})
