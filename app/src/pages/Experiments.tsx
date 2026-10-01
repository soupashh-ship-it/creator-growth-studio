import { useState } from 'react'
import type { JSX } from 'react'
import { callIpc, useIpc } from '../useIpc'
import { EmptyState } from '../components/EmptyState'

interface ExperimentRow {
  id: string
  kind: string
  video_id: string | null
  changed_at: string | null
  before_json: string
  after_json: string
  created_at: string
}

const KINDS = ['title', 'thumbnail', 'description', 'intro', 'posting-time', 'tags']

const input =
  'w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-accent)]'

function readPair(json: string): { subject: string; value: string } {
  try {
    const parsed = JSON.parse(json) as { subject?: string; value?: string }
    return { subject: parsed.subject ?? '', value: parsed.value ?? '' }
  } catch {
    return { subject: '', value: '' }
  }
}

/**
 * Experiments (spec §46).
 *
 * A local log of packaging changes and their observed result. It records what
 * you changed and what happened — it does not claim statistical significance or
 * assign a winner.
 */
export function Experiments(): JSX.Element {
  const { data, error, loading, reload } = useIpc<ExperimentRow[]>('experiments:list')
  const [kind, setKind] = useState('title')
  const [subject, setSubject] = useState('')
  const [before, setBefore] = useState('')
  const [after, setAfter] = useState('')
  const [when, setWhen] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function create(): Promise<void> {
    if (!subject.trim()) return
    setBusy(true)
    setActionError(null)
    try {
      await callIpc('experiments:create', {
        kind,
        subject: subject.trim(),
        changedAt: when ? new Date(when).toISOString() : null,
        before,
        after,
      })
      setSubject('')
      setBefore('')
      setAfter('')
      setWhen('')
      reload()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not save the experiment.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await callIpc('experiments:delete', { id })
      reload()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not delete the experiment.')
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Experiments</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
          Log what you changed and what happened. The app does not declare winners from small samples.
        </p>
      </header>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <select className={input} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Change kind">
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <input className={input} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Video / subject" aria-label="Subject" />
          <input className={input} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Changed at" />
          <button
            type="button"
            onClick={() => void create()}
            disabled={busy || !subject.trim()}
            className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[#0b0d10] disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Log change'}
          </button>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input className={input} value={before} onChange={(e) => setBefore(e.target.value)} placeholder="Before (e.g. old title)" aria-label="Before" />
          <input className={input} value={after} onChange={(e) => setAfter(e.target.value)} placeholder="After (e.g. new title)" aria-label="After" />
        </div>
        {actionError && <p className="mt-2 text-[12px] text-[var(--color-danger)]">{actionError}</p>}
      </section>

      {loading && <p className="text-[13px] text-[var(--color-text-secondary)]">Loading experiments…</p>}
      {error && <p className="text-[13px] text-[var(--color-danger)]">{error}</p>}

      {data && data.length === 0 && !loading && (
        <EmptyState title="No experiments logged" body="Record a title, thumbnail or intro change above to start tracking what you tried." />
      )}

      {data && data.length > 0 && (
        <ul className="space-y-2">
          {data.map((experiment) => {
            const beforePair = readPair(experiment.before_json)
            const afterPair = readPair(experiment.after_json)
            return (
              <li key={experiment.id} className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[13px] font-medium">
                      {beforePair.subject || afterPair.subject || '(no subject)'} · <span className="text-[var(--color-text-muted)]">{experiment.kind}</span>
                    </div>
                    <div className="mt-1 text-[12px] text-[var(--color-text-secondary)]">
                      {beforePair.value ? `${beforePair.value} → ${afterPair.value}` : afterPair.value || 'No values recorded.'}
                    </div>
                    <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                      {experiment.changed_at ? `changed ${new Date(experiment.changed_at).toLocaleString()}` : `logged ${new Date(experiment.created_at).toLocaleString()}`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void remove(experiment.id)}
                    className="shrink-0 text-[12px] text-[var(--color-text-muted)] underline-offset-2 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
