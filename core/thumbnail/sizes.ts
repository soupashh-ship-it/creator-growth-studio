/**
 * Thumbnail size test (spec §19).
 *
 * Shows what a thumbnail looks like at realistic feed sizes by *scaling the
 * rendered image in the UI*, and warns — from measured features, not guesses —
 * when text or the subject stop being readable. The math here is pure so it can
 * be unit-tested; the page owns the actual rendering.
 */

export interface SizePreset {
  /** Stable id used by the UI. */
  key: 'desktop' | 'sidebar' | 'search' | 'mobile-feed'
  label: string
  /** Rendered width in CSS px at 100% zoom. */
  widthPx: number
  /** Human context so the number means something. */
  context: string
}

/** Realistic YouTube surfaces, ordered largest → smallest (spec §19). */
export const SIZE_PRESETS: SizePreset[] = [
  { key: 'desktop', label: 'Desktop home feed', widthPx: 360, context: 'watch-page sidebar / desktop grid card' },
  { key: 'sidebar', label: 'Desktop sidebar', widthPx: 168, context: 'up-next card' },
  { key: 'search', label: 'Search result', widthPx: 246, context: 'desktop search row' },
  { key: 'mobile-feed', label: 'Mobile feed (approx.)', widthPx: 156, context: 'phone home feed at 100% zoom' },
]

export interface SizeVerdict {
  preset: SizePreset
  /** 0–100 readability of the text layer at this size (null: no text measured). */
  textReadability: number | null
  /** 0–100 readability of the overall image at this size. */
  imageReadability: number
  /** Human-readable warnings for this size; empty when it holds up. */
  warnings: string[]
}

export interface SizeTestFeatures {
  /** Text height as a fraction of image height (0–1), or null if no text. */
  textHeightPct: number | null
  /** 0–100 contrast of text against its background, or null. */
  textContrast: number | null
  /** 0–100 subject/background contrast. */
  contrast: number
  /** 0–100 clutter (higher = worse). */
  clutter: number
}

/** Text is considered unreadable below this rendered height in px. */
export const MIN_TEXT_RENDER_PX = 9
/** Below this image-level readability a size gets a generic warning. */
const IMAGE_WARNING_FLOOR = 45

/**
 * Readability of one text line at a given rendered width.
 *
 * Renders nothing here — it predicts from measured text geometry: rendered
 * height = textHeightPct × (width × 9/16), and legibility falls off once that
 * height drops under the pixel floor or the contrast is weak.
 */
function textReadabilityAt(
  presetWidth: number,
  f: SizeTestFeatures,
): number | null {
  if (f.textHeightPct == null) return null
  const renderedHeight = f.textHeightPct * ((presetWidth * 9) / 16)
  if (renderedHeight <= 0) return 0
  // Height factor: full marks at ≥2× the floor, zero at the floor.
  const heightFactor = Math.min(1, renderedHeight / (2 * MIN_TEXT_RENDER_PX))
  const contrastFactor = (f.textContrast ?? 60) / 100
  return Math.round(100 * heightFactor * (0.35 + 0.65 * contrastFactor))
}

/** Image-level readability at a size: small sizes amplify clutter and weak contrast. */
function imageReadabilityAt(presetWidth: number, f: SizeTestFeatures): number {
  // scale: 1 at the desktop reference width, ~0.43 at mobile feed size.
  const scale = Math.min(1, presetWidth / 360)
  // Contrast matters everywhere but less at tiny sizes; clutter hurts more as
  // the frame shrinks because detail merges into noise.
  const readability =
    f.contrast * (0.55 + 0.45 * scale) - f.clutter * (0.2 + 0.3 * (1 - scale))
  return Math.max(0, Math.round(readability))
}

export function runSizeTests(f: SizeTestFeatures): SizeVerdict[] {
  return SIZE_PRESETS.map((preset) => {
    const warnings: string[] = []
    const text = textReadabilityAt(preset.widthPx, f)
    const image = imageReadabilityAt(preset.widthPx, f)

    if (text != null) {
      if (text <= 25) {
        warnings.push(
          `Text becomes unreadable here (≈${Math.round((f.textHeightPct ?? 0) * ((preset.widthPx * 9) / 16))} px tall).`,
        )
      } else if (text <= 50) {
        warnings.push('Text is borderline at this size — shorten it or increase its height.')
      }
      if (f.textContrast != null && f.textContrast < 45 && text <= 50) {
        warnings.push('Weak text contrast gets worse as the thumbnail shrinks.')
      }
    }
    if (image < IMAGE_WARNING_FLOOR) {
      warnings.push('The subject stops standing out at this size; reduce clutter or boost contrast.')
    }

    return { preset, textReadability: text, imageReadability: image, warnings }
  })
}
