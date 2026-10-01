import { useState } from 'react'
import type { JSX } from 'react'
import { callIpc, useIpc } from '../useIpc'
import { EmptyState } from '../components/EmptyState'

interface TopicCount {
  topic: string
  count: number
}

interface ContentGap {
  topic: string
  competitorCount: number
  userCount: number
  gapScore: number
  reason: string
}

interface GapReport {
  userTopics: TopicCount[]
  gaps: ContentGap[]
  note: string
}

const input =
  'w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-accent)]'

/** Parses "topic" or "topic,count" lines from public research the user pasted. */
export function parseTopics(text: string): TopicCount[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [topic, count] = line.split(',')
      return { topic: (topic ?? '').trim(), count: Number(count ?? 1) || 1 }
    })
    .filter((t) => t.topic.length > 0)
}

/**
 * Content Gaps (spec §26–27).
 *
 * Your topics come from your own videos; competitor topics are public data you
 * enter. Nothing is scraped, and a gap is a comparison of coverage — not a
 * guarantee that the topic will perform.
 */
export function ContentGaps(): JSX.Element {
  const [competitorText, setCompetitorText] = useState('')
  const [report, setReport] = useState<GapReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const momentum = useIpc<TopicCount[]>('research:momentum')

  async function analyze(): Promise<void> {
    const competitorTopics = parseTopics(competitorText)
    if (competitorTopics.length === 0) return
    setBusy(true)
    setActionError(null)
    try {
      setReport(await callIpc<GapReport>('research:gaps', { competitorTopics }))
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not compare topics.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Content Gaps</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
          Topics competitors cover that your channel under-serves, based on public data you provide and
          your own upload history.
        </p>
      </header>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="gaps-input">
          Competitor topics (one per line, optional ",count" from public research)
        </label>
        <textarea
          id="gaps-input"
          className={`${input} mt-1 min-h-24 resize-y`}
          value={competitorText}
          onChange={(e) => setCompetitorText(e.target.value)}
          placeholder={'bosses,5\ndeadeye,3\nleague starter,4'}
        />
        <button
          type="button"
          onClick={() => void analyze()}
          disabled={busy || !competitorText.trim()}
          className="mt-2 rounded-md bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[#0b0d10] disabled:opacity-40"
        >
          {busy ? 'Comparing…' : 'Find gaps'}
        </button>
        {actionError && <p className="mt-2 text-[12px] text-[var(--color-danger)]">{actionError}</p>}
        {momentum.error && <p className="mt-2 text-[12px] text-[var(--color-text-muted)]">Your topics are read from your synced videos.</p>}
      </section>

      {report && (
        <>
          {report.gaps.length === 0 ? (
            <EmptyState title="No gaps found" body="No competitor topic you entered is under-served relative to your channel. Try adding more topics or more videos first." />
          ) : (
            <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
              <h2 className="text-sm font-semibold">Gaps</h2>
              <ul className="mt-2 space-y-2">
                {report.gaps.map((gap) => (
                  <li key={gap.topic} className="flex items-start justify-between rounded-md bg-[var(--color-surface-2)] p-3">
                    <div>
                      <div className="text-[13px] font-medium">{gap.topic}</div>
                      <div className="text-[11px] text-[var(--color-text-muted)]">{gap.reason}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[16px] font-semibold tabular-nums">{gap.gapScore}</div>
                      <div className="text-[10px] text-[var(--color-text-muted)]">gap score</div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
            <h2 className="text-sm font-semibold">Your most-covered topics</h2>
            <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">{report.note}</p>
            {report.userTopics.length === 0 ? (
              <p className="mt-2 text-[13px] text-[var(--color-text-secondary)]">No topics derived — sync a channel or add videos first.</p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-2">
                {report.userTopics.slice(0, 20).map((topic) => (
                  <li key={topic.topic} className="rounded-full bg-[var(--color-surface-2)] px-3 py-1 text-[12px]">
                    {topic.topic} <span className="text-[var(--color-text-muted)]">×{topic.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
