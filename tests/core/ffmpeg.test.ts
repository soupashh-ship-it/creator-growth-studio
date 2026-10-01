import { describe, expect, it } from 'vitest'
import {
  assertValidClip,
  buildClipArgs,
  buildProbeArgs,
  clipDurationSeconds,
  formatTimestamp,
  parseDurationSeconds,
} from '@core/media/ffmpeg'

describe('formatTimestamp', () => {
  it('formats seconds as HH:MM:SS.mmm', () => {
    expect(formatTimestamp(0)).toBe('00:00:00.000')
    expect(formatTimestamp(65.5)).toBe('00:01:05.500')
    expect(formatTimestamp(3661.25)).toBe('01:01:01.250')
  })

  it('clamps negatives to zero', () => {
    expect(formatTimestamp(-5)).toBe('00:00:00.000')
  })
})

describe('buildClipArgs', () => {
  const base = {
    inputPath: 'C:/videos/vod.mp4',
    outputPath: 'C:/out/clip.mp4',
    startSeconds: 10,
    endSeconds: 25,
  }

  it('stream-copies by default', () => {
    const args = buildClipArgs(base)
    expect(args).toContain('-ss')
    expect(args).toContain('00:00:10.000')
    expect(args).toContain('00:00:15.000')
    expect(args).toEqual(expect.arrayContaining(['-c', 'copy']))
    expect(args[args.length - 1]).toBe('C:/out/clip.mp4')
  })

  it('re-encodes when asked', () => {
    const args = buildClipArgs({ ...base, reencode: true })
    expect(args).toEqual(expect.arrayContaining(['-c:v', 'libx264', '-c:a', 'aac']))
    expect(args).not.toEqual(expect.arrayContaining(['-c', 'copy']))
  })
})

describe('assertValidClip', () => {
  it('rejects empty paths and inverted ranges', () => {
    expect(() => assertValidClip({ inputPath: '', outputPath: 'x', startSeconds: 0, endSeconds: 5 })).toThrow()
    expect(() => assertValidClip({ inputPath: 'a', outputPath: '', startSeconds: 0, endSeconds: 5 })).toThrow()
    expect(() => assertValidClip({ inputPath: 'a', outputPath: 'b', startSeconds: 10, endSeconds: 5 })).toThrow()
    expect(() => assertValidClip({ inputPath: 'a', outputPath: 'b', startSeconds: -1, endSeconds: 5 })).toThrow()
  })

  it('accepts a valid range', () => {
    expect(() => assertValidClip({ inputPath: 'a', outputPath: 'b', startSeconds: 0, endSeconds: 5 })).not.toThrow()
    expect(clipDurationSeconds({ startSeconds: 2, endSeconds: 12 })).toBe(10)
  })
})

describe('parseDurationSeconds', () => {
  it('reads the duration from ffprobe JSON', () => {
    expect(parseDurationSeconds('{"format":{"duration":"123.456"}}')).toBeCloseTo(123.456, 3)
  })

  it('accepts a numeric duration and rejects garbage', () => {
    expect(parseDurationSeconds('{"format":{"duration":42}}')).toBe(42)
    expect(parseDurationSeconds('not json')).toBeNull()
    expect(parseDurationSeconds('{"format":{}}')).toBeNull()
    expect(parseDurationSeconds('{"format":{"duration":"0"}}')).toBeNull()
  })
})

describe('buildProbeArgs', () => {
  it('requests the container duration as JSON', () => {
    const args = buildProbeArgs('movie.mp4')
    expect(args).toContain('format=duration')
    expect(args).toContain('json')
    expect(args[args.length - 1]).toBe('movie.mp4')
  })
})
