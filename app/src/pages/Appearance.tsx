import { useState } from 'react'
import type { JSX } from 'react'
import { callIpc } from '../useIpc'

type Theme = 'dark' | 'light'

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('light', theme === 'light')
}

/**
 * Appearance (spec §71).
 *
 * Only a light/dark theme for now; both use the same token names, so nothing
 * else has to change. The preference is stored in the local database.
 */
export function Appearance(): JSX.Element {
  const [theme, setTheme] = useState<Theme>(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('light') ? 'light' : 'dark',
  )
  const [notice, setNotice] = useState<string | null>(null)

  async function choose(next: Theme): Promise<void> {
    setTheme(next)
    applyTheme(next)
    try {
      await callIpc('settings:set', { key: 'theme', value: next })
      setNotice(`Theme set to ${next}.`)
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Theme applied but could not be saved.')
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Appearance</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
          Dark is the default. Both themes use the same design tokens, so every page adapts.
        </p>
      </header>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Theme</span>
        <div className="mt-2 flex gap-3" role="group" aria-label="Theme">
          {(['dark', 'light'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => void choose(option)}
              aria-pressed={theme === option}
              className={
                'rounded-md px-4 py-2 text-[13px] ' +
                (theme === option
                  ? 'bg-[var(--color-accent)] font-medium text-[#0b0d10]'
                  : 'border border-[var(--color-border-subtle)]')
              }
            >
              {option}
            </button>
          ))}
        </div>
        {notice && <p className="mt-2 text-[12px] text-[var(--color-text-secondary)]">{notice}</p>}
      </section>

    </div>
  )
}
