import { spawnSync } from 'node:child_process'
import { buildClipArgs, buildProbeArgs, parseDurationSeconds, type ClipRequest } from '../core/media/ffmpeg'
import { getServices } from './services'

/**
 * FFmpeg clip export service (spec §38).
 *
 * Uses the ffmpeg/ffprobe the creator already has (on PATH, or at a path they
 * set). Nothing is downloaded or uploaded; a clip is written to a file they
 * choose. When ffmpeg is missing, callers receive a clear instruction instead of
 * a silent failure.
 */

const FFMPEG_SETTING = 'media.ffmpegPath'
const FFPROBE_SETTING = 'media.ffprobePath'

function configured(command: string, key: string): string {
  const stored = getServices().repos.getSetting<string>('app', key)
  return stored && stored.trim() ? stored.trim() : command
}

export interface FfmpegStatus {
  present: boolean
  canProbe: boolean
  version: string | null
  ffmpegPath: string
  ffprobePath: string
  detail: string
  hint: string
}

function probeVersion(command: string): string | null {
  try {
    const result = spawnSync(command, ['-version'], {
      encoding: 'utf8',
      timeout: 4000,
      shell: process.platform === 'win32',
    })
    if (result.error || result.status !== 0) return null
    const first = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().split('\n')[0]
    return first ? first.slice(0, 120) : null
  } catch {
    return null
  }
}

export function getFfmpegStatus(): FfmpegStatus {
  const ffmpegPath = configured('ffmpeg', FFMPEG_SETTING)
  const ffprobePath = configured('ffprobe', FFPROBE_SETTING)
  const ffmpegVersion = probeVersion(ffmpegPath)
  const ffprobeVersion = probeVersion(ffprobePath)
  const present = ffmpegVersion !== null
  const canProbe = ffprobeVersion !== null

  return {
    present,
    canProbe,
    version: ffmpegVersion,
    ffmpegPath,
    ffprobePath,
    detail: present
      ? `Found ${ffmpegPath}${canProbe ? '' : ' (ffprobe not found — durations will be unknown)'}. Local clip export is available.`
      : 'ffmpeg was not found. Install it and add it to PATH (or set its path in Advanced) to export clips locally.',
    hint: 'https://ffmpeg.org/download.html',
  }
}

export interface VideoProbe {
  path: string
  durationSeconds: number | null
}

export function probeVideo(inputPath: string): VideoProbe {
  const status = getFfmpegStatus()
  if (!status.canProbe) return { path: inputPath, durationSeconds: null }
  try {
    const result = spawnSync(status.ffprobePath, buildProbeArgs(inputPath), {
      encoding: 'utf8',
      timeout: 15_000,
      shell: process.platform === 'win32',
    })
    if (result.error || result.status !== 0) return { path: inputPath, durationSeconds: null }
    return { path: inputPath, durationSeconds: parseDurationSeconds(result.stdout ?? '') }
  } catch {
    return { path: inputPath, durationSeconds: null }
  }
}

export interface ClipResult {
  ok: boolean
  outputPath: string
  error: string | null
}

export function extractClip(request: ClipRequest): ClipResult {
  const status = getFfmpegStatus()
  if (!status.present) {
    return { ok: false, outputPath: request.outputPath, error: status.detail }
  }

  let args: string[]
  try {
    args = buildClipArgs(request)
  } catch (cause) {
    return {
      ok: false,
      outputPath: request.outputPath,
      error: cause instanceof Error ? cause.message : 'Invalid clip request.',
    }
  }

  const result = spawnSync(status.ffmpegPath, args, {
    encoding: 'utf8',
    timeout: 15 * 60_000,
    shell: process.platform === 'win32',
  })
  if (result.error) {
    return { ok: false, outputPath: request.outputPath, error: result.error.message }
  }
  if (result.status !== 0) {
    const tail = `${result.stderr ?? ''}`.trim().split('\n').slice(-4).join(' ')
    return { ok: false, outputPath: request.outputPath, error: tail || `ffmpeg exited with code ${result.status}` }
  }
  return { ok: true, outputPath: request.outputPath, error: null }
}
