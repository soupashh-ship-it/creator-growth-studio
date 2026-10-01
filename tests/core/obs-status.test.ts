import { describe, expect, it } from 'vitest'
import { summarizeObsHealth, type ObsSnapshot } from '@core/obs/status'

const base: ObsSnapshot = {
  connected: true,
  currentScene: 'Gameplay',
  streaming: true,
  recording: false,
  droppedFramesPct: 0,
  bitrateKbps: 6000,
  fps: 60,
  cpuUsagePct: 40,
  checkedAt: '2026-09-30T00:00:00Z',
}

describe('summarizeObsHealth', () => {
  it('reports offline when not connected', () => {
    const health = summarizeObsHealth({ ...base, connected: false })
    expect(health.level).toBe('offline')
    expect(health.summary).toMatch(/not running/i)
  })

  it('is good with healthy stats', () => {
    const health = summarizeObsHealth(base)
    expect(health.level).toBe('good')
    expect(health.warnings).toEqual([])
    expect(health.summary).toContain('live')
    expect(health.summary).toContain('Gameplay')
  })

  it('warns on moderate frame drop and fails on severe drop', () => {
    expect(summarizeObsHealth({ ...base, droppedFramesPct: 2 }).level).toBe('warning')
    expect(summarizeObsHealth({ ...base, droppedFramesPct: 7 }).level).toBe('critical')
  })

  it('warns on low bitrate, low fps and high CPU', () => {
    expect(summarizeObsHealth({ ...base, bitrateKbps: 1500 }).warnings.join(' ')).toMatch(/bitrate/i)
    expect(summarizeObsHealth({ ...base, fps: 24 }).warnings.join(' ')).toMatch(/fps/i)
    expect(summarizeObsHealth({ ...base, cpuUsagePct: 92 }).warnings.join(' ')).toMatch(/cpu/i)
  })

  it('does not warn when values are unavailable', () => {
    const health = summarizeObsHealth({
      ...base,
      streaming: false,
      recording: true,
      droppedFramesPct: null,
      bitrateKbps: null,
      fps: null,
      cpuUsagePct: null,
    })
    expect(health.level).toBe('good')
    expect(health.warnings).toEqual([])
    expect(health.summary).toContain('recording')
  })
})
