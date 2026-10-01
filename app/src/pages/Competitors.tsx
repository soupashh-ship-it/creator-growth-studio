import { useState } from 'react'
import type { JSX } from 'react'
import { IPC } from '../bridge'
import { callIpc, useIpc } from '../useIpc'
import { EmptyState } from '../components/EmptyState'

interface FavoriteRow {
  entityType: string
  entityId: string
  createdAt: string
}

interface CompetitorVideo {
  title: string
  views: number | null
  publishedAt: string | null
}

interface CompetitorSnapshot {
  capturedAt: string
  subscriberCount: number | null
  videoCount: number | null
  viewCount: number | null
  medianViews: number | null
  videos: CompetitorVideo[]
}

interface CompetitorView {
  id: string
  platform: string
  label: string
  handle: string | null
  channelExternalId: string
  lastRefreshedAt: string | null
  snapshot: CompetitorSnapshot | null
}

interface Overview {
  medianViews: number | null
  videoCount: number
}

const nf = new Intl.NumberFormat()
const input =
  'w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-accent)]'

/**
 * Competitors (spec §25–26, §32).
 *
 * Reads public channel data through the official YouTube Data API (handle
 * lookup + uploads playlist). Competitor videos are kept in their own snapshot —
 * they never enter your analytics. Comparisons are stated as differences, not as
 * a race you are winning or losing.
 */
