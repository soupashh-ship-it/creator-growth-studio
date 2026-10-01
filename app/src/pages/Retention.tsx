import { useState } from 'react'
import type { JSX } from 'react'
import { IPC } from '../bridge'
import { callIpc, useIpc } from '../useIpc'
import { EmptyState } from '../components/EmptyState'

interface AnalyticsVideo {
  video_id: string
  title: string | null
  impressions: number | null
  ctr: number | null
  avg_view_pct: number | null
  avg_view_duration_s: number | null
  subs_gained: number | null
  revenue_micros: number | null
}

interface AnalyticsSnapshot {
  videos: AnalyticsVideo[]
  hasData: boolean
  note: string
}

interface RetentionPoint {
  elapsed_ratio: number
  watch_ratio: number | null
}

const nf = new Intl.NumberFormat()

function clock(seconds: number | null): string {
  if (seconds === null) return '—'
  const total = Math.round(seconds)
  const minutes = Math.floor(total / 60)
  const secs = total % 60
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

/**
 * Retention (spec §30, §36).
 *
 * Every number comes from the official YouTube Analytics API after a sync. Until
 * one runs, the page says "Not available" rather than drawing an invented curve.
 */
export function Retention(): JSX.Element {
  const snapshot = useIpc<AnalyticsSnapshot>(IPC.analyticsSnapshot)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [curve, setCurve] = useState<RetentionPoint[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  async function sync(): Promise<void> {
    setBusy(true)
    setNote(null)
    try {
      const result = await callIpc<{
        ok: boolean
        videosUpdated: number
        demographicBuckets: number
        retentionCurves: number
        error?: string
      }>(IPC.analyticsSync, { days: 90 })
      setNote(
        result.ok
          ? `Synced ${result.videosUpdated} video(s), ${result.demographicBuckets} demographic bucket(s), ${result.retentionCurves} retention curve(s).`
          : (result.error ?? 'Sync failed.'),
      )
      snapshot.reload()
    } catch (cause) {
      setNote(cause instanceof Error ? cause.message : 'Sync failed.')
    } finally {
      setBusy(false)
    }
  }

  async function loadCurve(videoId: string): Promise<void> {
    setSelectedId(videoId)
    setCurve(null)
    try {
      const points = await callIpc<RetentionPoint[]>(IPC.videoRetention, { videoId })
      setCurve(points)
    } catch {
      setCurve([])
    }
  }

  const videos = (snapshot.data?.videos ?? []).filter((video) => video.avg_view_pct !== null || video.ctr !== null)
  const path = (() => {
    const points = (curve ?? []).filter((point) => point.watch_ratio !== null)
    if (points.length < 2) return null
    return points
      .map((point, index) => {
        const x = Math.min(100, Math.max(0, point.elapsed_ratio * 100))
        const y = Math.min(100, Math.max(0, 100 - (point.watch_ratio as number) * 100))
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
      })
      .join(' ')
  })()

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Retention</h1>
          <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
            Average view duration/percentage and where viewers drop off — official YouTube Analytics values.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void sync()}
          disabled={busy}
          className="rounded-md border border-[var(--color-border-subtle)] px-3 py-1.5 text-[12px] disabled:opacity-40"
        >
          {busy ? 'Syncing…' : 'Sync YouTube Analytics'}
        </button>
      </header>

      {note && <p className="text-[12px] text-[var(--color-text-secondary)]">{note}</p>}
      {snapshot.error && <p className="text-[12px] text-[var(--color-danger)]">{snapshot.error}</p>}

      {!snapshot.data?.hasData && (
        <EmptyState
          title="Not available"
          body="Retention data requires the YouTube Analytics API. Connect a channel, then run “Sync YouTube Analytics” — no curve is estimated in the meantime."
        />
      )}

      {snapshot.data && videos.length > 0 && (
        <section className="overflow-x-auto rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
          <h2 className="text-sm font-semibold">Per-video averages</h2>
          <table className="mt-2 w-full text-left text-[12px]">
            <thead className="text-[var(--color-text-muted)]">
              <tr>
                <th className="py-1 pr-4">Title</th>
                <th className="py-1 pr-4 text-right">Impr.</th>
                <th className="py-1 pr-4 text-right">CTR</th>
                <th className="py-1 pr-4 text-right">Avg view %</th>
                <th className="py-1 pr-4 text-right">Avg view</th>
                <th className="py-1 pr-4 text-right">Subs</th>
                <th className="py-1 pr-4 text-right">Revenue</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {videos.map((video) => (
                <tr key={video.video_id} className="border-t border-[var(--color-border-subtle)]">
                  <td className="max-w-md truncate py-1.5 pr-4">{video.title ?? '(untitled)'}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{video.impressions === null ? '—' : nf.format(video.impressions)}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{video.ctr === null ? '—' : `${(video.ctr * 100).toFixed(1)}%`}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{video.avg_view_pct === null ? '—' : `${video.avg_view_pct.toFixed(1)}%`}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{clock(video.avg_view_duration_s)}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{video.subs_gained === null ? '—' : nf.format(video.subs_gained)}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">
                    {video.revenue_micros === null ? '—' : (video.revenue_micros / 1_000_000).toFixed(2)}
                  </td>
                  <td className="py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => void loadCurve(video.video_id)}
                      className="rounded-md border border-[var(--color-border-subtle)] px-2 py-0.5 text-[11px]"
                    >
                      Curve
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {selectedId && (
        <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
          <h2 className="text-sm font-semibold">Retention curve</h2>
          {path === null ? (
            <p className="mt-2 text-[12px] text-[var(--color-text-secondary)]">
              No retention curve stored for this video yet. Sync again or open a video with more watch history.
            </p>
          ) : (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="mt-3 h-32 w-full rounded-md bg-[var(--color-surface-2)]">
              <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            </svg>
          )}
          <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
            X: 0–100% of the video. Y: share of viewers still watching (100% at the top). Official
            YouTube Analytics `audienceWatchRatio`.
          </p>
        </section>
      )}

      {snapshot.data?.note && <p className="text-[11px] text-[var(--color-text-muted)]">{snapshot.data.note}</p>}
    </div>
  )
}
