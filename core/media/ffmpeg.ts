/**
 * FFmpeg clip export (spec §38).
 *
 * Optional local tooling: clipping runs ONLY if the creator has ffmpeg on PATH
 * (or points the app at it). Everything here is pure and unit-tested — argument
 * construction and ffprobe parsing — so the exact command is verifiable without
 * the binary installed. No upload happens; the clip is written to disk.
 */

export interface ClipRequest {
  inputPath: string
  outputPath: string
  startSeconds: number
  endSeconds: number
  /**
   * Re-encode (accurate cuts anywhere) vs stream copy (instant, keyframe-bound).
   * Stream copy is the default because it is lossless and fast.
   */
  reencode?: boolean
}

/** Formats seconds as HH:MM:SS.mmm for ffmpeg input arguments. */
export function formatTimestamp(seconds: number): string {
  const clamped = Math.max(0, seconds)
  const hours = Math.floor(clamped / 3600)
  const minutes = Math.floor((clamped % 3600) / 60)
  const secs = Math.floor(clamped % 60)
  const millis = Math.round((clamped - Math.floor(clamped)) * 1000)
  const pad = (value: number, width = 2): string => String(value).padStart(width, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}.${pad(millis, 3)}`
}

export function clipDurationSeconds(request: Pick<ClipRequest, 'startSeconds' | 'endSeconds'>): number {
  return Math.max(0, request.endSeconds - request.startSeconds)
}

/** Throws when the requested clip range or paths are unusable. */
export function assertValidClip(request: ClipRequest): void {
  if (!request.inputPath.trim()) throw new Error('Choose a source video first.')
  if (!request.outputPath.trim()) throw new Error('Choose where to save the clip.')
  if (!Number.isFinite(request.startSeconds) || !Number.isFinite(request.endSeconds)) {
    throw new Error('Start and end must be numbers.')
  }
  if (request.startSeconds < 0) throw new Error('Start cannot be negative.')
  if (clipDurationSeconds(request) <= 0) throw new Error('End must be after start.')
}

/** Builds the ffmpeg argument list (excluding the binary itself). */
export function buildClipArgs(request: ClipRequest): string[] {
  assertValidClip(request)
  const args = [
    '-y',
    '-ss',
    formatTimestamp(request.startSeconds),
    '-i',
    request.inputPath,
    '-t',
    formatTimestamp(clipDurationSeconds(request)),
  ]
  if (request.reencode) {
    // Accurate cut: re-encode so the clip starts exactly on the requested frame.
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac')
  } else {
    // Fast lossless cut; boundaries snap to the nearest keyframe.
    args.push('-c', 'copy')
  }
  args.push('-movflags', '+faststart', request.outputPath)
  return args
}

/** ffprobe argument list to read a container's duration as JSON. */
export function buildProbeArgs(inputPath: string): string[] {
  return [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'json',
    '-i',
    inputPath,
  ]
}

/** Parses `ffprobe -show_entries format=duration -of json` output. */
export function parseDurationSeconds(probeJson: string): number | null {
  try {
    const parsed = JSON.parse(probeJson) as { format?: { duration?: string | number } }
    const raw = parsed.format?.duration
    if (raw === undefined) return null
    const value = typeof raw === 'number' ? raw : Number(raw)
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

export const FFMPEG_NOTES = [
  'Clips are exported with the ffmpeg installed on this machine — nothing is uploaded.',
  'Stream copy is instant and lossless but starts at the nearest keyframe; enable re-encode for frame-accurate cuts (slower).',
  'The app never downloads ffmpeg for you; it only calls the binary you already have.',
]
