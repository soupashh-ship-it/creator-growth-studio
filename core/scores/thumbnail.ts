import { clamp, combine, lin, type ScoreComponent, type ScoreResult } from './engine'

/**
 * Thumbnail scoring (spec §16) from *features* extracted locally.
 *
 * Image processing (canvas/edge/saliency) produces `ThumbnailFeatures`; this
 * module only scores them, keeping the math pure and unit-testable, and keeping
 * images on-device (no cloud upload — spec §16).
 */
export interface ThumbnailFeatures {
  /** 0–100: how clearly one subject stands out. */
  focalPointStrength: number
  /** 0–100: luminance/region contrast. */
  contrast: number
  /** 0–100: how cluttered the frame is (higher = worse). */
  clutter: number
  /** 0–100: dominance of the primary region. */
  hierarchy: number
  /** Text height as a fraction of image height (0–1), or null if no text. */
  textHeightPct: number | null
  /** 0–100 contrast of text against its background. */
  textContrast: number | null
  /** 0–100: legibility at a ~120px-wide mobile size. */
  mobileLegibility: number | null
  /** 0–100: hue separation between subject and background. */
  colorSeparation: number
  faceVisible: boolean
  /** Largest object area as a fraction of the frame (0–1). */
  objectSizeRatio: number
}

const MOBILE_MIN_TEXT_PCT = 0.09

export function scoreThumbnail(f: ThumbnailFeatures): ScoreResult {
  const textReadability =
    f.textHeightPct == null ? null : clamp(lin(f.textHeightPct, 0.03, 0.14) * 0.7 + (f.textContrast ?? 60) * 0.3)
  const mobileReadability =
    f.mobileLegibility ?? (f.textHeightPct == null ? null : clamp(lin(f.textHeightPct, MOBILE_MIN_TEXT_PCT, 0.18)))

  const components: ScoreComponent[] = [
    { key: 'focal_point', label: 'Focal point / subject separation', weight: 20, value: f.focalPointStrength, detail: `subject saliency ${Math.round(f.focalPointStrength)}/100` },
    { key: 'contrast', label: 'Contrast', weight: 15, value: f.contrast, detail: `contrast ${Math.round(f.contrast)}/100` },
    { key: 'clutter', label: 'Clutter (lower is better)', weight: 15, value: 100 - f.clutter, detail: `clutter ${Math.round(f.clutter)}/100 → ${Math.round(100 - f.clutter)}/100` },
    { key: 'hierarchy', label: 'Visual hierarchy', weight: 15, value: f.hierarchy, detail: `primary-region dominance ${Math.round(f.hierarchy)}/100` },
    { key: 'text_readability', label: 'Text readability', weight: 15, value: textReadability, detail: f.textHeightPct == null ? 'No text detected' : `text is ${Math.round(f.textHeightPct * 100)}% of height` },
    { key: 'mobile_readability', label: 'Mobile readability', weight: 10, value: mobileReadability, detail: f.textHeightPct == null ? 'No text detected' : `legibility at small sizes ${Math.round(mobileReadability ?? 0)}/100` },
    { key: 'color_separation', label: 'Color separation', weight: 10, value: f.colorSeparation, detail: `subject/background hue separation ${Math.round(f.colorSeparation)}/100` },
  ]

  return combine(components)
}

export interface ThumbnailIssues {
  strengths: string[]
  problems: string[]
  /** True when text height is below the mobile readability floor. */
  textTooSmall: boolean
}

export function thumbnailIssues(f: ThumbnailFeatures): ThumbnailIssues {
  const strengths: string[] = []
  const problems: string[] = []

  if (f.focalPointStrength >= 70) strengths.push('Clear focal point')
  else if (f.focalPointStrength < 40) problems.push('No clear focal point — the eye has nowhere to land')

  if (f.contrast >= 65) strengths.push('Strong subject/background contrast')
  else if (f.contrast < 40) problems.push('Low contrast — the subject blends into the background')

  if (f.clutter >= 60) problems.push('Too many competing objects (cluttered)')
  if (f.hierarchy >= 70) strengths.push('Strong visual hierarchy')
  if (f.faceVisible) strengths.push('A face is visible — faces aid recognition')
  if (f.objectSizeRatio < 0.25) problems.push('Main object is small in the frame')

  const textTooSmall = f.textHeightPct != null && f.textHeightPct < MOBILE_MIN_TEXT_PCT
  if (textTooSmall) problems.push('Text is too small at feed size')
  if (f.textContrast != null && f.textContrast < 45) problems.push('Text has weak contrast against its background')

  return { strengths, problems, textTooSmall }
}

/**
 * Thumbnail + title pair analyzer (spec §17): detects when thumbnail text just
 * repeats the title instead of complementing it.
 */
export function analyzeTitleThumbnailPair(
  thumbnailText: string,
  title: string,
): { overlap: number; duplicates: boolean; recommendation: string; suggestions: string[] } {
  const tokens = (s: string): string[] =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)

  const titleTokens = new Set(tokens(title))
  const thumbTokens = tokens(thumbnailText)
  const overlapTokens = thumbTokens.filter((w) => titleTokens.has(w))
  const overlap = thumbTokens.length === 0 ? 0 : overlapTokens.length / thumbTokens.length
  const duplicates = overlap >= 0.5 && thumbTokens.length > 0

  return {
    overlap,
    duplicates,
    recommendation: duplicates
      ? 'The thumbnail repeats information already communicated by the title. Use the thumbnail to add a different idea (a number, a result, or a reaction).'
      : 'The thumbnail and title communicate complementary information.',
    suggestions: duplicates ? ['Add a concrete number or result', 'Show a reaction/emotion instead of restating the title'] : [],
  }
}
