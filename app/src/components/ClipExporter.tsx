import { useState } from 'react'
import type { JSX } from 'react'
import { FFMPEG_NOTES, clipDurationSeconds, formatTimestamp } from '@core/media/ffmpeg'
import { IPC } from '../bridge'
import { callIpc, useIpc } from '../useIpc'

interface FfmpegStatus {
  present: boolean
  canProbe: boolean
  version: string | null
  ffmpegPath: string
  detail: string
  hint: string
}

interface PickedVideo {
  canceled?: boolean
  path?: string
  durationSeconds?: number | null
}

interface ClipResult {
  ok: boolean
  canceled?: boolean
  outputPath: string
  error: string | null
}

const input =
  'rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-accent)]'

/**
 * Local clip export (spec §38).
 *
 * Exports a clip from a video on this machine using the ffmpeg the creator
 * already has. Nothing is uploaded and the app never downloads ffmpeg for you.
 * When ffmpeg is absent the control explains how to get it.
 */
export function ClipExporter(): JSX.Element {
  const status = useIpc<FfmpegStatus>(IPC.mediaFfmpegStatus)
  const [videoPath, setVideoPath] = useState('')
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null)
  const [start, setStart] = useState('0')
  const [end, setEnd] = useState('30')
  const [reencode, setReencode] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const startSeconds = Number(start)
  const endSeconds = Number(end)
  const clipLength =
    Number.isFinite(startSeconds) && Number.isFinite(endSeconds)
      ? clipDurationSeconds({ startSeconds, endSeconds })
      : 0

  async function pick(): Promise<void> {
    setNote(null)
    try {
      const picked = await callIpc<PickedVideo>(IPC.mediaPickVideo)
      if (picked.canceled || !picked.path) return
      setVideoPath(picked.path)
      setDurationSeconds(picked.durationSeconds ?? null)
      if (picked.durationSeconds) setEnd(String(Math.min(30, Math.round(picked.durationSeconds))))
    } catch (cause) {
      setNote(cause instanceof Error ? cause.message : 'Could not open the file picker.')
    }
  }

  async function exportClip(): Promise<void> {
    if (!videoPath) return
    setBusy(true)
    setNote(null)
    try {
      const result = await callIpc<ClipResult>(IPC.mediaExtractClip, {
        inputPath: videoPath,
        startSeconds,
        endSeconds,
        reencode,
      })
      if (result.canceled) setNote('Save cancelled.')
      else if (result.ok) setNote(`Saved clip to ${result.outputPath}`)
      else setNote(result.error ?? 'Export failed.')
    } catch (cause) {
      setNote(cause instanceof Error ? cause.message : 'Export failed.')
    } finally {
      setBusy(false)
    }
  }

  const available = status.data?.present ?? false

  return (
    <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Local clip export (§38)</h2>
        <span className="text-[11px] text-[var(--color-text-muted)]">
          {status.data ? (available ? 'ffmpeg detected' : 'ffmpeg not detected') : 'checking…'}
        </span>
      </div>
      <p className="mt-1 text-[12px] text-[var(--color-text-secondary)]">
        {status.data?.detail ?? 'Checking for ffmpeg on this machine…'}
      </p>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <button
          type="button"
          onClick={() => void pick()}
          disabled={!available}
          className="rounded-md border border-[var(--color-border-subtle)] px-4 py-2 text-[13px] disabled:opacity-40"
        >
          Choose video…
        </button>
        <span className="max-w-xs truncate text-[12px] text-[var(--color-text-muted)]">
          {videoPath || 'no file selected'}
          {durationSeconds !== null ? ` · ${formatTimestamp(durationSeconds)}` : ''}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-end gap-3 text-[12px]">
        <label className="flex flex-col">
          <span className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Start (s)</span>
          <input className={`${input} w-24`} type="number" min={0} value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="flex flex-col">
          <span className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">End (s)</span>
          <input className={`${input} w-24`} type="number" min={0} value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 pb-2">
          <input type="checkbox" checked={reencode} onChange={(e) => setReencode(e.target.checked)} />
          Frame-accurate (re-encode)
        </label>
        <span className="pb-2 text-[var(--color-text-muted)]">clip length {clipLength.toFixed(1)}s</span>
        <button
          type="button"
          onClick={() => void exportClip()}
          disabled={busy || !videoPath || clipLength <= 0}
          className="mb-0.5 rounded-md bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[#0b0d10] disabled:opacity-40"
        >
          {busy ? 'Exporting…' : 'Export clip'}
        </button>
      </div>

      {note && <p className="mt-2 text-[12px] text-[var(--color-text-secondary)]">{note}</p>}

      <ul className="mt-3 space-y-0.5 text-[11px] text-[var(--color-text-muted)]">
        {FFMPEG_NOTES.map((item) => (
          <li key={item}>• {item}</li>
        ))}
        {status.data && !status.data.present && status.data.hint && (
          <li>• Install from {status.data.hint}</li>
        )}
      </ul>
    </section>
  )
}
