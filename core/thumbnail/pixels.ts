import { clamp } from '../scores/engine'
import type { ThumbnailFeatures } from '../scores/thumbnail'

/**
 * Local thumbnail pixel analysis (spec §16).
 *
 * Decoding happens in the main process (Electron `nativeImage`); this module
 * turns a raw pixel buffer into the `ThumbnailFeatures` the scorer consumes. It
 * is pure and unit-tested with synthetic buffers.
 *
 * **Honest limitations — never fabricated:**
 * - Face detection and OCR are not bundled, so `faceVisible` is always `false`
 *   and the text metrics (`textHeightPct`, `textContrast`, `mobileLegibility`)
 *   are always `null`. The scorer already treats those as "Not available".
 * - Everything else is a *derived* index (brightness, contrast, saturation,
 *   edges, colour spread) computed from the actual pixels, not an estimate.
 */
export interface PixelBuffer {
  data: Uint8Array
  width: number
  height: number
  /** Electron's `getBitmap()` is BGRA on Windows; pass it explicitly. */
  format?: 'rgba' | 'bgra'
  /** Maximum samples to inspect; the grid is strided to stay within this. */
  maxSamples?: number
}

export interface Rgb {
  r: number
  g: number
  b: number
}

export interface PixelAnalysis extends ThumbnailFeatures {
  /** Mean luminance, 0–255. */
  brightness: number
  /** Mean chroma, 0–100. */
  saturation: number
  /** Distinct 4-bit-per-channel colours sampled. */
  uniqueColorCount: number
  /** Mean absolute luminance gradient, 0–100. */
  edgeDensity: number
  dominantColor: Rgb
  /** Number of pixels actually inspected. */
  samples: number
}

export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function rgbToHue({ r, g, b }: Rgb): number {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  if (delta === 0) return 0
  let hue: number
  if (max === r) hue = ((g - b) / delta) % 6
  else if (max === g) hue = (b - r) / delta + 2
  else hue = (r - g) / delta + 4
  hue *= 60
  return hue < 0 ? hue + 360 : hue
}

function saturationPct({ r, g, b }: Rgb): number {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max === 0 ? 0 : ((max - min) / max) * 100
}

/** Shortest distance between two hues, 0–180. */
function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

function quantKey(r: number, g: number, b: number): number {
  return ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
}

function dominantOf(map: Map<number, { count: number; rgb: Rgb }>): Rgb {
  let best: Rgb = { r: 0, g: 0, b: 0 }
  let bestCount = -1
  for (const entry of map.values()) {
    if (entry.count > bestCount) {
      bestCount = entry.count
      best = entry.rgb
    }
  }
  return best
}

/**
 * Derives thumbnail features from raw pixels. Throws when the buffer is smaller
 * than `width * height * 4`, so a decoding mistake is surfaced instead of
 * producing a bogus score.
 */
