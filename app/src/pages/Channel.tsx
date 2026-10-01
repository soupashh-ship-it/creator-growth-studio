import { useState } from 'react'
import type { JSX } from 'react'
import type { ScoreResult } from '@core/scores/engine'
import { IPC } from '../bridge'
import { callIpc, useIpc } from '../useIpc'
import { ScorePanel } from '../components/ScorePanel'
import { EmptyState } from '../components/EmptyState'

interface AnalyticsOverview {
  hasData: boolean
  videoCount: number
  totalViews: number
  averageViews: number | null
  medianViews: number | null
  comparison: { start: string; end: string; currentViews: number; previousViews: number; changePct: number | null } | null
  topVideos: Array<{ title: string; views: number | null; publishedAt: string | null }>
  outliers: Array<{ title: string; views: number; multiple: number }>
  patterns: Array<{ token: string; sample: number; liftPct: number | null; confidence: string }>
  series: Array<{ format: string; examples: string[] }>
  health: ScoreResult | null
  notes: string[]
}

const nf = new Intl.NumberFormat()

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[var(--color-surface-2)] p-3">
      <div className="text-[18px] font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-[var(--color-text-muted)]">{label}</div>
    </div>
  )
}

/**
 * Channel analytics (spec §27–29, §104).
 *
 * Every figure is derived from stored account data. Outliers and pattern lift
 * always show their sample size, and no causation is claimed.
 */
