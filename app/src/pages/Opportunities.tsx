import type { JSX } from 'react'
import { useIpc } from '../useIpc'
import { EmptyState } from '../components/EmptyState'

interface OpportunityRow {
  term: string
  intent: string | null
  relative_demand: string | null
  competition_estimate: string | null
  opportunity: number | null
  source: string
}

/**
 * Opportunities (spec §25).
 *
 * A ranking of the keyword opportunities you have saved. Demand is relative —
 * the app never fabricates an absolute search volume (§64).
 */
export function Opportunities(): JSX.Element {
  const { data, error, loading, reload } = useIpc<OpportunityRow[]>('research:opportunities')

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Opportunities</h1>
          <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
            Your saved keywords ranked by the local opportunity model: relative demand against estimated
            competition.
          </p>
        </div>
        <button type="button" onClick={reload} className="rounded-md border border-[var(--color-border-subtle)] px-3 py-1.5 text-[12px]">
          ↻ Refresh
        </button>
      </header>

      {loading && <p className="text-[13px] text-[var(--color-text-secondary)]">Loading…</p>}
      {error && <p className="text-[13px] text-[var(--color-danger)]">{error}</p>}

      {data && data.length === 0 && !loading && (
        <EmptyState
          title="No saved keywords yet"
          body="Analyze keywords on the Keywords page; each one gets an opportunity estimate and appears here."
        />
      )}

      {data && data.length > 0 && (
        <section className="overflow-x-auto rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
          <table className="w-full text-left text-[12px]">
            <thead className="text-[var(--color-text-muted)]">
              <tr>
                <th className="py-1 pr-4">Keyword</th>
                <th className="py-1 pr-4">Intent</th>
                <th className="py-1 pr-4 text-right">Opportunity</th>
                <th className="py-1 pr-4">Relative demand</th>
                <th className="py-1 pr-4">Competition</th>
                <th className="py-1 pr-4">Source</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.term} className="border-t border-[var(--color-border-subtle)]">
                  <td className="py-1.5 pr-4">{row.term}</td>
                  <td className="py-1.5 pr-4 text-[var(--color-text-muted)]">{row.intent ?? '—'}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{row.opportunity ?? '—'}</td>
                  <td className="py-1.5 pr-4">{row.relative_demand ?? 'Unknown'}</td>
                  <td className="py-1.5 pr-4">{row.competition_estimate ?? 'Unknown'}</td>
                  <td className="py-1.5 pr-4 text-[var(--color-text-muted)]">{row.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
