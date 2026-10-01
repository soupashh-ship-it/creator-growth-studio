import { useState } from 'react'
import type { JSX } from 'react'
import { IPC } from '../bridge'
import { EmptyState } from '../components/EmptyState'
import { callIpc } from '../useIpc'

interface CategoryComparison {
  category: string
  viewers: number
  channels: number
  viewersPerChannel: number
  observed: boolean
  fitDetail: string
}

interface StreamResearchResult {
  connected: boolean
  detail: string
  categories: CategoryComparison[]
  notes: string[]
}

const input =
  'w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-accent)]'

const fmt = (n: number): string => n.toLocaleString()

/**
 * Twitch Research (spec §40).
 *
 * Public category snapshots via the official Helix API. Each row is an observed
 * sample with its timestamp; the table is the history. Trend claims require
 * repeated snapshots over time — the page says so instead of extrapolating.
 */
export function TwitchResearch(): JSX.Element {
  const [categoriesText, setCategoriesText] = useState('')
  const [result, setResult] = useState<StreamResearchResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [capturedAt, setCapturedAt] = useState<string | null>(null)

  async function snapshot(): Promise<void> {
    const categories = categoriesText
      .split(/[\n,]/)
      .map((c) => c.trim())
      .filter(Boolean)
    if (categories.length === 0) return
    setBusy(true)
    setActionError(null)
    try {
      const data = await callIpc<StreamResearchResult>(IPC.streamCategories, { categories })
      setResult(data)
      setCapturedAt(new Date().toISOString())
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Category lookup failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Twitch Research</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
          Public category data straight from the official Twitch API. Each lookup is a timestamped
          sample of currently-live streams — take repeated snapshots to build a real history.
        </p>
      </header>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="tr-cats">
          Category names (one per line)
        </label>
        <textarea
          id="tr-cats"
          className={`${input} mt-1 min-h-20 resize-y`}
          value={categoriesText}
          onChange={(e) => setCategoriesText(e.target.value)}
          placeholder={'Minecraft\nGrand Theft Auto V\nSoftware & Game Development'}
        />
        <button
          type="button"
          onClick={() => void snapshot()}
          disabled={busy || !categoriesText.trim()}
          className="mt-2 rounded-md bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[#0b0d10] disabled:opacity-40"
        >
          {busy ? 'Reading live data…' : 'Take category snapshot'}
        </button>
        {actionError && <p className="mt-2 text-[12px] text-[var(--color-danger)]">{actionError}</p>}
      </section>

      {result && result.categories.length > 0 && (
        <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Snapshot {capturedAt ? `· ${new Date(capturedAt).toLocaleString()}` : ''}</h2>
            <span className="text-[11px] text-[var(--color-text-muted)]">{result.detail}</span>
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="text-[var(--color-text-muted)]">
                <tr>
                  <th className="py-1 pr-4">Category</th>
                  <th className="py-1 pr-4">Viewers (sample)</th>
                  <th className="py-1 pr-4">Channels (sample)</th>
                  <th className="py-1 pr-4">Viewers/channel</th>
                </tr>
              </thead>
              <tbody>
                {result.categories.map((category) => (
                  <tr key={category.category} className="border-t border-[var(--color-border-subtle)]">
                    <td className="py-1 pr-4">{category.category}</td>
                    <td className="py-1 pr-4 tabular-nums">{category.observed ? fmt(category.viewers) : 'not observed'}</td>
                    <td className="py-1 pr-4 tabular-nums">{category.observed ? fmt(category.channels) : 'not observed'}</td>
                    <td className="py-1 pr-4 tabular-nums">{category.observed ? fmt(Math.round(category.viewersPerChannel)) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-3 space-y-1 text-[11px] text-[var(--color-text-muted)]">
            {result.notes.map((note) => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
        </section>
      )}

      {result && result.categories.length === 0 && (
        <EmptyState
          title="Nothing to compare yet"
          body={result.detail}
        />
      )}
    </div>
  )
}
