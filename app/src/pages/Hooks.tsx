import { useState } from 'react'
import type { JSX } from 'react'
import { hookStrength } from '@core/writing/hooks'
import type { ScoreResult } from '@core/scores/engine'
import { IPC } from '../bridge'
import { ScorePanel } from '../components/ScorePanel'
import { callIpc } from '../useIpc'

interface GeneratedHook {
  text: string
  angle: string
}

interface GenerateResponse {
  text: string
  providerId: string
  modelId: string
  cached: boolean
}

const input =
  'w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-accent)]'

/**
 * Hooks (spec §33).
 *
 * AI writes candidate opening lines; the DETERMINISTIC local engine scores
 * them. The model never produces the score shown next to its suggestion, and
 * nothing claims a retention outcome.
 */
export function Hooks(): JSX.Element {
  const [topic, setTopic] = useState('')
  const [manual, setManual] = useState('')
  const [generated, setGenerated] = useState<Array<GeneratedHook & { score: ScoreResult }> | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const manualScore = manual.trim().length > 0 ? hookStrength({ text: manual }) : null

  async function generate(): Promise<void> {
    if (!topic.trim()) return
    setBusy(true)
    setActionError(null)
    try {
      const result = await callIpc<GenerateResponse>(IPC.providersGenerate, {
        task: 'hook-writing',
        system:
          'You write spoken opening lines (hooks) for videos. Hooks must stay accurate to the material and ' +
          'never promise outcomes the video cannot deliver. Never invent metrics. Return ONLY JSON: ' +
          '{"hooks": [{"text": string, "angle": string}]} with 5-8 hooks, each a different angle.',
        input: `Topic: ${topic.trim()}\nReturn the JSON object.`,
        promptName: 'hook-writer',
        promptVersion: 1,
      })
      const parsed = JSON.parse(result.text) as { hooks?: GeneratedHook[] }
      const hooks = Array.isArray(parsed.hooks) ? parsed.hooks : []
      // Score each candidate with the local deterministic engine — never the model.
      setGenerated(hooks.map((hook) => ({ ...hook, score: hookStrength({ text: hook.text }) })))
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Generation failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Hooks</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
          Score your opening lines with the local engine, or draft candidates with AI and score them
          locally. Heuristics about packaging — not a retention prediction.
        </p>
      </header>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="hook-manual">
          Your hook (first sentences, as spoken)
        </label>
        <textarea
          id="hook-manual"
          className={`${input} mt-1 min-h-20 resize-y`}
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="A 10-divine build that kills pinnacle bosses — and I'll show the fight, not just the tree."
        />
        {manualScore && (
          <div className="mt-3">
            <ScorePanel title="Your hook" result={manualScore} source="Locally derived · deterministic hook engine (docs/SCORING.md §7)" />
          </div>
        )}
      </section>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="hook-topic">
          Topic for AI candidates
        </label>
        <div className="mt-1 flex gap-2">
          <input
            id="hook-topic"
            className={input}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="budget lightning arrow deadeye"
          />
          <button
            type="button"
            onClick={() => void generate()}
            disabled={busy || !topic.trim()}
            className="shrink-0 rounded-md bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[#0b0d10] disabled:opacity-40"
          >
            {busy ? 'Drafting…' : 'Draft hooks'}
          </button>
        </div>
        {actionError && <p className="mt-2 text-[12px] text-[var(--color-danger)]">{actionError}</p>}
      </section>

      {generated && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">AI candidates · scored locally</h2>
          {generated.map((hook, index) => (
            <div key={index} className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13px]">{hook.text}</p>
                <span className="shrink-0 text-right">
                  <span className="text-[18px] font-semibold tabular-nums">{hook.score.score ?? '—'}</span>
                  <span className="block text-[10px] text-[var(--color-text-muted)]">{hook.score.confidence} confidence</span>
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">Angle: {hook.angle}</p>
              <button
                type="button"
                onClick={() => setManual(hook.text)}
                className="mt-2 text-[12px] text-[var(--color-accent)] underline-offset-2 hover:underline"
              >
                Edit in the box above
              </button>
            </div>
          ))}
          <p className="text-[11px] text-[var(--color-text-muted)]">
            Candidates come from your configured AI provider; every score next to them was computed by
            the deterministic local engine, not the model.
          </p>
        </section>
      )}
    </div>
  )
}
