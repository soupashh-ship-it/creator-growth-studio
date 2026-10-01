import { useMemo, useState } from 'react'
import type { JSX } from 'react'
import { assessBriefCompleteness } from '@core/writing/brief'
import { IPC } from '../bridge'
import { callIpc } from '../useIpc'

interface BriefResponse {
  positioning: string
  beats: Array<{ label: string; goal: string }>
  researchNeeded: string[]
  packagingNotes: string
}

interface GenerateResponse {
  text: string
  providerId: string
  modelId: string
  cached: boolean
}

const SECTION_KEYS = [
  { key: 'promise', label: 'Viewer promise' },
  { key: 'audience', label: 'Audience & stakes' },
  { key: 'angle', label: 'Angle vs existing videos' },
  { key: 'proof', label: 'Proof / credibility plan' },
  { key: 'structure', label: 'Beat outline' },
  { key: 'packaging', label: 'Packaging notes' },
]

const input =
  'w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-accent)]'

/**
 * Video Brief (spec §30).
 *
 * The creator's own brief with a deterministic completeness check, plus an
 * optional AI draft (versioned prompt, cached) they can apply to EMPTY fields.
 * The AI never supplies numbers — none exist locally to ground them.
 */
export function VideoBrief(): JSX.Element {
  const [topic, setTopic] = useState('')
  const [sections, setSections] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState<BriefResponse | null>(null)
  const [draftMeta, setDraftMeta] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const completeness = useMemo(() => assessBriefCompleteness(sections), [sections])

  async function generate(): Promise<void> {
    if (!topic.trim()) return
    setBusy(true)
    setActionError(null)
    try {
      const result = await callIpc<GenerateResponse>(IPC.providersGenerate, {
        task: 'video-brief',
        system:
          'You are a video pre-production planner. Produce a qualitative brief: positioning, beat-by-beat ' +
          'structure, packaging notes, and facts the creator must research themselves. Never invent search ' +
          'volume, view projections, CTR, or analytics figures. Return ONLY JSON: {"positioning": string, ' +
          '"beats": [{"label": string, "goal": string}], "researchNeeded": string[], "packagingNotes": string}',
        input: `Topic: ${topic.trim()}\n${sections['audience'] ? `Audience: ${sections['audience']}\n` : ''}${
          sections['promise'] ? `Promise so far: ${sections['promise']}\n` : ''
        }Return the JSON object.`,
        promptName: 'video-brief',
        promptVersion: 1,
      })
      const parsed = JSON.parse(result.text) as BriefResponse
      setDraft(parsed)
      setDraftMeta(`${result.providerId} · ${result.modelId}${result.cached ? ' · cached' : ''}`)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Draft generation failed')
    } finally {
      setBusy(false)
    }
  }

  function applyDraft(): void {
    if (!draft) return
    setSections((current) => ({
      ...current,
      promise: current['promise']?.trim() ? current['promise'] : draft.positioning,
      structure: current['structure']?.trim()
        ? current['structure']
        : draft.beats.map((beat) => `${beat.label} — ${beat.goal}`).join('\n'),
      packaging: current['packaging']?.trim() ? current['packaging'] : draft.packagingNotes,
      proof: current['proof']?.trim()
        ? current['proof']
        : draft.researchNeeded.length > 0
          ? `To research: ${draft.researchNeeded.join('; ')}`
          : current['proof'] ?? '',
    }))
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Video Brief</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
          Write the brief yourself; the app checks completeness and a local AI model can draft
          sections. Briefs are qualitative — no view projections or volume numbers exist here.
        </p>
      </header>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="vb-topic">
          Topic
        </label>
        <input
          id="vb-topic"
          className={`${input} mt-1`}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="PoE 2 budget league starter under 10 divines"
        />
        <button
          type="button"
          onClick={() => void generate()}
          disabled={busy || !topic.trim()}
          className="mt-2 rounded-md border border-[var(--color-border-subtle)] px-4 py-2 text-[13px] disabled:opacity-40"
        >
          {busy ? 'Drafting…' : 'AI draft sections'}
        </button>
        {actionError && <p className="mt-2 text-[12px] text-[var(--color-danger)]">{actionError}</p>}
        {draft && (
          <div className="mt-3 rounded-md bg-[var(--color-surface-2)] p-3 text-[12px]">
            <div className="font-medium">{draft.positioning}</div>
            <ul className="mt-1 list-disc pl-5 text-[var(--color-text-secondary)]">
              {draft.beats.map((beat) => (
                <li key={beat.label}>
                  {beat.label}: {beat.goal}
                </li>
              ))}
            </ul>
            {draft.researchNeeded.length > 0 && (
              <p className="mt-1 text-[var(--color-warning)]">You must research: {draft.researchNeeded.join('; ')}</p>
            )}
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={applyDraft}
                className="rounded-md border border-[var(--color-border-subtle)] px-3 py-1.5 text-[12px]"
              >
                Fill empty sections with this draft
              </button>
              {draftMeta && <span className="text-[11px] text-[var(--color-text-muted)]">{draftMeta}</span>}
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        {SECTION_KEYS.map((section) => (
          <div key={section.key} className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
            <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor={`vb-${section.key}`}>
              {section.label}
            </label>
            <textarea
              id={`vb-${section.key}`}
              className={`${input} mt-1 min-h-16 resize-y`}
              value={sections[section.key] ?? ''}
              onChange={(e) => setSections((current) => ({ ...current, [section.key]: e.target.value }))}
            />
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <h2 className="text-sm font-semibold">
          Completeness: {completeness.filled}/{completeness.total}
        </h2>
        {completeness.missing.length > 0 ? (
          <p className="mt-1 text-[12px] text-[var(--color-text-secondary)]">Still missing: {completeness.missing.join(', ')}</p>
        ) : (
          <p className="mt-1 text-[12px] text-[var(--color-positive)]">All sections drafted.</p>
        )}
        {completeness.notes.map((note) => (
          <p key={note} className="mt-1 text-[12px] text-[var(--color-warning)]">
            {note}
          </p>
        ))}
      </section>
    </div>
  )
}
