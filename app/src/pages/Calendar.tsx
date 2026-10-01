import { useState } from 'react'
import type { JSX } from 'react'
import { IPC } from '../bridge'
import { callIpc, useIpc } from '../useIpc'

interface CalendarItem {
  id: string
  kind: string
  title: string | null
  scheduled_at: string | null
  status: string
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

function dateKey(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const KINDS = ['youtube-video', 'short', 'stream', 'community-post', 'clip', 'research-task']

const input =
  'w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-accent)]'

/** Content calendar (spec §50). Agenda view; month/week views come with drag-drop. */
export function Calendar(): JSX.Element {
  const { data, error, loading, reload } = useIpc<CalendarItem[]>(IPC.calendarList)
  const [kind, setKind] = useState('youtube-video')
  const [title, setTitle] = useState('')
  const [when, setWhen] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [view, setView] = useState<'agenda' | 'month'>('agenda')
  const [monthOffset, setMonthOffset] = useState(0)
  const [dragId, setDragId] = useState<string | null>(null)

  async function reschedule(id: string, dayDate: Date): Promise<void> {
    const item = (data ?? []).find((entry) => entry.id === id)
    if (!item) return
    // Keep the original time of day; move only the date.
    const original = item.scheduled_at ? new Date(item.scheduled_at) : null
    const hours = original && !Number.isNaN(original.getTime()) ? original.getHours() : 9
    const minutes = original && !Number.isNaN(original.getTime()) ? original.getMinutes() : 0
    const next = new Date(dayDate)
    next.setHours(hours, minutes, 0, 0)
    try {
      await callIpc(IPC.calendarReschedule, { id, scheduledAt: next.toISOString() })
      reload()
    } catch {
      // A failed drag leaves the item where it was.
    }
  }

  async function create(): Promise<void> {
    if (!title.trim()) return
    setActionError(null)
    try {
      await callIpc('calendar:create', {
        kind,
        title: title.trim(),
        scheduledAt: when ? new Date(when).toISOString() : null,
      })
      setTitle('')
      setWhen('')
      reload()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not schedule item')
    }
  }

  const grouped = new Map<string, CalendarItem[]>()
  for (const item of data ?? []) {
    const key = item.scheduled_at ? item.scheduled_at.slice(0, 10) : 'unscheduled'
    grouped.set(key, [...(grouped.get(key) ?? []), item])
  }

  // Month grid for the current monthOffset (0 = this month).
  const today = new Date()
  const gridStart = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1)
  const startWeekday = (gridStart.getDay() + 6) % 7 // Mon = 0
  const gridDays: Date[] = []
  for (let i = 0; i < 42; i += 1) {
    gridDays.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), 1 - startWeekday + i))
  }
  const byDay = new Map<string, CalendarItem[]>()
  for (const item of data ?? []) {
    if (!item.scheduled_at) continue
    const date = new Date(item.scheduled_at)
    if (Number.isNaN(date.getTime())) continue
    const key = dateKey(date)
    byDay.set(key, [...(byDay.get(key) ?? []), item])
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Calendar</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
          Plan videos, shorts, streams, community posts and research away from the upload button.
        </p>
      </header>

      <div className="flex items-center gap-2">
        {(['agenda', 'month'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setView(mode)}
            className={
              'rounded-md px-3 py-1.5 text-[12px] capitalize ' +
              (view === mode
                ? 'bg-[var(--color-surface-2)] font-medium'
                : 'border border-[var(--color-border-subtle)] text-[var(--color-text-secondary)]')
            }
          >
            {mode} view
          </button>
        ))}
      </div>

      {view === 'month' && (
        <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              {gridStart.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
            </h2>
            <div className="flex gap-2">
              <button type="button" onClick={() => setMonthOffset((m) => m - 1)} className="rounded-md border border-[var(--color-border-subtle)] px-2.5 py-1 text-[12px]">
                ←
              </button>
              <button type="button" onClick={() => setMonthOffset(0)} className="rounded-md border border-[var(--color-border-subtle)] px-2.5 py-1 text-[12px]">
                Today
              </button>
              <button type="button" onClick={() => setMonthOffset((m) => m + 1)} className="rounded-md border border-[var(--color-border-subtle)] px-2.5 py-1 text-[12px]">
                →
              </button>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1 text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
            {WEEKDAYS.map((day) => (
              <div key={day} className="px-1">{day}</div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {gridDays.map((day) => {
              const key = dateKey(day)
              const inMonth = day.getMonth() === gridStart.getMonth()
              const isToday = dateKey(today) === key
              const dayItems = byDay.get(key) ?? []
              return (
                <div
                  key={key}
                  onDragOver={(e) => {
                    if (dragId) e.preventDefault()
                  }}
                  onDrop={() => {
                    if (dragId) void reschedule(dragId, day)
                    setDragId(null)
                  }}
                  className={
                    'min-h-20 rounded-md border p-1 text-[11px] ' +
                    (inMonth ? 'border-[var(--color-border-subtle)]' : 'border-transparent opacity-40') +
                    (isToday ? ' ring-1 ring-[var(--color-accent)]' : '')
                  }
                >
                  <div className="px-0.5 text-[10px] text-[var(--color-text-muted)]">{day.getDate()}</div>
                  {dayItems.slice(0, 3).map((item) => (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={() => setDragId(item.id)}
                      onDragEnd={() => setDragId(null)}
                      title={`${item.kind}: ${item.title ?? ''} — drag to reschedule`}
                      className="mt-0.5 cursor-grab truncate rounded bg-[var(--color-surface-2)] px-1 py-0.5"
                    >
                      {item.title ?? item.kind}
                    </div>
                  ))}
                  {dayItems.length > 3 && <div className="px-0.5 text-[10px] text-[var(--color-text-muted)]">+{dayItems.length - 3} more</div>}
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
            Drag a card to another day to reschedule (the time of day is kept). The calendar is local —
            nothing is published automatically.
          </p>
        </section>
      )}

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[10rem_1fr_12rem_auto]">
          <select className={input} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Item kind">
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Item title" />
          <input className={input} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Scheduled at" />
          <button
            type="button"
            onClick={() => void create()}
            className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[#0b0d10]"
          >
            Add
          </button>
        </div>
        {actionError && <p className="mt-2 text-[12px] text-[var(--color-danger)]">{actionError}</p>}
      </section>

      {loading && <p className="text-[13px] text-[var(--color-text-secondary)]">Loading calendar…</p>}
      {error && <p className="text-[13px] text-[var(--color-danger)]">{error}</p>}

      {data && data.length === 0 && !loading && (
        <section className="rounded-lg border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-6 text-[13px] text-[var(--color-text-secondary)]">
          Nothing scheduled yet.
        </section>
      )}

      {[...grouped.entries()].map(([date, items]) => (
        <section key={date} className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
          <h2 className="text-[12px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
            {date === 'unscheduled' ? 'Unscheduled' : new Date(`${date}T00:00:00`).toDateString()}
          </h2>
          <ul className="mt-2 space-y-2">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between rounded-md bg-[var(--color-surface-2)] px-3 py-2">
                <span className="text-[13px]">{item.title}</span>
                <span className="text-[11px] text-[var(--color-text-muted)]">
                  {item.kind} · {item.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