export function Channel(): JSX.Element {
  const { data, error, loading, reload } = useIpc<AnalyticsOverview>('analytics:overview')
  const [notice, setNotice] = useState<string | null>(null)

  async function exportReview(): Promise<void> {
    try {
      const review = await callIpc<{ markdown: string; generatedAt: string }>(IPC.reportsMonthlyReview)
      const saved = await callIpc<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>(IPC.dataSaveText, {
        defaultName: `monthly-review-${review.generatedAt.slice(0, 10)}.md`,
        content: review.markdown,
      })
      if (saved.ok) setNotice(`Saved to ${saved.path}.`)
      else if (!saved.canceled) setNotice(saved.error ?? 'Could not save the report.')
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Could not build the report.')
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Channel</h1>
          <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
            Performance derived from your stored videos. Baselines are your own channel median — never
            an industry estimate.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() =>
              void callIpc<{ markdown: string }>(IPC.reportsMonthlyReview)
                .then((review) => navigator.clipboard.writeText(review.markdown))
                .then(() => {
                  setNotice('Monthly review copied to the clipboard as Markdown.')
                  window.setTimeout(() => setNotice(null), 3000)
                })
                .catch(() => setNotice('Could not copy the report.'))
            }
            className="rounded-md border border-[var(--color-border-subtle)] px-3 py-1.5 text-[12px]"
          >
            Copy review to clipboard
          </button>
          <button
            type="button"
            onClick={() => void exportReview()}
            className="rounded-md border border-[var(--color-border-subtle)] px-3 py-1.5 text-[12px]"
          >
            Export monthly review
          </button>
          <button type="button" onClick={reload} className="rounded-md border border-[var(--color-border-subtle)] px-3 py-1.5 text-[12px]">
            ↻ Refresh
          </button>
        </div>
      </header>

      {notice && <p className="text-[12px] text-[var(--color-text-secondary)]">{notice}</p>}

      {loading && <p className="text-[13px] text-[var(--color-text-secondary)]">Loading analytics…</p>}
      {error && <p className="text-[13px] text-[var(--color-danger)]">{error}</p>}

      {!loading && !error && !data?.hasData && (
        <EmptyState
          title="No videos stored yet"
          body="Connect and sync a channel from Connections to populate analytics. Nothing is estimated while it is empty."
        />
      )}

      {data?.hasData && (
        <>
          <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
            <h2 className="text-sm font-semibold">Stored performance</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Videos" value={String(data.videoCount)} />
              <Stat label="Total views" value={nf.format(data.totalViews)} />
              <Stat label="Average" value={data.averageViews === null ? '—' : nf.format(Math.round(data.averageViews))} />
              <Stat label="Median" value={data.medianViews === null ? '—' : nf.format(Math.round(data.medianViews))} />
            </div>
            {data.comparison && (
              <p className="mt-3 text-[12px] text-[var(--color-text-secondary)]">
                Last 30 days: {nf.format(data.comparison.currentViews)} views vs {nf.format(data.comparison.previousViews)} prior ·{' '}
                {data.comparison.changePct === null ? 'no comparable baseline yet' : `${data.comparison.changePct >= 0 ? '+' : ''}${data.comparison.changePct.toFixed(1)}%`}
              </p>
            )}
          </section>

          {data.health && (
            <ScorePanel
              title="Channel health"
              result={data.health}
              source="Locally derived · deterministic engine (docs/SCORING.md §1)"
            />
          )}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
              <h2 className="text-sm font-semibold">Top videos</h2>
              {data.topVideos.length === 0 ? (
                <p className="mt-2 text-[13px] text-[var(--color-text-secondary)]">Not available.</p>
              ) : (
                <ul className="mt-2 divide-y divide-[var(--color-border-subtle)]">
                  {data.topVideos.map((video) => (
                    <li key={video.title} className="flex items-center justify-between py-1.5 text-[12px]">
                      <span className="truncate pr-3">{video.title}</span>
                      <span className="tabular-nums text-[var(--color-text-muted)]">{video.views === null ? 'Not available' : nf.format(video.views)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
              <h2 className="text-sm font-semibold">Outliers vs channel median</h2>
              {data.outliers.length === 0 ? (
                <p className="mt-2 text-[13px] text-[var(--color-text-secondary)]">No videos exceed 2× the channel median yet.</p>
              ) : (
                <ul className="mt-2 divide-y divide-[var(--color-border-subtle)]">
                  {data.outliers.map((outlier) => (
                    <li key={outlier.title} className="flex items-center justify-between py-1.5 text-[12px]">
                      <span className="truncate pr-3">{outlier.title}</span>
                      <span className="tabular-nums text-[var(--color-positive)]">{outlier.multiple}×</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
              <h2 className="text-sm font-semibold">Title patterns</h2>
              {data.patterns.length === 0 ? (
                <p className="mt-2 text-[13px] text-[var(--color-text-secondary)]">Not enough titles to detect a pattern.</p>
              ) : (
                <ul className="mt-2 divide-y divide-[var(--color-border-subtle)]">
                  {data.patterns.map((pattern) => (
                    <li key={pattern.token} className="flex items-center justify-between py-1.5 text-[12px]">
                      <span>“{pattern.token}”</span>
                      <span className="text-[11px] text-[var(--color-text-muted)]">
                        n={pattern.sample} · {pattern.liftPct === null ? 'no lift' : `${pattern.liftPct >= 0 ? '+' : ''}${pattern.liftPct.toFixed(0)}%`} · {pattern.confidence}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">Sample size is shown; these are associations, not causes.</p>
            </section>

            <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
              <h2 className="text-sm font-semibold">Detected series</h2>
              {data.series.length === 0 ? (
                <p className="mt-2 text-[13px] text-[var(--color-text-secondary)]">No recurring format detected yet.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {data.series.map((series) => (
                    <li key={series.format} className="rounded-md bg-[var(--color-surface-2)] p-3 text-[12px]">
                      <span className="font-medium">“{series.format}”</span>
                      <span className="text-[var(--color-text-muted)]"> · {series.examples.length} videos</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
            <h2 className="text-sm font-semibold">Notes</h2>
            <ul className="mt-2 space-y-1 text-[12px] text-[var(--color-text-secondary)]">
              {data.notes.map((note) => (
                <li key={note}>• {note}</li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
