import type { JSX } from 'react'
import { useMemo, useState } from 'react'
import { buildPortfolioBalance } from '@research/portfolio'
import { FEED_NOTES, parseFeedSources } from '@research/feeds'
import { IPC } from '../bridge'
import { callIpc, useIpc } from '../useIpc'
import { EmptyState } from '../components/EmptyState'

interface TrendRow {
  topic: string
  source: string
  freshness: number | null
  last_seen: string | null
  raw_json: string
}

interface FeedSyncResult {
  fetched: number
  totalItems: number
  results: Array<{ source: string; ok: boolean; items: number; error: string | null }>
  topics: Array<{ topic: string }>
}

const input =
  'w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-accent)]'

interface TrendVelocity {
  topic: string
  direction: 'up' | 'flat' | 'down'
  momentum: string
  freshness: number
  recentWeight: number
  priorWeight: number
  observations: number
  action: string
}

interface VideoRowLite {
  title: string | null
}

const CATEGORY_LABEL: Record<string, string> = {
  evergreen: 'Evergreen',
  trend: 'Trend/patch',
  news: 'News',
  seasonal: 'Seasonal',
  format: 'Series/format',
}

const directionColor: Record<TrendVelocity['direction'], string> = {
  up: 'var(--color-positive)',
  flat: 'var(--color-text-muted)',
  down: 'var(--color-warning)',
}

/**
 * Trends (spec §23–24).
 *
 * This is your **publishing momentum** for recurring topics, computed from your
 * own upload history — it is explicitly not platform search interest, which has
 * no official public API. The distinction is stated on the page.
 */
