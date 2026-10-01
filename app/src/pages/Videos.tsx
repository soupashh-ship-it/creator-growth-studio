import { useMemo, useState } from 'react'
import type { JSX } from 'react'
import { reviewPublishedVideo } from '@core/writing/post-publish'
import { scoreTitle } from '@core/scores/title'
import { IPC } from '../bridge'
import { callIpc, useIpc } from '../useIpc'
import { EmptyState } from '../components/EmptyState'
import { ScorePanel } from '../components/ScorePanel'

interface TrajectoryPoint {
  hoursSincePublish: number
  capturedAt: string
  views: number | null
}

interface WindowComparison {
  label: string
  views: number | null
  status: 'measured' | 'no-snapshot' | 'not-yet'
}

interface VideoTrajectory {
  title: string
  windows: WindowComparison[]
  points: TrajectoryPoint[]
  growthSinceFirst: number | null
  notes: string[]
}

interface VideoRow {
  id: string
  platform: string
  external_id: string
  title: string | null
  published_at: string | null
  views: number | null
  likes: number | null
  comments: number | null
}

const nf = new Intl.NumberFormat()
type SortKey = 'published' | 'views' | 'likes' | 'comments'

const input =
  'rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-accent)]'

/**
 * Videos (spec §27). A plain, sortable view of the rows the app actually stored.
 * Missing per-video metrics show an em dash, never a zero or an estimate.
 */