export function Competitors(): JSX.Element {
  const competitors = useIpc<CompetitorView[]>('competitors:list')
  const overview = useIpc<Overview>('analytics:overview')
  const favorites = useIpc<FavoriteRow[]>(IPC.favoritesList, { entityType: 'competitor' })
  const [handle, setHandle] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const favoriteIds = new Set((favorites.data ?? []).map((favorite) => favorite.entityId))

  async function toggleFavorite(id: string): Promise<void> {
    try {
      await callIpc(IPC.favoritesToggle, { entityType: 'competitor', entityId: id })
      favorites.reload()
    } catch {
      // Favorites are a convenience; failures must not disturb the page.
    }
  }

  async function add(): Promise<void> {
    if (!handle.trim()) return
    setBusy('add')
    setNotice(null)
    setActionError(null)
    try {
      const result = await callIpc<{ ok: boolean; label?: string; error?: string }>('competitors:add', {
        handle: handle.trim(),
      })
      if (result.ok) {
        setNotice(`Added ${result.label ?? handle.trim()}.`)
        setHandle('')
        competitors.reload()
      } else {
        setActionError(result.error ?? 'Could not add the competitor.')
      }
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not add the competitor.')
    } finally {
      setBusy(null)
    }
  }

  async function refresh(id: string): Promise<void> {
    setBusy(`refresh:${id}`)
    setActionError(null)
    try {
      const result = await callIpc<{ ok: boolean; videos?: number; error?: string }>('competitors:refresh', { id })
      if (!result.ok) setActionError(result.error ?? 'Refresh failed.')
      else setNotice(`Refreshed — ${result.videos ?? 0} recent upload(s).`)
      competitors.reload()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Refresh failed.')
    } finally {
      setBusy(null)
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await callIpc('competitors:remove', { id })
      competitors.reload()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not remove the competitor.')
    }
  }

  const yourMedian = overview.data?.medianViews ?? null

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Competitors</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
          Public channel data only, read through the official YouTube Data API. Requires a connected
          YouTube account.
        </p>
      </header>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="comp-handle">
          Channel handle
        </label>
        <div className="mt-1 flex flex-col gap-2 sm:flex-row">
          <input
            id="comp-handle"
            className={input}
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="@MrBeast"
          />
          <button
            type="button"
            onClick={() => void add()}
            disabled={busy !== null || !handle.trim()}
            className="shrink-0 rounded-md bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[#0b0d10] disabled:opacity-40"
          >
            {busy === 'add' ? 'Looking up…' : 'Add competitor'}
          </button>
        </div>
        {notice && <p className="mt-2 text-[12px] text-[var(--color-positive)]">{notice}</p>}
        {actionError && <p className="mt-2 text-[12px] text-[var(--color-danger)]">{actionError}</p>}
      </section>

      {competitors.loading && <p className="text-[13px] text-[var(--color-text-secondary)]">Loading competitors…</p>}
      {competitors.error && <p className="text-[13px] text-[var(--color-danger)]">{competitors.error}</p>}

      {competitors.data && competitors.data.length === 0 && !competitors.loading && (
        <EmptyState
          title="No competitors tracked"
          body="Add a channel handle above to track their public uploads and compare medians against your own."
        />
      )}

      {(competitors.data ?? []).map((competitor) => {
        const snapshot = competitor.snapshot
        const diff =
          snapshot?.medianViews != null && yourMedian != null ? snapshot.medianViews - yourMedian : null
        return (
          <section key={competitor.id} className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">{competitor.label}</h2>
                <p className="text-[11px] text-[var(--color-text-muted)]">
                  {competitor.handle ?? competitor.channelExternalId}
                  {competitor.lastRefreshedAt ? ` · refreshed ${new Date(competitor.lastRefreshedAt).toLocaleString()}` : ''}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void toggleFavorite(competitor.id)}
                  title={favoriteIds.has(competitor.id) ? 'Remove from favorites' : 'Add to favorites'}
                  className="rounded-md border border-[var(--color-border-subtle)] px-2.5 py-1.5 text-[12px]"
                >
                  {favoriteIds.has(competitor.id) ? '★' : '☆'}
                </button>
                <button
                  type="button"
                  onClick={() => void refresh(competitor.id)}
                  disabled={busy !== null}
                  className="rounded-md border border-[var(--color-border-subtle)] px-3 py-1.5 text-[12px] disabled:opacity-40"
                >
                  {busy === `refresh:${competitor.id}` ? 'Refreshing…' : '↻ Refresh'}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(competitor.id)}
                  className="rounded-md border border-[var(--color-border-subtle)] px-3 py-1.5 text-[12px] text-[var(--color-text-muted)]"
                >
                  Remove
                </button>
              </div>
            </div>

            {snapshot && (
              <>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-md bg-[var(--color-surface-2)] p-3">
                    <div className="text-[15px] font-semibold tabular-nums">
                      {snapshot.subscriberCount === null ? '—' : nf.format(snapshot.subscriberCount)}
                    </div>
                    <div className="text-[11px] text-[var(--color-text-muted)]">subscribers</div>
                  </div>
                  <div className="rounded-md bg-[var(--color-surface-2)] p-3">
                    <div className="text-[15px] font-semibold tabular-nums">
                      {snapshot.medianViews === null ? '—' : nf.format(Math.round(snapshot.medianViews))}
                    </div>
                    <div className="text-[11px] text-[var(--color-text-muted)]">median views (recent)</div>
                  </div>
                  <div className="rounded-md bg-[var(--color-surface-2)] p-3">
                    <div className="text-[15px] font-semibold tabular-nums">
                      {yourMedian === null ? '—' : nf.format(Math.round(yourMedian))}
                    </div>
                    <div className="text-[11px] text-[var(--color-text-muted)]">your median views</div>
                  </div>
                  <div className="rounded-md bg-[var(--color-surface-2)] p-3">
                    <div className="text-[15px] font-semibold tabular-nums">
                      {diff === null ? '—' : `${diff >= 0 ? '+' : ''}${nf.format(Math.round(diff))}`}
                    </div>
                    <div className="text-[11px] text-[var(--color-text-muted)]">difference</div>
                  </div>
                </div>

                {snapshot.videos.length > 0 && (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-[12px]">
                      <thead className="text-[var(--color-text-muted)]">
                        <tr>
                          <th className="py-1 pr-4">Recent upload</th>
                          <th className="py-1 pr-4">Published</th>
                          <th className="py-1 pr-4 text-right">Views</th>
                        </tr>
                      </thead>
                      <tbody>
                        {snapshot.videos.slice(0, 10).map((video, index) => (
                          <tr key={`${video.title}-${index}`} className="border-t border-[var(--color-border-subtle)]">
                            <td className="max-w-md truncate py-1.5 pr-4">{video.title}</td>
                            <td className="py-1.5 pr-4 text-[var(--color-text-muted)]">
                              {video.publishedAt ? new Date(video.publishedAt).toLocaleDateString() : '—'}
                            </td>
                            <td className="py-1.5 pr-4 text-right tabular-nums">
                              {video.views === null ? '—' : nf.format(video.views)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
                  Snapshot captured {new Date(snapshot.capturedAt).toLocaleString()}. Differences are
                  descriptive; they are not a prediction of your results.
                </p>
              </>
            )}
          </section>
        )
      })}
    </div>
  )
}
