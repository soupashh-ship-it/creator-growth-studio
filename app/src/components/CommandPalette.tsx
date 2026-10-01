import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX, KeyboardEvent as ReactKeyboardEvent } from 'react'

export interface Command {
  id: string
  label: string
  /** Grouping shown as a muted suffix, e.g. "Go to" or "Action". */
  group: string
  run: () => void
}

/**
 * Command palette (spec §80, keyboard-first UI). Opened with Ctrl+K / Cmd+K.
 * Fully keyboard-driven: type to filter, arrows to move, Enter to run, Esc to
 * close. It only runs commands the user explicitly picks.
 */
export function CommandPalette({
  open,
  commands,
  onClose,
}: {
  open: boolean
  commands: Command[]
  onClose: () => void
}): JSX.Element | null {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter((command) => command.label.toLowerCase().includes(q))
  }, [commands, query])

  // The component is mounted only while open (see App), so its state starts
  // fresh every time. This effect only moves focus — no state is set here.
  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [])

  if (!open) return null

  function onKeyDown(event: ReactKeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((prev) => (filtered.length === 0 ? 0 : (prev + 1) % filtered.length))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((prev) => (filtered.length === 0 ? 0 : (prev - 1 + filtered.length) % filtered.length))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const command = filtered[active]
      if (command) {
        command.run()
        onClose()
      }
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-6 pt-24"
      onMouseDown={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
          placeholder="Search pages and actions…"
          className="w-full border-b border-[var(--color-border-subtle)] bg-transparent px-4 py-3 text-[14px] outline-none"
          aria-label="Command search"
        />
        <ul className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <li className="px-4 py-3 text-[12px] text-[var(--color-text-muted)]">No matching commands.</li>
          )}
          {filtered.map((command, index) => (
            <li key={command.id}>
              <button
                type="button"
                onMouseEnter={() => setActive(index)}
                onClick={() => {
                  command.run()
                  onClose()
                }}
                className={
                  'flex w-full items-center justify-between px-4 py-2 text-left text-[13px] ' +
                  (index === active ? 'bg-[var(--color-surface-2)]' : '')
                }
              >
                <span>{command.label}</span>
                <span className="text-[11px] text-[var(--color-text-muted)]">{command.group}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
