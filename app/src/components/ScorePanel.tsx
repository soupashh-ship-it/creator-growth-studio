import { useState } from 'react'
import type { ScoreResult } from '@core/scores/engine'

const confidenceStyles: Record<string, string> = {
  high: 'text-[var(--color-positive)]',
  medium: 'text-[var(--color-warning)]',
  low: 'text-[var(--color-danger)]',
}

function ComponentBar({ label, value, weight, detail }: { label: string; value: number | null; weight: number; detail: string }) {
  return (
    <div className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium">{label}</span>
        <span className="text-[13px] tabular-nums text-[var(--color-text-secondary)]">
          {value === null ? 'Not available' : `${Math.round(value)}/100`}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-0)]">
        <div
          className="h-full rounded-full bg-[var(--color-accent)]"
          style={{ width: `${value === null ? 0 : Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
      <div className="mt-1.5 text-[11px] text-[var(--color-text-muted)]">
        weight {Math.round(weight * 100)}% · {detail}
      </div>
    </div>
  )
}

/**
 * Renders any ScoreResult with its calculation exposed ("Why this score?" —
 * spec §11). Never presents the number without its inputs and provenance.
 */
export function ScorePanel({ title, result, source }: { title: string; result: ScoreResult; source: string }) {
  const [open, setOpen] = useState(false)
  const totalWeight = result.components.reduce((s, c) => s + c.weight, 0)

  return (
    <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
            {source} · app-defined score, not an official platform metric
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-semibold tabular-nums">
            {result.score === null ? '—' : result.score}
          </div>
          <div className={`text-[11px] ${confidenceStyles[result.confidence] ?? ''}`}>
            {result.score === null ? 'not available' : `${result.confidence} confidence`}
          </div>
        </div>
      </header>

      {result.score === null ? (
        <p className="mt-3 text-[13px] text-[var(--color-text-secondary)]">
          Not enough data to compute this score. Missing inputs are never treated as zero.
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {result.components.map((component) => (
              <ComponentBar
                key={component.key}
                label={component.label}
                value={component.value}
                weight={component.weight / totalWeight}
                detail={component.detail}
              />
            ))}
          </div>

          {result.missing.length > 0 && (
            <p className="mt-3 text-[11px] text-[var(--color-text-muted)]">
              Excluded (no data): {result.missing.join(', ')} · input coverage {Math.round(result.coverage * 100)}%
            </p>
          )}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-3 text-[12px] text-[var(--color-accent)] underline-offset-2 hover:underline"
            aria-expanded={open}
          >
            {open ? 'Hide calculation' : 'Why this score?'}
          </button>

          {open && (
            <ul className="mt-2 space-y-1 text-[12px] text-[var(--color-text-secondary)]">
              {result.explanation.map((line) => (
                <li key={line}>• {line}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
