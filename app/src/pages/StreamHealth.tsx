import { useState } from 'react'
import type { JSX } from 'react'
import { callIpc } from '../useIpc'

interface ObsSnapshot {
  connected: boolean
  currentScene: string | null
  streaming: boolean
  recording: boolean
  droppedFramesPct: number | null
  bitrateKbps: number | null
  fps: number | null
  cpuUsagePct: number | null
  checkedAt: string
}

interface ObsHealth {
  level: 'good' | 'warning' | 'critical' | 'offline'
  warnings: string[]
  summary: string
}

const levelColor: Record<ObsHealth['level'], string> = {
  good: 'var(--color-positive)',
  warning: 'var(--color-warning)',
  critical: 'var(--color-danger)',
  offline: 'var(--color-text-muted)',
}

const input =
  'w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-accent)]'

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[var(--color-surface-2)] p-3">
      <div className="text-[16px] font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-[var(--color-text-muted)]">{label}</div>
    </div>
  )
}

/**
 * Stream Health (spec §44). Reads real OBS stats over obs-websocket v5.
 * The app never changes OBS settings — it only observes.
 */
export function StreamHealth(): JSX.Element {
  const [password, setPassword] = useState('')
  const [snapshot, setSnapshot] = useState<ObsSnapshot | null>(null)
  const [health, setHealth] = useState<ObsHealth | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function refresh(): Promise<void> {
    setBusy(true)
    try {
      const result = await callIpc<{ snapshot: ObsSnapshot; health: ObsHealth }>('obs:health')
      setSnapshot(result.snapshot)
      setHealth(result.health)
      setStatus(null)
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : 'Could not read OBS status')
    } finally {
      setBusy(false)
    }
  }

  async function connect(): Promise<void> {
    setBusy(true)
    try {
      const result = await callIpc<{ ok: boolean; error?: string; health: { snapshot: ObsSnapshot; health: ObsHealth } }>(
        'obs:connect',
        { password: password || undefined },
      )
      if (!result.ok) setStatus(result.error ?? 'Could not connect to OBS')
      else {
        setStatus('Connected to OBS.')
        setSnapshot(result.health.snapshot)
        setHealth(result.health.health)
      }
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : 'Could not connect to OBS')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Stream Health</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
          Optional. Requires OBS Studio 28+ with the WebSocket server enabled. Nothing is changed in
          OBS — this only reads status.
        </p>
      </header>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="obs-pw">
          OBS WebSocket password (stored in OS-encrypted storage)
        </label>
        <input
          id="obs-pw"
          type="password"
          className={`${input} mt-1`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="leave blank if OBS has no password"
        />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => void connect()}
            disabled={busy}
            className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[#0b0d10] disabled:opacity-40"
          >
            Connect
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={busy}
            className="rounded-md border border-[var(--color-border-subtle)] px-4 py-2 text-[13px] disabled:opacity-40"
          >
            ↻ Refresh
          </button>
        </div>
        {status && <p className="mt-2 text-[12px] text-[var(--color-text-secondary)]">{status}</p>}
      </section>

      {health && (
        <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Status</h2>
            <span className="text-[12px] font-medium" style={{ color: levelColor[health.level] }}>
              {health.level}
            </span>
          </div>
          <p className="mt-1 text-[13px] text-[var(--color-text-secondary)]">{health.summary}</p>
          {health.warnings.length > 0 && (
            <ul className="mt-2 space-y-1 text-[12px] text-[var(--color-warning)]">
              {health.warnings.map((warning) => (
                <li key={warning}>! {warning}</li>
              ))}
            </ul>
          )}

          {snapshot && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Scene" value={snapshot.currentScene ?? '—'} />
              <Stat label="Streaming" value={snapshot.streaming ? 'Yes' : 'No'} />
              <Stat label="Recording" value={snapshot.recording ? 'Yes' : 'No'} />
              <Stat label="Dropped" value={snapshot.droppedFramesPct === null ? '—' : `${snapshot.droppedFramesPct.toFixed(1)}%`} />
              <Stat label="Bitrate" value={snapshot.bitrateKbps === null ? '—' : `${Math.round(snapshot.bitrateKbps)} kbps`} />
              <Stat label="FPS" value={snapshot.fps === null ? '—' : Math.round(snapshot.fps).toString()} />
              <Stat label="CPU" value={snapshot.cpuUsagePct === null ? '—' : `${Math.round(snapshot.cpuUsagePct)}%`} />
              <Stat label="Checked" value={new Date(snapshot.checkedAt).toLocaleTimeString()} />
            </div>
          )}
        </section>
      )}
    </div>
  )
}
