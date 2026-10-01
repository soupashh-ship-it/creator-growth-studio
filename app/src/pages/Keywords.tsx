import { useState } from 'react'
import type { JSX } from 'react'
import { IPC } from '../bridge'
import { callIpc, useIpc } from '../useIpc'

interface HistoryRow {
  id: string
  query: string
  scope: string | null
  createdAt: string
}

interface KeywordInsight {
  term: string
  intent: string
  intentConfidence: string
  opportunity: number | null
  confidence: string
  relativeDemand: string
  competitionEstimate: string
  source: string
}

interface SavedKeyword {
  term: string
  intent: string | null
  relative_demand: string | null
  competition_estimate: string | null
  opportunity: number | null
  source: string
}

const input =
  'w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-accent)]'

/**
 * Keyword Explorer (spec §20–21, §64).
 *
 * Demand and competition are *indices* the user supplies from a legitimate
 * source; the app never invents search volume.
 */
export function Keywords(): JSX.Element {
  const saved = useIpc<SavedKeyword[]>(IPC.keywordsList)
  const history = useIpc<HistoryRow[]>(IPC.historyList)
  const [termsText, setTermsText] = useState('')
  const [demand, setDemand] = useState('')
  const [competition, setCompetition] = useState('')
  const [insights, setInsights] = useState<KeywordInsight[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function analyze(): Promise<void> {
    const terms = termsText
      .split(/[\n,]/)
      .map((t) => t.trim())
      .filter(Boolean)
    if (terms.length === 0) return

    setBusy(true)
    setActionError(null)
    try {
      const result = await callIpc<KeywordInsight[]>(IPC.keywordsAnalyze, {
        terms,
        demandIndex: demand === '' ? null : Number(demand),
        competitionIndex: competition === '' ? null : Number(competition),
      })
      setInsights(result)
      await callIpc(IPC.historyRecord, { query: terms.join(', '), scope: 'keyword' }).catch(() => undefined)
      saved.reload()
      history.reload()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Analysis failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Keywords</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
          Relative demand and estimated competition only. Exact search volume is never shown unless a
          real source provides it.
        </p>
      </header>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="kw-terms">
          Keywords (one per line)
        </label>
        <textarea
          id="kw-terms"
          className={`${input} mt-1 min-h-24 resize-y`}
          value={termsText}
          onChange={(e) => setTermsText(e.target.value)}
          placeholder={'poe 2 deadeye build\npoe 2 lightning arrow\npoe 2 league starter'}
        />

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="kw-demand">
              Demand index (0–100, optional)
            </label>
            <input id="kw-demand" className={input} value={demand} onChange={(e) => setDemand(e.target.value)} placeholder="e.g. 78" />
          </div>
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="kw-comp">
              Competition index (0–100, optional)
            </label>
            <input id="kw-comp" className={input} value={competition} onChange={(e) => setCompetition(e.target.value)} placeholder="e.g. 40" />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void analyze()}
              disabled={busy || !termsText.trim()}
              className="w-full rounded-md bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[#0b0d10] disabled:opacity-40"
            >
              {busy ? 'Analyzing…' : 'Analyze & save'}
            </button>
          </div>
        </div>
        {actionError && <p className="mt-2 text-[12px] text-[var(--color-danger)]">{actionError}</p>}
      </section>

      {insights && (
        <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
          <h2 className="text-sm font-semibold">This analysis</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="text-[var(--color-text-muted)]">
                <tr>
                  <th className="py-1 pr-4">Keyword</th>
                  <th className="py-1 pr-4">Intent</th>
                  <th className="py-1 pr-4">Opportunity</th>
                  <th className="py-1 pr-4">Relative demand</th>
                  <th className="py-1 pr-4">Competition</th>
                </tr>
              </thead>
              <tbody>
                {insights.map((insight) => (
                  <tr key={insight.term} className="border-t border-[var(--color-border-subtle)]">
                    <td className="py-1 pr-4">{insight.term}</td>
                    <td className="py-1 pr-4">{insight.intent}</td>
                    <td className="py-1 pr-4 tabular-nums">{insight.opportunity ?? '—'}</td>
                    <td className="py-1 pr-4">{insight.relativeDemand}</td>
                    <td className="py-1 pr-4">{insight.competitionEstimate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Saved keywords</h2>
          <button type="button" onClick={saved.reload} className="text-[12px] text-[var(--color-accent)] underline-offset-2 hover:underline">
            ↻ Refresh
          </button>
        </div>
        {saved.loading && <p className="mt-2 text-[13px] text-[var(--color-text-secondary)]">Loading…</p>}
        {saved.error && <p className="mt-2 text-[13px] text-[var(--color-danger)]">{saved.error}</p>}
        {saved.data && saved.data.length === 0 && (
          <p className="mt-2 text-[13px] text-[var(--color-text-secondary)]">No keywords saved yet.</p>
        )}
        {saved.data && saved.data.length > 0 && (
          <ul className="mt-2 divide-y divide-[var(--color-border-subtle)]">
            {saved.data.map((keyword) => (
              <li key={keyword.term} className="flex items-center justify-between py-1.5 text-[12px]">
                <span>{keyword.term}</span>
                <span className="text-[var(--color-text-muted)]">
                  {keyword.opportunity ?? '—'} · {keyword.relative_demand ?? 'unknown'} demand · {keyword.source}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Search history</h2>
          <div className="flex gap-3">
            <button type="button" onClick={history.reload} className="text-[12px] text-[var(--color-accent)] underline-offset-2 hover:underline">
              ↻ Refresh
            </button>
            <button
              type="button"
              onClick={() => {
                void callIpc(IPC.historyClear).then(() => history.reload())
              }}
              className="text-[12px] text-[var(--color-text-muted)] underline-offset-2 hover:underline"
            >
              Clear history
            </button>
          </div>
        </div>
        {history.data && history.data.length === 0 && (
          <p className="mt-2 text-[13px] text-[var(--color-text-secondary)]">No searches recorded yet.</p>
        )}
        {history.data && history.data.length > 0 && (
          <ul className="mt-2 divide-y divide-[var(--color-border-subtle)]">
            {history.data.slice(0, 10).map((row) => (
              <li key={row.id} className="flex items-center justify-between py-1.5 text-[12px]">
                <button
                  type="button"
                  onClick={() => setTermsText(row.query)}
                  className="text-left hover:text-[var(--color-accent)]"
                >
                  {row.query}
                </button>
                <span className="text-[11px] text-[var(--color-text-muted)]">{new Date(row.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
