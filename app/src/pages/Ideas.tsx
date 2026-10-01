import { useState } from 'react'
import type { JSX } from 'react'
import { buildRepurposeKit } from '@core/writing/repurpose'
import { callIpc, useIpc } from '../useIpc'
import { EmptyState } from '../components/EmptyState'

interface Idea {
  id: string
  title: string
  angle: string | null
  format: string | null
  status: string
  created_at: string
}

interface PlanItem {
  cluster: string
  term: string
  intent: string
  opportunity: number | null
}

const input =
  'w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-accent)]'

/**
 * Video Ideas (spec §21, §31).
 *
 * Ideas come from either your own notes or the deterministic content plan built
 * from saved keywords. The plan surfaces the opportunity value it was ranked by;
 * it is a suggestion, not a guarantee.
 */
export function Ideas(): JSX.Element {
  const ideas = useIpc<Idea[]>('ideas:list')
  const [title, setTitle] = useState('')
  const [angle, setAngle] = useState('')
  const [plan, setPlan] = useState<PlanItem[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [repurposeFor, setRepurposeFor] = useState<string | null>(null)

  async function create(ideaTitle: string, ideaAngle?: string): Promise<void> {
    if (!ideaTitle.trim()) return
    setBusy(true)
    setActionError(null)
    try {
      await callIpc('ideas:create', { title: ideaTitle.trim(), angle: ideaAngle || undefined })
      setTitle('')
      setAngle('')
      ideas.reload()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not save the idea.')
    } finally {
      setBusy(false)
    }
  }

  async function buildPlan(): Promise<void> {
    setBusy(true)
    setActionError(null)
    try {
      setPlan(await callIpc<PlanItem[]>('ideas:plan'))
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not build a plan.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await callIpc('ideas:delete', { id })
      ideas.reload()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not delete the idea.')
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Video Ideas</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
          Capture ideas, or generate a plan from the keywords you have saved. Every suggestion keeps its
          own reasoning.
        </p>
      </header>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Idea title" aria-label="Idea title" />
          <input className={input} value={angle} onChange={(e) => setAngle(e.target.value)} placeholder="Angle (optional)" aria-label="Idea angle" />
          <button
            type="button"
            onClick={() => void create(title, angle)}
            disabled={busy || !title.trim()}
            className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[#0b0d10] disabled:opacity-40"
          >
            Add idea
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void buildPlan()}
            disabled={busy}
            className="rounded-md border border-[var(--color-border-subtle)] px-4 py-2 text-[13px] disabled:opacity-40"
          >
            {busy ? 'Working…' : 'Build plan from saved keywords'}
          </button>
          <span className="text-[11px] text-[var(--color-text-muted)]">Deterministic and offline.</span>
        </div>
        {actionError && <p className="mt-2 text-[12px] text-[var(--color-danger)]">{actionError}</p>}
      </section>

      {plan && (
        <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
          <h2 className="text-sm font-semibold">Content plan</h2>
          {plan.length === 0 ? (
            <p className="mt-2 text-[13px] text-[var(--color-text-secondary)]">
              No saved keywords yet — analyze some on the Keywords page first.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {plan.slice(0, 20).map((item) => (
                <li key={`${item.cluster}-${item.term}`} className="flex items-center justify-between rounded-md bg-[var(--color-surface-2)] p-3">
                  <div>
                    <div className="text-[13px]">{item.term}</div>
                    <div className="text-[11px] text-[var(--color-text-muted)]">
                      {item.cluster} · {item.intent} · opportunity {item.opportunity ?? 'Not available'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void create(item.term, `cluster: ${item.cluster}`)}
                    className="shrink-0 rounded-md border border-[var(--color-border-subtle)] px-3 py-1.5 text-[12px]"
                  >
                    Save as idea
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {ideas.loading && <p className="text-[13px] text-[var(--color-text-secondary)]">Loading ideas…</p>}
      {ideas.error && <p className="text-[13px] text-[var(--color-danger)]">{ideas.error}</p>}

      {ideas.data && ideas.data.length === 0 && !ideas.loading && (
        <EmptyState title="No ideas yet" body="Add one above or generate a plan from your saved keywords." />
      )}

      {ideas.data && ideas.data.length > 0 && (
        <ul className="space-y-2">
          {ideas.data.map((idea) => (
            <li key={idea.id} className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[13px] font-medium">{idea.title}</div>
                  <div className="text-[11px] text-[var(--color-text-muted)]">
                    {idea.angle ?? 'no angle'} · {idea.status} · {new Date(idea.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setRepurposeFor(idea.id === repurposeFor ? null : idea.id)}
                    className="text-[12px] text-[var(--color-accent)] underline-offset-2 hover:underline"
                  >
                    {repurposeFor === idea.id ? 'Hide repurposing' : 'Repurpose'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(idea.id)}
                    className="text-[12px] text-[var(--color-text-muted)] underline-offset-2 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </div>
              {repurposeFor === idea.id && (
                <RepurposeKitPanel
                  title={idea.title}
                  payoff={idea.angle ?? ''}
                  keyword={idea.title}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RepurposeKitPanel({ title, payoff, keyword }: { title: string; payoff: string; keyword: string }): JSX.Element {
  const [payoffDraft, setPayoffDraft] = useState(payoff)
  const kit = buildRepurposeKit({ title, payoff: payoffDraft, keyword })
  const [copied, setCopied] = useState(false)

  const asText = [
    `SHORTS CONCEPTS`,
    ...kit.shortsConcepts.map((s) => `- ${s.concept}: "${s.firstLine}" (on screen: ${s.onScreenText})`),
    '',
    'CAPTIONS',
    ...kit.captions.map((c) => `- ${c}`),
    '',
    `COMMUNITY POLL: ${kit.communityPoll.question} (${kit.communityPoll.options.join(' / ')})`,
    `FOLLOW-UP: ${kit.followUpIdea.title} — ${kit.followUpIdea.angle}`,
    `LIVESTREAM: ${kit.livestreamTopic}`,
    `PINNED COMMENT: ${kit.pinnedComment}`,
  ].join('\n')

  return (
    <div className="mt-3 rounded-md bg-[var(--color-surface-2)] p-3">
      <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor={`rp-${title}`}>
        What does the video prove? (used to write the derivatives)
      </label>
      <input
        id={`rp-${title}`}
        value={payoffDraft}
        onChange={(e) => setPayoffDraft(e.target.value)}
        placeholder="e.g. a 10-divine build that clears pinnacle bosses"
        className="mt-1 w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] px-3 py-2 text-[12px]"
      />
      <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2">
        <div>
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Shorts concepts</h3>
          <ul className="mt-1 space-y-1 text-[12px]">
            {kit.shortsConcepts.map((concept) => (
              <li key={concept.concept}>
                <span className="font-medium">{concept.concept}:</span> “{concept.firstLine}”
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Captions</h3>
          <ul className="mt-1 space-y-1 text-[12px]">
            {kit.captions.map((caption) => (
              <li key={caption}>{caption}</li>
            ))}
          </ul>
        </div>
      </div>
      <ul className="mt-2 space-y-0.5 text-[12px] text-[var(--color-text-secondary)]">
        <li>Poll: {kit.communityPoll.question}</li>
        <li>Follow-up: {kit.followUpIdea.title}</li>
        <li>Livestream: {kit.livestreamTopic}</li>
      </ul>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(asText).then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 2000)
          })
        }}
        className="mt-2 rounded-md border border-[var(--color-border-subtle)] px-3 py-1.5 text-[12px]"
      >
        {copied ? 'Copied ✓' : 'Copy kit as text'}
      </button>
      <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">{kit.notes[0]}</p>
    </div>
  )
}