export function Trends(): JSX.Element {
  const { data, error, loading, reload } = useIpc<TrendVelocity[]>(IPC.researchMomentum)
  const videos = useIpc<{ videos: VideoRowLite[] }>(IPC.videosList)

  // External RSS/Atom sources (§23).
  const storedFeeds = useIpc<{ value: string | null }>(IPC.settingsGet, { key: 'feeds.sources' })
  const topics = useIpc<TrendRow[]>(IPC.feedsList)
  const [feedEdit, setFeedEdit] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<FeedSyncResult | null>(null)
  const [feedNote, setFeedNote] = useState<string | null>(null)
  const [feedBusy, setFeedBusy] = useState(false)
  const feedText = feedEdit ?? storedFeeds.data?.value ?? ''

  async function syncFeeds(): Promise<void> {
    const urls = parseFeedSources(feedText)
    if (urls.length === 0) {
      setFeedNote('Add at least one http(s) feed URL.')
      return
    }
    setFeedBusy(true)
    setFeedNote(null)
    try {
      await callIpc(IPC.settingsSet, { key: 'feeds.sources', value: feedText })
      const result = await callIpc<FeedSyncResult>(IPC.feedsSync, { urls })
      setSyncResult(result)
      setFeedNote(
        `Read ${result.totalItems} title(s) from ${result.results.filter((r) => r.ok).length}/${result.fetched} feed(s); ${result.topics.length} topic(s) recorded.`,
      )
      topics.reload()
    } catch (cause) {
      setFeedNote(cause instanceof Error ? cause.message : 'Feed sync failed.')
    } finally {
      setFeedBusy(false)
    }
  }

  // Portfolio balance is computed locally from titles — derive, don't effect.
  const portfolio = useMemo(
    () => buildPortfolioBalance((videos.data?.videos ?? []).map((video) => ({ title: video.title } as never))),
    [videos.data],
  )

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Trends</h1>
          <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
            Momentum for the topics you publish about most, measured against your own history within a
            24-hour window. This is not platform search interest.
          </p>
        </div>
        <button type="button" onClick={reload} className="rounded-md border border-[var(--color-border-subtle)] px-3 py-1.5 text-[12px]">
          ↻ Refresh
        </button>
      </header>

      {loading && <p className="text-[13px] text-[var(--color-text-secondary)]">Computing momentum…</p>}
      {error && <p className="text-[13px] text-[var(--color-danger)]">{error}</p>}

      {data && data.length === 0 && !loading && (
        <EmptyState
          title="No topics to measure yet"
          body="Momentum is derived from your uploaded videos. Sync a channel, then this fills in automatically."
        />
      )}

      {data && data.length > 0 && (
        <ul className="space-y-2">
          {data.map((trend) => (
            <li
              key={trend.topic}
              className="flex items-start justify-between rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4"
            >
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-[14px] font-medium">{trend.topic}</span>
                  <span className="text-[13px]" style={{ color: directionColor[trend.direction] }}>
                    {trend.momentum}
                  </span>
                </div>
                <p className="mt-1 text-[12px] text-[var(--color-text-secondary)]">{trend.action}</p>
                <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                  {trend.observations} upload(s) · recent {trend.recentWeight} vs prior {trend.priorWeight}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[16px] font-semibold tabular-nums">{trend.freshness}</div>
                <div className="text-[10px] text-[var(--color-text-muted)]">freshness</div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">External sources (§23)</h2>
          <button
            type="button"
            onClick={() => void syncFeeds()}
            disabled={feedBusy || parseFeedSources(feedText).length === 0}
            className="rounded-md border border-[var(--color-border-subtle)] px-3 py-1.5 text-[12px] disabled:opacity-40"
          >
            {feedBusy ? 'Reading feeds…' : 'Sync feeds'}
          </button>
        </div>
        <p className="mt-1 text-[12px] text-[var(--color-text-secondary)]">
          Add the public RSS/Atom feeds you follow (news, blogs, Reddit’s <code>.rss</code> feeds).
          Topics are ranked by how often they appear across those titles.
        </p>
        <textarea
          className={`${input} mt-2 min-h-20 resize-y font-mono text-[12px]`}
          value={feedText}
          onChange={(e) => setFeedEdit(e.target.value)}
          placeholder={'https://www.reddit.com/r/pathofexile/.rss\nhttps://example.com/blog/feed.xml'}
          aria-label="Feed URLs"
        />
        {feedNote && <p className="mt-2 text-[12px] text-[var(--color-text-secondary)]">{feedNote}</p>}
        {syncResult && (
          <ul className="mt-2 space-y-0.5 text-[11px] text-[var(--color-text-muted)]">
            {syncResult.results.map((result) => (
              <li key={result.source}>
                {result.ok ? '✓' : '✕'} {result.source} — {result.ok ? `${result.items} title(s)` : (result.error ?? 'failed')}
              </li>
            ))}
          </ul>
        )}

        {topics.data && topics.data.length > 0 && (
          <ul className="mt-3 space-y-2">
            {topics.data.slice(0, 25).map((row) => {
              let examples: string[] = []
              try {
                const parsed = JSON.parse(row.raw_json) as unknown
                if (Array.isArray(parsed)) examples = parsed.filter((v): v is string => typeof v === 'string')
              } catch {
                examples = []
              }
              return (
                <li key={`${row.topic}:${row.source}`} className="rounded-md bg-[var(--color-surface-2)] p-3 text-[12px]">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{row.topic}</span>
                    <span className="shrink-0 tabular-nums text-[var(--color-text-muted)]">{row.freshness ?? 0} title(s)</span>
                  </div>
                  {examples.length > 0 && (
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-[var(--color-text-secondary)]">
                      {examples.map((example) => (
                        <li key={example} className="truncate">{example}</li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        <ul className="mt-3 space-y-0.5 text-[11px] text-[var(--color-text-muted)]">
          {FEED_NOTES.map((note) => (
            <li key={note}>• {note}</li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Content portfolio balance</h2>
          <button type="button" onClick={videos.reload} className="text-[12px] text-[var(--color-accent)] underline-offset-2 hover:underline">
            ↻ Refresh
          </button>
        </div>
        {portfolio.slices.length === 0 ? (
          <p className="mt-2 text-[13px] text-[var(--color-text-secondary)]">No titled videos stored yet.</p>
        ) : (
          <>
            <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full">
              {portfolio.slices.map((slice) => (
                <div
                  key={slice.category}
                  title={`${slice.category}: ${slice.sharePct}%`}
                  style={{ width: `${slice.sharePct}%` }}
                  className="h-full bg-[var(--color-accent)] opacity-80"
                />
              ))}
            </div>
            <ul className="mt-2 grid grid-cols-1 gap-1 text-[12px] sm:grid-cols-2">
              {portfolio.slices.map((slice) => (
                <li key={slice.category} className="flex items-center justify-between rounded-md bg-[var(--color-surface-2)] px-3 py-1.5">
                  <span>{CATEGORY_LABEL[slice.category] ?? slice.category}</span>
                  <span className="tabular-nums text-[var(--color-text-muted)]">
                    {slice.sharePct}% · {slice.count}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        <ul className="mt-2 space-y-1 text-[11px] text-[var(--color-text-muted)]">
          {portfolio.notes.map((note) => (
            <li key={note}>• {note}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
