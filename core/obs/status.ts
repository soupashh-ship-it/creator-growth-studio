/**
 * OBS stream-health (spec §44).
 *
 * Pure logic so it is testable without OBS running. The client that fills this
 * in lives in `platforms/obs/client.ts`. Values come from OBS's own stats API —
 * nothing is estimated.
 */
export interface ObsSnapshot {
  connected: boolean
  currentScene: string | null
  streaming: boolean
  recording: boolean
  /** Percentage of frames dropped by the encoder, or null when not streaming. */
  droppedFramesPct: number | null
  bitrateKbps: number | null
  fps: number | null
  cpuUsagePct: number | null
  checkedAt: string
}

export type ObsHealthLevel = 'good' | 'warning' | 'critical' | 'offline'

export interface ObsHealth {
  level: ObsHealthLevel
  warnings: string[]
  summary: string
}

/**
 * Summarises stream health using explicit thresholds. This is guidance, not a
 * guarantee that a stream will be problem-free.
 */
export function summarizeObsHealth(snapshot: ObsSnapshot): ObsHealth {
  if (!snapshot.connected) {
    return { level: 'offline', warnings: [], summary: 'OBS is not running or the WebSocket is not connected.' }
  }

  const warnings: string[] = []
  let level: ObsHealthLevel = 'good'

  const dropped = snapshot.droppedFramesPct
  if (dropped !== null) {
    if (dropped >= 5) {
      level = 'critical'
      warnings.push(`${dropped.toFixed(1)}% of frames are being dropped — check your encoder/network.`)
    } else if (dropped >= 1) {
      level = 'warning'
      warnings.push(`${dropped.toFixed(1)}% frame drop is above the healthy threshold.`)
    }
  }

  if (snapshot.bitrateKbps !== null && snapshot.bitrateKbps < 2500) {
    level = level === 'critical' ? 'critical' : 'warning'
    warnings.push(`Bitrate is ${Math.round(snapshot.bitrateKbps)} kbps, which may look soft.`)
  }

  if (snapshot.fps !== null && snapshot.fps < 30) {
    level = level === 'critical' ? 'critical' : 'warning'
    warnings.push(`Render FPS is ${Math.round(snapshot.fps)} — below 30.`)
  }

  if (snapshot.cpuUsagePct !== null && snapshot.cpuUsagePct > 80) {
    level = level === 'critical' ? 'critical' : 'warning'
    warnings.push(`CPU usage is ${Math.round(snapshot.cpuUsagePct)}%.`)
  }

  const parts: string[] = []
  parts.push(snapshot.streaming ? 'live' : 'not streaming')
  if (snapshot.recording) parts.push('recording')
  if (snapshot.currentScene) parts.push(`scene "${snapshot.currentScene}"`)

  return {
    level,
    warnings,
    summary: `OBS: ${parts.join(' · ')}`,
  }
}