export function Videos(): JSX.Element {
  const { data, error, loading } = useIpc<VideoRow[]>('videos:list')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('published')
  const [notice, setNotice] = useState<string | null>(null)

  async function exportCsv(): Promise<void> {
    try {
      const result = await callIpc<{ csv: string; fileName: string }>(IPC.reportsVideosCsv)
      const saved = await callIpc<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>(IPC.dataSaveText, {
        defaultName: result.fileName,
        content: result.csv,
      })
      if (saved.ok) setNotice(`Saved to ${saved.path}.`)
      else if (!saved.canceled) setNotice(saved.error ?? 'Could not save the CSV.')
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Could not build the CSV.')
    }
  }

  const rows = useMemo(() => {
    const list = (data ?? []).filter((video) => (video.title ?? '').toLowerCase().includes(query.toLowerCase()))
    return [...list].sort((a, b) => {
      if (sort === 'published') return Date.parse(b.published_at ?? '') - Date.parse(a.published_at ?? '')
      return (b[sort] ?? -1) - (a[sort] ?? -1)
    })
  }, [data, query, sort])

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Videos</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
          Everything the app has stored for this workspace. Values come from the platform API or are
          left blank.
        </p>
      </header>

      <section className="flex flex-wrap items-center gap-2">
        <input className={input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by title…" aria-label="Filter videos" />
        <select className={input} value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort by">
          <option value="published">Newest first</option>
          <option value="views">Most views</option>
          <option value="likes">Most likes</option>
          <option value="comments">Most comments</option>
        </select>
        <button
          type="button"
          onClick={() => void exportCsv()}
          disabled={(data?.length ?? 0) === 0}
          className="rounded-md border border-[var(--color-border-subtle)] px-3 py-2 text-[13px] disabled:opacity-40"
        >
          Export CSV
        </button>
      </section>

      {notice && <p className="text-[12px] text-[var(--color-text-secondary)]">{notice}</p>}

      {loading && <p className="text-[13px] text-[var(--color-text-secondary)]">Loading videos…</p>}
      {error && <p className="text-[13px] text-[var(--color-danger)]">{error}</p>}

      {data && data.length === 0 && !loading && (
        <EmptyState
          title="No videos stored yet"
          body="Sync a connected channel from Connections to pull your uploads into the local database."
        />
      )}

      {rows.length > 0 && (
        <>
        <section className="overflow-x-auto rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
          <table className="w-full text-left text-[12px]">
            <thead className="text-[var(--color-text-muted)]">
              <tr>
                <th className="py-1 pr-4">Title</th>
                <th className="py-1 pr-4">Platform</th>
                <th className="py-1 pr-4">Published</th>
                <th className="py-1 pr-4 text-right">Views</th>
                <th className="py-1 pr-4 text-right">Likes</th>
                <th className="py-1 pr-4 text-right">Comments</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((video) => (
                <tr key={video.id} className="border-t border-[var(--color-border-subtle)]">
                  <td className="max-w-md truncate py-1.5 pr-4">{video.title ?? '(untitled)'}</td>
                  <td className="py-1.5 pr-4 text-[var(--color-text-muted)]">{video.platform}</td>
                  <td className="py-1.5 pr-4 text-[var(--color-text-muted)]">
                    {video.published_at ? new Date(video.published_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{video.views === null ? '—' : nf.format(video.views)}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{video.likes === null ? '—' : nf.format(video.likes)}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{video.comments === null ? '—' : nf.format(video.comments)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <PostPublishSection videos={rows} />
        <DiagnosisSection videos={rows} />
        </>
      )}
    </div>
  )
}

function PostPublishSection({ videos }: { videos: VideoRow[] }): JSX.Element | null {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [trajectory, setTrajectory] = useState<VideoTrajectory | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const withViews = videos.filter((video) => video.views !== null)
  if (withViews.length === 0) return null

  const viewValues = withViews.map((video) => video.views as number).sort((a, b) => a - b)
  const median: number | null =
    viewValues.length === 0
      ? null
      : viewValues.length % 2 === 1
        ? (viewValues[(viewValues.length - 1) / 2] ?? null)
        : ((viewValues[viewValues.length / 2 - 1] ?? 0) + (viewValues[viewValues.length / 2] ?? 0)) / 2

  const selected = videos.find((video) => video.id === selectedId) ?? withViews[0]
  if (!selected) return null
  const review = reviewPublishedVideo({
    title: selected.title ?? '',
    views: selected.views ?? null,
    channelMedianViews: median,
    likes: selected.likes ?? null,
    comments: selected.comments ?? null,
  })

  return (
    <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
      <h2 className="text-sm font-semibold">Post-publish review</h2>
      <select
        value={selected.id}
        onChange={(e) => setSelectedId(e.target.value)}
        aria-label="Video to review"
        className="mt-2 w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px]"
      >
        {withViews.map((video) => (
          <option key={video.id} value={video.id}>
            {video.title ?? '(untitled)'}
          </option>
        ))}
      </select>
      <div className="mt-3 space-y-3">
        <ScorePanel title="Title score (current)" result={review.titleScore} source="Locally derived · deterministic title engine (docs/SCORING.md §6)" />

        <button
          type="button"
          onClick={() => {
            if (trajectory) {
              setTrajectory(null)
              return
            }
            void callIpc<VideoTrajectory>(IPC.videoTrajectory, { videoId: selected.id })
              .then(setTrajectory)
              .catch(() => setTrajectory(null))
          }}
          className="rounded-md border border-[var(--color-border-subtle)] px-3 py-1.5 text-[12px]"
        >
          {trajectory ? 'Hide performance windows' : 'Show performance windows (1h–28d)'}
        </button>
        {trajectory && (
          <div className="rounded-md bg-[var(--color-surface-2)] p-3">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {trajectory.windows.map((window_) => (
                <div key={window_.label} className="rounded bg-[var(--color-surface-1)] px-2 py-1.5 text-[11px]">
                  <div className="text-[var(--color-text-muted)]">{window_.label}</div>
                  <div className="font-medium tabular-nums">
                    {window_.status === 'measured'
                      ? (window_.views === null ? '—' : nf.format(window_.views))
                      : window_.status === 'not-yet'
                        ? 'not yet'
                        : 'no snapshot'}
                  </div>
                </div>
              ))}
            </div>
            <ul className="mt-2 space-y-0.5 text-[11px] text-[var(--color-text-muted)]">
              {trajectory.notes.map((note) => (
                <li key={note}>• {note}</li>
              ))}
            </ul>
          </div>
        )}

        <button
          type="button"
          onClick={() => setBulkOpen((open) => !open)}
          className="rounded-md border border-[var(--color-border-subtle)] px-3 py-1.5 text-[12px]"
        >
          {bulkOpen ? 'Hide bulk title scores' : `Score all ${withViews.length} titles`}
        </button>
        {bulkOpen && (
          <div className="rounded-md bg-[var(--color-surface-2)] p-3">
            <ul className="space-y-1">
              {withViews
                .map((video) => ({ video, score: scoreTitle({ title: video.title ?? '' }) }))
                .sort((a, b) => (b.score.score ?? 0) - (a.score.score ?? 0))
                .map(({ video, score }) => (
                  <li key={video.id} className="flex items-center justify-between text-[12px]">
                    <span className="max-w-md truncate">{video.title ?? '(untitled)'}</span>
                    <span className="shrink-0 tabular-nums text-[var(--color-text-muted)]">
                      {score.score ?? '—'}/100
                      {score.missing.length > 0 ? ` · missing: ${score.missing.length} input(s)` : ''}
                    </span>
                  </li>
                ))
            }
            </ul>
            <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
              Scores are heuristic and computed sequentially — no platform calls, no concurrency.
            </p>
          </div>
        )}
        <p className="text-[12px] text-[var(--color-text-secondary)]">
          {review.medianRatio === null
            ? 'Not enough stored data to compare against the channel median.'
            : `Performance: ${review.medianRatio}× the channel median (${median ? nf.format(Math.round(median)) : '—'} views).`}
        </p>
        <ul className="space-y-2">
          {review.suggestions.map((suggestion) => (
            <li key={suggestion.action} className="rounded-md bg-[var(--color-surface-2)] p-3 text-[12px]">
              <div className="font-medium">{suggestion.action}</div>
              <div className="mt-0.5 text-[var(--color-text-secondary)]">{suggestion.detail}</div>
            </li>
          ))}
        </ul>
        <ul className="space-y-1 text-[11px] text-[var(--color-text-muted)]">
          {review.notes.map((note) => (
            <li key={note}>• {note}</li>
          ))}
        </ul>
      </div>
    </section>
  )
}

interface DiagnosisFinding {
  stage: string
  summary: string
  evidence: string[]
  actions: string[]
}

/**
 * §53 early performance diagnosis: compares the selected video's synced CTR /
 * retention against the channel medians and names the likely limiting stage.
 * Hypotheses with evidence only — never causes, never invented numbers.
 */
function DiagnosisSection({ videos }: { videos: VideoRow[] }): JSX.Element | null {
  const [videoId, setVideoId] = useState<string | null>(null)
  const [finding, setFinding] = useState<DiagnosisFinding | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const withViews = videos.filter((video) => video.views !== null)
  if (withViews.length === 0) return null

  async function run(): Promise<void> {
    if (!videoId) return
    setBusy(true)
    setError(null)
    try {
      const result = await callIpc<DiagnosisFinding>(IPC.growthDiagnose, { videoId })
      setFinding(result)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Diagnosis failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
      <h2 className="text-sm font-semibold">Early performance diagnosis</h2>
      <p className="mt-1 text-[12px] text-[var(--color-text-secondary)]">
        Compares synced CTR/retention against your channel medians and names the likely limiting stage. Hypotheses, not causes.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={videoId ?? ''}
          onChange={(e) => setVideoId(e.target.value || null)}
          aria-label="Video to diagnose"
          className="min-w-56 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px]"
        >
          <option value="">Choose a video…</option>
          {withViews.map((video) => (
            <option key={video.id} value={video.id}>{video.title ?? '(untitled)'}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy || videoId === null}
          className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-medium text-[#0b0d10] disabled:opacity-40"
        >
          {busy ? 'Diagnosing…' : 'Diagnose'}
        </button>
      </div>
      {error && <p className="mt-2 text-[12px] text-[var(--color-danger)]">{error}</p>}
      {finding && (
        <div className="mt-3 space-y-2 rounded-md bg-[var(--color-surface-2)] p-3">
          <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">
            Stage: {finding.stage}
          </div>
          <p className="text-[13px]">{finding.summary}</p>
          {finding.evidence.length > 0 && (
            <ul className="space-y-0.5 text-[11px] text-[var(--color-text-muted)]">
              {finding.evidence.map((item) => <li key={item}>• {item}</li>)}
            </ul>
          )}
          {finding.actions.length > 0 && (
            <ul className="space-y-1 text-[12px]">
              {finding.actions.map((item) => (
                <li key={item} className="rounded bg-[var(--color-surface-1)] px-2 py-1.5">→ {item}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
