import { useState } from 'react'
import type { JSX } from 'react'
import { COPILOT_SYSTEM_PROMPT } from '@ai/copilot'
import { IPC } from '../bridge'
import { callIpc } from '../useIpc'

interface Briefing {
  text: string
  hasData: boolean
}

interface GenerateResponse {
  text: string
  providerId: string
  modelId: string
  cached: boolean
  cachedAt: string | null
  attempts: Array<{ providerId: string; ok: boolean; error: { code: string; message: string } | null }>
}

const input =
  'w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-accent)]'

const EXAMPLE_QUESTIONS = [
  'Why did my recent videos underperform, based on the briefing?',
  'What should I make next, and why?',
  'Which title patterns correlate with more views here?',
  'What are viewers repeatedly asking for?',
]

/**
 * Creator Copilot (spec §105–107).
 *
 * The model never sees raw tables — only a locally computed briefing of
 * aggregated numbers, filtered by the creator's context selector (§59). If a
 * metric is missing it must say so, and it can never invent one. Answers are
 * cached per prompt version and can be regenerated.
 */
export function Copilot(): JSX.Element {
  const [question, setQuestion] = useState('')
  const [briefing, setBriefing] = useState<Briefing | null>(null)
  const [response, setResponse] = useState<GenerateResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // Context selector (§59): what the model may see. Knowledge defaults OFF.
  const [context, setContext] = useState<Record<string, boolean>>({
    performance: true,
    topVideos: true,
    patterns: true,
    topics: true,
    keywords: true,
    comments: true,
    profile: true,
    knowledge: false,
  })

  const CONTEXT_LABELS: Array<[string, string]> = [
    ['performance', 'Channel analytics'],
    ['topVideos', 'Recent videos'],
    ['patterns', 'Title patterns'],
    ['topics', 'My topics'],
    ['keywords', 'Saved keywords'],
    ['comments', 'Comments'],
    ['profile', 'Creator profile'],
    ['knowledge', 'Knowledge base'],
  ]

  async function ask(regenerate: boolean): Promise<void> {
    if (!question.trim()) return
    setBusy(true)
    setActionError(null)
    try {
      const contextResult = await callIpc<Briefing>(IPC.copilotBriefing, {
        context,
        knowledge: context.knowledge === true,
      })
      setBriefing(contextResult)
      const result = await callIpc<GenerateResponse>(IPC.providersGenerate, {
        task: 'analytics-interpretation',
        system: COPILOT_SYSTEM_PROMPT,
        input: `${contextResult.text}\n\nQUESTION FROM THE CREATOR: ${question.trim()}`,
        promptName: 'creator-copilot',
        promptVersion: 1,
        regenerate,
      })
      setResponse(result)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'The copilot could not answer.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Creator Copilot</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
          Answers are grounded in a briefing of your own aggregated numbers. The model cannot see raw
          data and is instructed to say "not available" rather than guess.
        </p>
      </header>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="copilot-q">
          Your question
        </label>
        <textarea
          id="copilot-q"
          className={`${input} mt-1 min-h-24 resize-y`}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What should I make next, and why?"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {EXAMPLE_QUESTIONS.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setQuestion(example)}
              className="rounded-full border border-[var(--color-border-subtle)] px-3 py-1 text-[11px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"
            >
              {example}
            </button>
          ))}
        </div>

        <fieldset className="mt-3 rounded-md border border-[var(--color-border-subtle)] p-3">
          <legend className="px-1 text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
            Use context from
          </legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {CONTEXT_LABELS.map(([key, label]) => (
              <label key={key} className="flex items-center gap-1.5 text-[12px]">
                <input
                  type="checkbox"
                  checked={context[key] ?? false}
                  onChange={(e) => setContext((current) => ({ ...current, [key]: e.target.checked }))}
                />
                {label}
              </label>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
            Unticked sections are not sent — the model is told they are not available.
          </p>
        </fieldset>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void ask(false)}
            disabled={busy || !question.trim()}
            className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[#0b0d10] disabled:opacity-40"
          >
            {busy ? 'Thinking…' : 'Ask'}
          </button>
          <button
            type="button"
            onClick={() => void ask(true)}
            disabled={busy || !question.trim()}
            className="rounded-md border border-[var(--color-border-subtle)] px-4 py-2 text-[13px] disabled:opacity-40"
          >
            ↻ Regenerate
          </button>
        </div>
        {actionError && <p className="mt-2 text-[12px] text-[var(--color-danger)]">{actionError}</p>}
        {briefing && !briefing.hasData && (
          <p className="mt-2 text-[12px] text-[var(--color-warning)]">
            Nothing is stored yet — connect and sync a channel for grounded answers.
          </p>
        )}
      </section>

      {response && (
        <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Answer</h2>
            <span className="text-[11px] text-[var(--color-text-muted)]">
              {response.providerId} · {response.modelId} · {response.cached ? 'cached' : 'fresh'}
            </span>
          </div>
          <pre className="mt-2 whitespace-pre-wrap text-[13px] text-[var(--color-text-primary)]">{response.text}</pre>

          {response.attempts.some((attempt) => !attempt.ok) && (
            <details className="mt-3 text-[11px] text-[var(--color-text-muted)]">
              <summary>Providers tried</summary>
              <ul className="mt-1 space-y-1">
                {response.attempts.map((attempt) => (
                  <li key={attempt.providerId}>
                    {attempt.providerId}: {attempt.ok ? 'ok' : `${attempt.error?.code} — ${attempt.error?.message}`}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {briefing && (
        <details className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4 text-[12px]">
          <summary className="cursor-pointer text-sm font-semibold">Briefing sent to the model</summary>
          <pre className="mt-2 whitespace-pre-wrap text-[11px] text-[var(--color-text-secondary)]">{briefing.text}</pre>
        </details>
      )}
    </div>
  )
}
