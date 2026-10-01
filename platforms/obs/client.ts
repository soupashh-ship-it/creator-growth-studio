import OBSWebSocket from 'obs-websocket-js'
import { summarizeObsHealth, type ObsHealth, type ObsSnapshot } from '../../core/obs/status'

/**
 * OBS WebSocket client (spec §44).
 *
 * Uses obs-websocket protocol v5, which is bundled with OBS Studio 28+. The
 * password is supplied by the caller from the OS-encrypted secret store — it is
 * never persisted here. This module never changes OBS settings on its own.
 */
export interface ObsClientOptions {
  url?: string
  password?: string | null
}

const DEFAULT_URL = 'ws://127.0.0.1:4455'

export class ObsClient {
  private readonly obs = new OBSWebSocket()
  private connected = false

  constructor(private readonly options: ObsClientOptions = {}) {}

  get isConnected(): boolean {
    return this.connected
  }

  async connect(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.obs.connect(this.options.url ?? DEFAULT_URL, this.options.password ?? undefined)
      this.connected = true
      return { ok: true }
    } catch (error) {
      this.connected = false
      return { ok: false, error: error instanceof Error ? error.message : 'Could not connect to OBS.' }
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return
    try {
      await this.obs.disconnect()
    } finally {
      this.connected = false
    }
  }

  /** Reads a consistent snapshot of OBS state; fields unavailable are null. */
  async getSnapshot(): Promise<ObsSnapshot> {
    const checkedAt = new Date().toISOString()
    if (!this.connected) {
      return {
        connected: false,
        currentScene: null,
        streaming: false,
        recording: false,
        droppedFramesPct: null,
        bitrateKbps: null,
        fps: null,
        cpuUsagePct: null,
        checkedAt,
      }
    }

    const safe = async <T>(call: () => Promise<T>): Promise<T | null> => {
      try {
        return await call()
      } catch {
        return null
      }
    }

    const scene = await safe(() => this.obs.call('GetCurrentProgramScene'))
    const stream = await safe(() => this.obs.call('GetStreamStatus'))
    const record = await safe(() => this.obs.call('GetRecordStatus'))
    const stats = await safe(() => this.obs.call('GetStats'))

    let droppedFramesPct: number | null = null
    if (stream && stream.outputTotalFrames > 0) {
      droppedFramesPct = (stream.outputSkippedFrames / stream.outputTotalFrames) * 100
    }

    let bitrateKbps: number | null = null
    if (stream && stream.outputActive && stream.outputDuration > 0) {
      // outputBytes over outputDuration (ms) → kbps.
      bitrateKbps = (stream.outputBytes * 8) / (stream.outputDuration / 1000) / 1000
    }

    return {
      connected: true,
      currentScene: scene?.currentProgramSceneName ?? null,
      streaming: Boolean(stream?.outputActive),
      recording: Boolean(record?.outputActive),
      droppedFramesPct,
      bitrateKbps,
      fps: stats?.activeFps ?? null,
      cpuUsagePct: stats?.cpuUsage ?? null,
      checkedAt,
    }
  }

  async getHealth(): Promise<{ snapshot: ObsSnapshot; health: ObsHealth }> {
    const snapshot = await this.getSnapshot()
    return { snapshot, health: summarizeObsHealth(snapshot) }
  }
}
