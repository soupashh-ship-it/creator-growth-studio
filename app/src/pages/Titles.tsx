import { useMemo, useState } from 'react'
import type { JSX } from 'react'
import { compareTitles } from '@core/scores/title'
import { ScorePanel } from '../components/ScorePanel'

const input =
  'mt-1 w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-accent)]'

/**
 * Title A/B Lab (spec §15). Compares titles on explainable dimensions and
 * reports likely strength/weakness. It deliberately does NOT claim a
 * statistically certain CTR outcome.
 */
export function Titles(): JSX.Element {
  const [titleA, setTitleA] = useState('')
  const [titleB, setTitleB] = useState('')
  const [keyword, setKeyword] = useState('')

  const comparison = useMemo(
    () =>
      compareTitles(
        { title: titleA, primaryKeyword: keyword || null },
        { title: titleB, primaryKeyword: keyword || null },
      ),
    [titleA, titleB, keyword],
  )

  const ready = titleA.trim().length > 0 && titleB.trim().length > 0

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Titles</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
          Score candidate titles and compare two options. Scores are heuristics, not CTR predictions.
        </p>
      </header>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="kw">
          Primary keyword (optional)
        </label>
        <input id="kw" className={input} value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="lightning arrow" />
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="ta">
              Title A
            </label>
            <input id="ta" className={input} value={titleA} onChange={(e) => setTitleA(e.target.value)} placeholder="Best Lightning Arrow Build in PoE 2" />
          </div>
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="tb">
              Title B
            </label>
            <input id="tb" className={input} value={titleB} onChange={(e) => setTitleB(e.target.value)} placeholder="Lightning Arrow Is BROKEN in PoE 2 0.4" />
          </div>
        </div>
      </section>

      {ready ? (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {(['a', 'b'] as const).map((key) => {
            const result = key === 'a' ? comparison.a : comparison.b
            const summary = key === 'a' ? comparison.summary.a : comparison.summary.b
            return (
              <div key={key} className="space-y-3">
                <ScorePanel
                  title={`Title ${key.toUpperCase()}`}
                  result={result}
                  source="Locally derived · deterministic title engine (docs/SCORING.md §6)"
                />
                <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4 text-[12px]">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div><span className="text-[var(--color-text-muted)]">Likely strength:</span> {summary.likelyStrength}</div>
                    <div><span className="text-[var(--color-text-muted)]">Likely weakness:</span> {summary.likelyWeakness}</div>
                    <div><span className="text-[var(--color-text-muted)]">Evergreen potential:</span> {summary.evergreenPotential === null ? 'n/a' : Math.round(summary.evergreenPotential)}</div>
                    <div><span className="text-[var(--color-text-muted)]">News potential:</span> {summary.newsPotential === null ? 'n/a' : Math.round(summary.newsPotential)}</div>
                    <div><span className="text-[var(--color-text-muted)]">Best audience:</span> {summary.bestAudience}</div>
                  </div>
                  <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
                    These are likely characteristics, not a guaranteed CTR difference. Only a real
                    experiment can measure that.
                  </p>
                </section>
              </div>
            )
          })}
        </div>
      ) : (
        <section className="rounded-lg border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-6 text-[13px] text-[var(--color-text-secondary)]">
          Enter two titles to compare them.
        </section>
      )}
    </div>
  )
}
