import type { JSX } from 'react'

/**
 * Honest empty state. Used wherever a feature has no stored data yet, so the UI
 * explains what is missing instead of showing placeholder numbers (spec §66, §93).
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: JSX.Element
}): JSX.Element {
  return (
    <section className="rounded-lg border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-6">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">{body}</p>
      {action && <div className="mt-3">{action}</div>}
    </section>
  )
}
