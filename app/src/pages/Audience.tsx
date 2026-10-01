import type { JSX } from 'react'
import { IPC } from '../bridge'
import { useIpc } from '../useIpc'
import { EmptyState } from '../components/EmptyState'

interface CommentSummary {
  total: number
  byCategory: Record<string, number>
  repeatedRequests: Array<{ phrase: string; count: number; example: string }>
  suggestedVideoTitles: string[]
}

/**
 * Audience (spec §34, §49).
 *
 * Comment classification is computed locally from comments the app has stored,
 * which is a genuine audience signal. Demographics come from the platform
 * analytics API and are shown as "Not available" until connected (§66).
 */
export function Audience(): JSX.Element {
  const summary = useIpc<CommentSummary>('comments:summarize')
  const analytics = useIpc<{ demographics: Array<{ dimension: string; bucket: string; viewer_percentage: number | null }>; hasData: boolean }>(
    IPC.analyticsSnapshot,
  )
  const demographics = analytics.data?.demographics ?? []
  const ageBuckets = demographics.filter((bucket) => bucket.dimension === 'ageGroup')
  const genderBuckets = demographics.filter((bucket) => bucket.dimension === 'gender')

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Audience</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
          What your audience actually asks about, derived locally from comments.
        </p>
      </header>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <h2 className="text-sm font-semibold">Comment signals</h2>
        {summary.error && <p className="mt-2 text-[13px] text-[var(--color-danger)]">{summary.error}</p>}
        {summary.data && summary.data.total === 0 && (
          <p className="mt-2 text-[13px] text-[var(--color-text-secondary)]">
            No comments stored yet. Import them from the Comments page or sync a connected channel.
          </p>
        )}
        {summary.data && summary.data.total > 0 && (
          <>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Object.entries(summary.data.byCategory).map(([category, count]) => (
                <div key={category} className="rounded-md bg-[var(--color-surface-2)] p-3">
                  <div className="text-[16px] font-semibold tabular-nums">{count}</div>
                  <div className="text-[11px] text-[var(--color-text-muted)]">{category.replace(/_/g, ' ')}</div>
                </div>
              ))}
            </div>
            {summary.data.repeatedRequests.length > 0 && (
              <>
                <h3 className="mt-3 text-[12px] font-medium text-[var(--color-text-secondary)]">Most requested</h3>
                <ul className="mt-1 space-y-1 text-[12px] text-[var(--color-text-secondary)]">
                  {summary.data.repeatedRequests.slice(0, 5).map((request) => (
                    <li key={request.phrase}>
                      “{request.phrase}” ×{request.count}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </section>

      {demographics.length > 0 ? (
        <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
          <h2 className="text-sm font-semibold">Audience demographics (official Analytics API)</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Age</h3>
              <ul className="mt-1 space-y-2">
                {ageBuckets.map((bucket) => (
                  <li key={bucket.bucket}>
                    <div className="flex items-center justify-between text-[12px]">
                      <span>{bucket.bucket}</span>
                      <span className="tabular-nums text-[var(--color-text-muted)]">
                        {bucket.viewer_percentage === null ? '—' : `${bucket.viewer_percentage.toFixed(1)}%`}
                      </span>
                    </div>
                    <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                      <div
                        className="h-full bg-[var(--color-accent)]"
                        style={{ width: `${Math.min(100, Math.max(0, bucket.viewer_percentage ?? 0))}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Gender</h3>
              <ul className="mt-1 space-y-2">
                {genderBuckets.map((bucket) => (
                  <li key={bucket.bucket}>
                    <div className="flex items-center justify-between text-[12px]">
                      <span>{bucket.bucket}</span>
                      <span className="tabular-nums text-[var(--color-text-muted)]">
                        {bucket.viewer_percentage === null ? '—' : `${bucket.viewer_percentage.toFixed(1)}%`}
                      </span>
                    </div>
                    <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                      <div
                        className="h-full bg-[var(--color-accent)]"
                        style={{ width: `${Math.min(100, Math.max(0, bucket.viewer_percentage ?? 0))}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-[var(--color-text-muted)]">
            Values are the share of views per bucket from the official YouTube Analytics API. Geography
            and device breakdowns are not stored yet.
          </p>
        </section>
      ) : (
        <EmptyState
          title="Demographics: Not available"
          body="Age/gender data comes from the YouTube Analytics API. Connect a channel and run “Sync YouTube Analytics” on the Retention page — the app never fills these in from assumptions."
        />
      )}
    </div>
  )
}
