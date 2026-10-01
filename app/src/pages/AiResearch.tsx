import { useState } from 'react'
import type { JSX } from 'react'
import { IPC } from '../bridge'
import { EmptyState } from '../components/EmptyState'
import { callIpc } from '../useIpc'
import {
  deepResearchPrompt,
  parseDeepResearch,
  summarizeFindings,
  type DeepResearchOutput,
  type ResearchFinding,
} from '@prompts/deep-research'

interface Briefing {
  text: string
  hasData: boolean
}

interface GenerateResponse {
  text: string
  providerId: string
  modelId: string
  cached: boolean
}

const input =
  'w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-accent)]'

const CONFIDENCE_CLASS: Record<ResearchFinding['confidence'], string> = {
  high: 'text-[var(--color-positive)] border-[var(--color-positive)]',
  medium: 'text-[var(--color-warning)] border-[var(--color-warning)]',
  low: 'text-[var(--color-text-muted)] border-[var(--color-border-subtle)]',
}

function FindingCard({ finding }: { finding: ResearchFinding }): JSX.Element {
  const sourced = finding.basis === 'sourced'
  return (
    <li className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] p-3">
      <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wide">
        <span
          className={
            'rounded-sm border px-1.5 py-0.5 ' +
            (sourced
              ? 'border-[var(--color-positive)] text-[var(--color-positive)]'
              : 'border-[var(--color-warning)] text-[var(--color-warning)]')
          }
        >
          {sourced ? 'Sourced' : 'Speculation'}
        </span>
        <span className={'rounded-sm border px-1.5 py-0.5 ' + CONFIDENCE_CLASS[finding.confidence]}>
          {finding.confidence} confidence
        </span>
        {finding.source && (
          <span className="truncate text-[var(--color-text-muted)]">source: {finding.source}</span>
        )}
      </div>
      <p className="mt-2 text-[13px] text-[var(--color-text-primary)]">{finding.claim}</p>
    </li>
  )
}

/**
 * AI Research (spec §60–61).
 *
 * Distinct from Creator Copilot: the creator supplies EXTERNAL research
 * (articles, patch notes, competitor notes) and the model reasons across it AND
 * the locally stored signals. Supplied text is wrapped as untrusted data at the
 * prompt boundary; the model must return structured findings that separate
 * sourced facts from speculation and never invent analytics figures.
 */
export function AiResearch(): JSX.Element {
  const [question, setQuestion] = useState('')
  const [material, setMaterial] = useState('')
  const [answer, setAnswer] = useState<GenerateResponse | null>(null)
  const [findings, setFindings] = useState<DeepResearchOutput | null>(null)
  const [briefing, setBriefing] = useState<Briefing | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function run(regenerate = false): Promise<void> {
    if (!question.trim() || !material.trim()) return
    setBusy(true)
    setActionError(null)
    try {
      const localSignals = briefing ?? (await callIpc<Briefing>(IPC.copilotBriefing))
      setBriefing(localSignals)
      const rendered = deepResearchPrompt.build({
        question: question.trim(),
        material: material.trim(),
        briefing: localSignals.text,
      })
      const result = await callIpc<GenerateResponse>(IPC.providersGenerate, {
        task: 'deep-research',
        system: rendered.system,
        input: rendered.user,
        promptName: deepResearchPrompt.name,
        promptVersion: deepResearchPrompt.version,
        regenerate,
      })
      setAnswer(result)
      setFindings(parseDeepResearch(result.text))
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Research run failed')
    } finally {
      setBusy(false)
    }
  }

  const counts = findings ? summarizeFindings(findings) : null

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Research</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
          Bring your own research material (articles, patch notes, public competitor pages you have
          read) and reason across it together with your locally stored data. Findings come back as
          cards marked <strong>sourced</strong> or <strong>speculation</strong>, with a confidence
          level. The model never invents analytics.
        </p>
      </header>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="ai-q">
          Research question
        </label>
        <textarea
          id="ai-q"
          className={`${input} mt-1 min-h-16 resize-y`}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What did the new patch change that my audience will search for?"
        />

        <label className="mt-3 block text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="ai-material">
          Research material (paste sources you have read)
        </label>
        <textarea
          id="ai-material"
          className={`${input} mt-1 min-h-40 resize-y`}
          value={material}
          onChange={(e) => setMaterial(e.target.value)}
          placeholder="Paste patch notes, articles, or your own reading notes…"
        />

        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void run(false)}
            disabled={busy || !question.trim() || !material.trim()}
            className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[#0b0d10] disabled:opacity-40"
          >
            {busy ? 'Working…' : 'Run research'}
          </button>
          <button
            type="button"
            onClick={() => void run(true)}
            disabled={busy || !question.trim() || !material.trim()}
            className="rounded-md border border-[var(--color-border-subtle)] px-4 py-2 text-[13px] disabled:opacity-40"
          >
            ↻ Regenerate
          </button>
        </div>
        {actionError && <p className="mt-2 text-[12px] text-[var(--color-danger)]">{actionError}</p>}
        {!material.trim() && (
          <p className="mt-2 text-[12px] text-[var(--color-warning)]">
            Paste research material first — this page grounds every run in sources you supply rather than model memory.
          </p>
        )}
      </section>

      {answer && (
        <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">Findings</h2>
            <span className="text-[11px] text-[var(--color-text-muted)]">
              {answer.providerId} · {answer.modelId} · {answer.cached ? 'cached' : 'fresh'}
              {counts ? ` · ${counts.sourced} sourced, ${counts.speculation} speculation` : ''}
            </span>
          </div>

          {findings ? (
            <div className="mt-3 space-y-4">
              <p className="text-[13px] text-[var(--color-text-primary)]">{findings.summary}</p>

              <ul className="space-y-2">
                {findings.findings.map((finding, index) => (
                  <FindingCard key={index} finding={finding} />
                ))}
              </ul>

              {findings.openQuestions.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                    Open questions (not answered by the supplied material)
                  </h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-[12px] text-[var(--color-text-secondary)]">
                    {findings.openQuestions.map((openQuestion, index) => (
                      <li key={index}>{openQuestion}</li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-[11px] text-[var(--color-text-muted)]">
                Overall model confidence: {findings.confidence}. Cards are the model&apos;s own
                attribution, not verified facts — check the source before acting on anything.
              </p>
            </div>
          ) : (
            <div className="mt-3">
              <p className="text-[12px] text-[var(--color-warning)]">
                The model did not return structured findings, so the raw response is shown below
                instead.
              </p>
              <pre className="mt-2 whitespace-pre-wrap text-[13px] text-[var(--color-text-primary)]">{answer.text}</pre>
            </div>
          )}
        </section>
      )}

      {briefing && (
        <details className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4 text-[12px]">
          <summary className="cursor-pointer text-sm font-semibold">Local data briefing included in the run</summary>
          <pre className="mt-2 whitespace-pre-wrap text-[11px] text-[var(--color-text-secondary)]">{briefing.text}</pre>
        </details>
      )}

      {!answer && !briefing && (
        <EmptyState
          title="No research run yet"
          body="Ask a question and paste any material you want the model to work from. Everything stays on this machine except the prompt sent to your configured AI provider."
        />
      )}
    </div>
  )
}
