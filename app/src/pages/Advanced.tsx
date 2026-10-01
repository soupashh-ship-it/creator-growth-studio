import { useState } from 'react'
import type { JSX } from 'react'
import { IPC } from '../bridge'
import { callIpc, useIpc } from '../useIpc'

interface DependencyStatus {
  id: string
  label: string
  required: boolean
  present: boolean
  version: string | null
  detail: string
  hint?: string
}

interface SchedulerTask {
  name: string
  intervalMs: number
  lastRunAt: string | null
  lastError: string | null
  running: boolean
}

/**
 * Advanced / diagnostics (spec §112).
 *
 * Reports what is really installed and what background work is scheduled. No
 * tool is downloaded or installed from here.
 */
const NOTIFICATION_TYPES: Array<{ type: string; label: string }> = [
  { type: 'sync', label: 'Channel refresh results' },
  { type: 'update', label: 'New app version available' },
]

export function Advanced(): JSX.Element {
  const dependencies = useIpc<DependencyStatus[]>(IPC.dependenciesList)
  const scheduler = useIpc<SchedulerTask[]>(IPC.schedulerStatus)
  const savedMinutes = useIpc<number | null>(IPC.settingsGet, { key: 'scheduler.refreshMinutes' })
  const savedDisabled = useIpc<string[]>(IPC.settingsGet, { key: 'notifications.disabledTypes' })
  const [editedMinutes, setEditedMinutes] = useState<number | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const disabledTypes = Array.isArray(savedDisabled.data) ? savedDisabled.data : []

  // The select shows the local edit when one happened, otherwise the stored
  // value (defaulting to 30 min). Derived — no setState-in-effect cascade.
  const refreshMinutes = editedMinutes ?? (savedMinutes.data === null || savedMinutes.data === undefined ? 30 : Number(savedMinutes.data))

  function toggleNotificationType(type: string, enabled: boolean): void {
    const next = enabled
      ? disabledTypes.filter((t) => t !== type)
      : [...disabledTypes, type]
    void callIpc(IPC.settingsSet, { key: 'notifications.disabledTypes', value: next })
      .then(() => savedDisabled.reload())
      .catch(() => undefined)
  }

  async function runTask(name: string): Promise<void> {
    setBusy(name)
    setNotice(null)
    try {
      const result = await callIpc<{ ok: boolean; error?: string }>(IPC.schedulerRun, { name })
      setNotice(result.ok ? `Ran "${name}".` : `"${name}" failed: ${result.error}`)
      scheduler.reload()
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Could not run the task.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Advanced</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
          Diagnostics for optional tools and the local background scheduler. The app never installs
          anything on your behalf.
        </p>
      </header>

      {notice && <p className="text-[12px] text-[var(--color-text-secondary)]">{notice}</p>}

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Dependencies</h2>
          <button
            type="button"
            onClick={dependencies.reload}
            className="text-[12px] text-[var(--color-accent)] underline-offset-2 hover:underline"
          >
            ↻ Re-check
          </button>
        </div>
        {dependencies.loading && <p className="mt-2 text-[13px] text-[var(--color-text-secondary)]">Checking…</p>}
        {dependencies.error && <p className="mt-2 text-[13px] text-[var(--color-danger)]">{dependencies.error}</p>}
        <ul className="mt-3 space-y-2">
          {(dependencies.data ?? []).map((dependency) => (
            <li
              key={dependency.id}
              className="flex items-start justify-between rounded-md bg-[var(--color-surface-2)] p-3"
            >
              <div>
                <div className="text-[13px] font-medium">{dependency.label}</div>
                <div className="text-[11px] text-[var(--color-text-muted)]">{dependency.detail}</div>
                {dependency.hint && (
                  <code className="mt-1 block text-[11px] text-[var(--color-text-secondary)]">{dependency.hint}</code>
                )}
              </div>
              <span
                className="shrink-0 text-[11px]"
                style={{ color: dependency.present ? 'var(--color-positive)' : 'var(--color-text-muted)' }}
              >
                {dependency.present ? dependency.version ?? 'present' : dependency.required ? 'missing' : 'not installed'}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <h2 className="text-sm font-semibold">Notifications</h2>
        <p className="mt-0.5 text-[12px] text-[var(--color-text-secondary)]">
          Disabled types are neither recorded in the bell nor shown as toasts (§120).
        </p>
        <ul className="mt-3 space-y-2">
          {NOTIFICATION_TYPES.map(({ type, label }) => (
            <li key={type} className="flex items-center justify-between rounded-md bg-[var(--color-surface-2)] p-3 text-[12px]">
              <span>{label}</span>
              <label className="flex cursor-pointer items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
                <input
                  type="checkbox"
                  checked={!disabledTypes.includes(type)}
                  onChange={(e) => toggleNotificationType(type, e.target.checked)}
                />
                enabled
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Background tasks</h2>
          <div className="flex items-center gap-2">
            <label htmlFor="refresh-interval" className="text-[11px] text-[var(--color-text-muted)]">
              Background refresh
            </label>
            <select
              id="refresh-interval"
              value={String(refreshMinutes)}
              onChange={(e) => {
                const minutes = Number(e.target.value)
                setEditedMinutes(minutes)
                void callIpc(IPC.settingsSetRefreshInterval, { ms: minutes }).then(() => scheduler.reload())
              }}
              className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-2 py-1 text-[12px]"
            >
              <option value="0">Manual only</option>
              <option value="60">Every hour</option>
              <option value="360">Every 6 hours</option>
              <option value="720">Every 12 hours</option>
              <option value="1440">Daily</option>
            </select>
            <button
              type="button"
              onClick={scheduler.reload}
              className="text-[12px] text-[var(--color-accent)] underline-offset-2 hover:underline"
            >
              ↻ Refresh
            </button>
          </div>
        </div>
        <ul className="mt-3 space-y-2">
          {(scheduler.data ?? []).map((task) => (
            <li key={task.name} className="flex items-center justify-between rounded-md bg-[var(--color-surface-2)] p-3">
              <div>
                <div className="text-[13px] font-medium">{task.name}</div>
                <div className="text-[11px] text-[var(--color-text-muted)]">
                  every {Math.round(task.intervalMs / 60_000)} min ·{' '}
                  {task.lastRunAt ? `last ran ${new Date(task.lastRunAt).toLocaleString()}` : 'not run yet'}
                  {task.lastError ? ` · error: ${task.lastError}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void runTask(task.name)}
                disabled={busy !== null}
                className="rounded-md border border-[var(--color-border-subtle)] px-3 py-1.5 text-[12px] disabled:opacity-40"
              >
                {busy === task.name ? 'Running…' : 'Run now'}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
