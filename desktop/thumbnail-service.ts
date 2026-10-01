import { BrowserWindow, dialog, nativeImage } from 'electron'
import { analyzePixels, type PixelAnalysis } from '../core/thumbnail/pixels'
import {
  analyzeTitleThumbnailPair,
  scoreThumbnail,
  thumbnailIssues,
  type ThumbnailIssues,
} from '../core/scores/thumbnail'
import type { ScoreResult } from '../core/scores/engine'

/**
 * Thumbnail analysis (spec §16–17).
 *
 * The image is decoded with Electron's `nativeImage` (no external dependency)
 * and analysed entirely on-device — the file is never uploaded. Pixel features
 * are *derived*; face/text detection is not bundled, so those fields stay
 * "Not available" instead of being guessed.
 */
export interface ThumbnailAnalysis {
  ok: boolean
  canceled?: boolean
  error?: string
  filePath?: string
  width?: number
  height?: number
  features?: PixelAnalysis
  score?: ScoreResult
  issues?: ThumbnailIssues
  pair?: ReturnType<typeof analyzeTitleThumbnailPair> | null
}

export async function chooseThumbnailImage(): Promise<string | null> {
  const window = BrowserWindow.getFocusedWindow()
  const options = {
    title: 'Choose a thumbnail image',
    properties: ['openFile' as const],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }],
  }
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0] ?? null
}

export function analyzeThumbnailFile(
  filePath: string,
  options: { title?: string; thumbnailText?: string } = {},
): ThumbnailAnalysis {
  const image = nativeImage.createFromPath(filePath)
  if (image.isEmpty()) {
    return { ok: false, error: 'That file could not be decoded as an image.' }
  }

  const size = image.getSize()
  // Electron returns the raw bitmap; its byte order is platform-dependent
  // (BGRA on Windows).
  const bitmap = image.toBitmap()
  let features: PixelAnalysis
  try {
    features = analyzePixels({
      data: new Uint8Array(bitmap.buffer, bitmap.byteOffset, bitmap.byteLength),
      width: size.width,
      height: size.height,
      format: process.platform === 'win32' ? 'bgra' : 'rgba',
    })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not analyse the image.' }
  }

  const pair =
    options.title && options.thumbnailText
      ? analyzeTitleThumbnailPair(options.thumbnailText, options.title)
      : null

  return {
    ok: true,
    filePath,
    width: size.width,
    height: size.height,
    features,
    score: scoreThumbnail(features),
    issues: thumbnailIssues(features),
    pair,
  }
}

export async function analyzeThumbnail(payload: {
  path?: string
  title?: string
  thumbnailText?: string
}): Promise<ThumbnailAnalysis> {
  const filePath = payload.path ?? (await chooseThumbnailImage())
  if (!filePath) return { ok: false, canceled: true }
  return analyzeThumbnailFile(filePath, {
    ...(payload.title ? { title: payload.title } : {}),
    ...(payload.thumbnailText ? { thumbnailText: payload.thumbnailText } : {}),
  })
}
