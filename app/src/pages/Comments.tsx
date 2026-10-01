import { useState } from 'react'
import type { JSX } from 'react'
import { callIpc, useIpc } from '../useIpc'

interface CommentSummary {
  total: number
  byCategory: Record<string, number>
  repeatedRequests: Array<{ phrase: string; count: number; example: string }>
  suggestedVideoTitles: string[]
}

const input =
  'w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-accent)]'

/**
 * Comment Intelligence (spec §49). Classification runs locally, so this works
 * with no AI provider connected. When a channel is connected, comments are
 * ingested automatically; here they can also be pasted or imported.
 */
export function Comments(): JSX.Element {
  const summary = useIpc<CommentSummary>('comments:summarize')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function ingest(): Promise<void> {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) return
    setBusy(true)
    setActionError(null)
    setNotice(null)
    try {
      const count = await callIpc<number>('comments:ingest', { platform: 'youtube', texts: lines })
      setNotice(`Imported ${count} comment(s).`)
      setText('')
      summary.reload()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Comments</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
          Local classification of questions, confusion, bug reports and repeated requests — a
          content-research signal, not a vanity metric.
        </p>
      </header>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="cm">
          Paste comments (one per line)
        </label>
        <textarea
          id="cm"
          className={`${input} mt-1 min-h-24 resize-y`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'can you make a budget version\nthis build link does not work\nthanks, helped a lot'}
        />
        <button
          type="button"
          onClick={() => void ingest()}
          disabled={busy || !text.trim()}
          className="mt-2 rounded-md bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[#0b0d10] disabled:opacity-40"
        >
          {busy ? 'Importing…' : 'Import & analyze'}
        </button>
        {notice && <p className="mt-2 text-[12px] text-[var(--color-positive)]">{notice}</p>}
        {actionError && <p className="mt-2 text-[12px] text-[var(--color-danger)]">{actionError}</p>}
      </section>

      {summary.error && <p className="text-[13px] text-[var(--color-danger)]">{summary.error}</p>}

      {summary.data && (
        <>
          <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
            <h2 className="text-sm font-semibold">Classification · {summary.data.total} comments</h2>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Object.entries(summary.data.byCategory).map(([category, count]) => (
                <div key={category} className="rounded-md bg-[var(--color-surface-2)] p-3">
                  <div className="text-[18px] font-semibold tabular-nums">{count}</div>
                  <div className="text-[11px] text-[var(--color-text-muted)]">{category.replace(/_/g, ' ')}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
            <h2 className="text-sm font-semibold">Repeated requests</h2>
            {summary.data.repeatedRequests.length === 0 ? (
              <p className="mt-2 text-[13px] text-[var(--color-text-secondary)]">No repeated requests detected yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {summary.data.repeatedRequests.map((request) => (
                  <li key={request.phrase} className="rounded-md bg-[var(--color-surface-2)] p-3">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[13px]">“{request.phrase}”</span>
                      <span className="text-[11px] text-[var(--color-text-muted)]">×{request.count}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">e.g. {request.example}</div>
                  </li>
                ))}
              </ul>
            )}

            {summary.data.suggestedVideoTitles.length > 0 && (
              <>
                <h3 className="mt-3 text-[12px] font-medium text-[var(--color-text-secondary)]">Possible next videos</h3>
                <ul className="mt-1 list-disc pl-5 text-[12px] text-[var(--color-text-secondary)]">
                  {summary.data.suggestedVideoTitles.map((title) => (
                    <li key={title}>{title}</li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}
    </div>
  )
}