export function analyzePixels(buffer: PixelBuffer): PixelAnalysis {
  const { width, height } = buffer
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Pixel buffer must have positive width and height.')
  }
  const channels = 4
  if (buffer.data.length < width * height * channels) {
    throw new Error('Pixel buffer is smaller than width × height × 4 bytes.')
  }

  const bgra = buffer.format === 'bgra'
  const maxSamples = buffer.maxSamples ?? 20_000
  const stride = Math.max(1, Math.floor(Math.sqrt((width * height) / maxSamples)))
  const cols = Math.ceil(width / stride)
  const rows = Math.ceil(height / stride)

  const lumGrid = new Float64Array(cols * rows)
  const colorMap = new Map<number, { count: number; rgb: Rgb }>()
  const centerColors = new Map<number, { count: number; rgb: Rgb }>()
  const borderColors = new Map<number, { count: number; rgb: Rgb }>()

  let samples = 0
  let lumSum = 0
  let lumSqSum = 0
  let satSum = 0
  let centerSum = 0
  let centerCount = 0
  let borderSum = 0

  for (let row = 0; row < rows; row += 1) {
    const y = Math.min(height - 1, row * stride)
    for (let col = 0; col < cols; col += 1) {
      const x = Math.min(width - 1, col * stride)
      const index = (y * width + x) * channels
      const p0 = buffer.data[index] ?? 0
      const p1 = buffer.data[index + 1] ?? 0
      const p2 = buffer.data[index + 2] ?? 0
      const rgb: Rgb = bgra ? { r: p2, g: p1, b: p0 } : { r: p0, g: p1, b: p2 }

      const lum = luminance(rgb.r, rgb.g, rgb.b)
      lumGrid[row * cols + col] = lum
      samples += 1
      lumSum += lum
      lumSqSum += lum * lum
      satSum += saturationPct(rgb)

      const key = quantKey(rgb.r, rgb.g, rgb.b)
      const entry = colorMap.get(key)
      if (entry) entry.count += 1
      else colorMap.set(key, { count: 1, rgb })

      // Center region ~ the middle half of the frame; everything else is border.
      const isCenter = x >= width * 0.25 && x <= width * 0.75 && y >= height * 0.2 && y <= height * 0.8
      const region = isCenter ? centerColors : borderColors
      const regionEntry = region.get(key)
      if (regionEntry) regionEntry.count += 1
      else region.set(key, { count: 1, rgb })

      if (isCenter) {
        centerSum += lum
        centerCount += 1
      } else {
        borderSum += lum
      }
    }
  }

  const mean = samples === 0 ? 0 : lumSum / samples
  const variance = samples === 0 ? 0 : Math.max(0, lumSqSum / samples - mean * mean)
  const stdDev = Math.sqrt(variance)

  // Mean absolute gradient across the sampled grid.
  let gradientSum = 0
  let gradientCount = 0
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const here = lumGrid[row * cols + col] as number
      if (col + 1 < cols) {
        gradientSum += Math.abs((lumGrid[row * cols + col + 1] as number) - here)
        gradientCount += 1
      }
      if (row + 1 < rows) {
        gradientSum += Math.abs((lumGrid[(row + 1) * cols + col] as number) - here)
        gradientCount += 1
      }
    }
  }
  const meanGradient = gradientCount === 0 ? 0 : gradientSum / gradientCount

  const centerDominant = dominantOf(centerColors)
  const borderDominant = dominantOf(borderColors)
  const centerMean = centerCount === 0 ? mean : centerSum / centerCount
  const borderMean = samples - centerCount === 0 ? mean : borderSum / (samples - centerCount)

  const hueSeparation = hueDistance(rgbToHue(centerDominant), rgbToHue(borderDominant))
  // Neutral colours carry no hue, so treat a low-chroma pair as colour-identical.
  const chroma = Math.min(
    saturationPct(centerDominant),
    saturationPct(borderDominant),
  )
  const colorSeparation = clamp((hueSeparation / 180) * 100 * (chroma < 12 ? 0.2 : 1))

  // Background = pixels close to the border's dominant colour.
  let background = 0
  const threshold = 48
  for (const entry of colorMap.values()) {
    const distance =
      Math.abs(entry.rgb.r - borderDominant.r) +
      Math.abs(entry.rgb.g - borderDominant.g) +
      Math.abs(entry.rgb.b - borderDominant.b)
    if (distance <= threshold) background += entry.count
  }
  const objectSizeRatio = samples === 0 ? 0 : clamp(1 - background / samples, 0, 1)

  const contrast = clamp((stdDev / 70) * 100)
  const edgeDensity = clamp(meanGradient * 3)
  const luminanceDifference = clamp((Math.abs(centerMean - borderMean) / 128) * 100)
  const focalPointStrength = clamp(luminanceDifference * 0.55 + colorSeparation * 0.45)
  const centerShare = centerCount === 0 ? 0 : (centerColors.get(quantKey(centerDominant.r, centerDominant.g, centerDominant.b))?.count ?? 0) / centerCount
  const hierarchy = clamp(centerShare * 100)

  const uniqueColorCount = colorMap.size
  const clutter = clamp(edgeDensity * 0.65 + clamp((uniqueColorCount / 40) * 100) * 0.35)

  return {
    // Extracted indices
    brightness: mean,
    saturation: samples === 0 ? 0 : satSum / samples,
    uniqueColorCount,
    edgeDensity,
    dominantColor: centerDominant,
    samples,
    // Scorer features
    focalPointStrength,
    contrast,
    clutter,
    hierarchy,
    textHeightPct: null,
    textContrast: null,
    mobileLegibility: null,
    colorSeparation,
    faceVisible: false,
    objectSizeRatio,
  }
}
