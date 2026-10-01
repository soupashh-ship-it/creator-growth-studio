import { useMemo, useState } from 'react'
import type { JSX } from 'react'
import { reviewScriptStructure, type SegmentInput } from '@core/writing/scripts'
import { RETENTION_FORMATS, buildRetentionPlan } from '@core/writing/retention'
import { DOMAIN_MODES, applyDomainMode } from '@core/writing/domain-modes'
import { IPC } from '../bridge'
import { callIpc } from '../useIpc'

interface ScriptResponse {
  segments: Array<{ label: string; purpose: string; guidance: string }>
  researchNeeded: string[]
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
 * Scripts (spec §34).
 *
 * The creator's outline is reviewed deterministically (opening / payoff /
 * next-step presence, opening-hook score). An optional AI pass assigns beats to
 * the creator's OWN outline and must list anything unverified as research
 * needed — fabrication is a schema-level failure, not a style problem.
 */
export function Scripts(): JSX.Element {
  const [outline, setOutline] = useState('')
  const [openingText, setOpeningText] = useState('')
  const [aiSegments, setAiSegments] = useState<SegmentInput[] | null>(null)
  const [researchNeeded, setResearchNeeded] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // Domain mode (§110–112)
  const [domainMode, setDomainMode] = useState('general')

  // Retention planner (§34)
  const [format, setFormat] = useState('tutorial')
  const [targetMinutes, setTargetMinutes] = useState(10)
  const [plan, setPlan] = useState<ReturnType<typeof buildRetentionPlan> | null>(null)

  const outlineSegments = useMemo<SegmentInput[]>(
    () =>
      outline
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const dashIndex = line.indexOf('—') >= 0 ? line.indexOf('—') : line.indexOf('-')
          if (dashIndex > 0) {
            return {
              label: line.slice(0, dashIndex).trim(),
              purpose: '',
              guidance: line.slice(dashIndex + 1).trim(),
            }
          }
          return { label: line, purpose: '', guidance: '' }
        }),
    [outline],
  )

  const segments = aiSegments ?? outlineSegments
  const feedback = useMemo(
    () => reviewScriptStructure(segments, openingText || undefined),
    [segments, openingText],
  )
  const domainReview = useMemo(() => applyDomainMode(domainMode, outline), [domainMode, outline])

  async function structureWithAi(): Promise<void> {
    if (!outline.trim()) return
    setBusy(true)
    setActionError(null)
    try {
      const result = await callIpc<GenerateResponse>(IPC.providersGenerate, {
        task: 'script-structure',
        system:
          'You structure video scripts. Given the creator outline, produce labelled segments with purpose and ' +
          'guidance. Never fabricate facts, quotes, statistics, or performance claims; put anything unverified ' +
          'into researchNeeded. Return ONLY JSON: {"segments": [{"label": string, "purpose": string, ' +
          '"guidance": string}], "researchNeeded": string[]}',
        input: `Outline:\n${outline.trim()}\n\nReturn the JSON object.`,
        promptName: 'script-writer',
        promptVersion: 1,
      })
      const parsed = JSON.parse(result.text) as ScriptResponse
      setAiSegments(Array.isArray(parsed.segments) ? parsed.segments : [])
      setResearchNeeded(Array.isArray(parsed.researchNeeded) ? parsed.researchNeeded : [])
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Structuring failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Scripts</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
          Structural review runs locally. The optional AI pass organizes YOUR outline and flags
          anything it cannot verify — it never writes facts it was not given.
        </p>
      </header>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="sc-outline">
          Outline (one beat per line — “Label — what happens”)
        </label>
        <textarea
          id="sc-outline"
          className={`${input} mt-1 min-h-32 resize-y`}
          value={outline}
          onChange={(e) => setOutline(e.target.value)}
          placeholder={'Hook — the 10-divine claim, tested\nSetup — budget constraints and league start\nTest — three pinnacle fights\nPayoff — what actually worked\nNext — full guide video'}
        />

        <label className="mt-3 block text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="sc-opening">
          Opening lines (optional — scored with the hook engine)
        </label>
        <textarea
          id="sc-opening"
          className={`${input} mt-1 min-h-16 resize-y`}
          value={openingText}
          onChange={(e) => setOpeningText(e.target.value)}
        />

        <button
          type="button"
          onClick={() => void structureWithAi()}
          disabled={busy || !outline.trim()}
          className="mt-3 rounded-md border border-[var(--color-border-subtle)] px-4 py-2 text-[13px] disabled:opacity-40"
        >
          {busy ? 'Structuring…' : 'AI structure pass'}
        </button>
        {actionError && <p className="mt-2 text-[12px] text-[var(--color-danger)]">{actionError}</p>}
      </section>

      {researchNeeded.length > 0 && (
        <section className="rounded-lg border border-[var(--color-warning)] bg-[var(--color-surface-1)] p-4">
          <h2 className="text-sm font-semibold">Verify before filming</h2>
          <ul className="mt-1 list-disc pl-5 text-[12px] text-[var(--color-text-secondary)]">
            {researchNeeded.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <h2 className="text-sm font-semibold">Retention planner</h2>
        <p className="mt-1 text-[12px] text-[var(--color-text-secondary)]">
          A proportional beat timeline for your target length. Times are planning aids, not measured
          retention.
        </p>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="rt-format">
              Format
            </label>
            <select
              id="rt-format"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px]"
            >
              {RETENTION_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="rt-mins">
              Target minutes
            </label>
            <input
              id="rt-mins"
              type="number"
              min={1}
              max={180}
              value={targetMinutes}
              onChange={(e) => setTargetMinutes(Math.max(1, Number(e.target.value) || 1))}
              className="w-24 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px]"
            />
          </div>
          <button
            type="button"
            onClick={() => setPlan(buildRetentionPlan(format, targetMinutes))}
            className="rounded-md border border-[var(--color-border-subtle)] px-4 py-2 text-[13px]"
          >
            Build timeline
          </button>
        </div>
        {plan && (
          <>
            <ol className="mt-3 space-y-1">
              {plan.beats.map((beat) => (
                <li key={beat.label} className="flex items-start justify-between gap-3 rounded-md bg-[var(--color-surface-2)] px-3 py-1.5 text-[12px]">
                  <span>
                    <span className="font-mono tabular-nums text-[var(--color-text-muted)]">{beat.clock}</span> ·{' '}
                    <span className="font-medium">{beat.label}</span>
                    <span className="block text-[11px] text-[var(--color-text-secondary)]">{beat.why}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-[var(--color-text-muted)]">
                    {Math.round(((beat.endS - beat.startS) / plan.durationS) * 100)}%
                  </span>
                </li>
              ))}
            </ol>
            <ul className="mt-2 space-y-1 text-[11px] text-[var(--color-text-muted)]">
              {plan.notes.map((note) => (
                <li key={note}>• {note}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <h2 className="text-sm font-semibold">Structure review · {feedback.segmentCount} segments</h2>
        <div className="mt-2 grid grid-cols-1 gap-2 text-[12px] sm:grid-cols-3">
          <div className="rounded-md bg-[var(--color-surface-2)] p-3">
            Opening/hook: {feedback.hasOpening ? '✓' : 'missing'}
          </div>
          <div className="rounded-md bg-[var(--color-surface-2)] p-3">
            Payoff: {feedback.hasPayoff ? '✓' : 'missing'}
          </div>
          <div className="rounded-md bg-[var(--color-surface-2)] p-3">
            Next step: {feedback.hasCallToNext ? '✓' : 'missing'}
          </div>
        </div>
        {feedback.notes.length > 0 && (
          <ul className="mt-2 space-y-1 text-[12px] text-[var(--color-text-secondary)]">
            {feedback.notes.map((note) => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Domain structure (§110–112)</h2>
          <select
            value={domainMode}
            onChange={(e) => setDomainMode(e.target.value)}
            aria-label="Domain mode"
            className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-3 py-1.5 text-[12px]"
          >
            {DOMAIN_MODES.map((mode) => (
              <option key={mode.id} value={mode.id}>
                {mode.label}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-1 text-[12px] text-[var(--color-text-secondary)]">{domainReview.mode.description}</p>

        {domainReview.completeness !== null && (
          <p className="mt-2 text-[12px]">
            Beats found in your outline: <span className="font-medium tabular-nums">{domainReview.completeness}%</span>
          </p>
        )}

        <div className="mt-2 grid grid-cols-1 gap-2 text-[12px] sm:grid-cols-2">
          <div className="rounded-md bg-[var(--color-surface-2)] p-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Present</div>
            <ul className="mt-1 space-y-0.5 text-[var(--color-text-secondary)]">
              {domainReview.present.length === 0 && <li className="text-[var(--color-text-muted)]">None detected yet.</li>}
              {domainReview.present.map((label) => (
                <li key={label}>✓ {label}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-md bg-[var(--color-surface-2)] p-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Consider adding</div>
            <ul className="mt-1 space-y-0.5 text-[var(--color-text-secondary)]">
              {domainReview.missing.length === 0 && <li className="text-[var(--color-text-muted)]">All beats detected.</li>}
              {domainReview.missing.map((label) => (                <li key={label}>+ {label}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-md bg-[var(--color-surface-2)] p-3 text-[12px]">
            <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Hook guidance</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[var(--color-text-secondary)]">
              {domainReview.hookGuidance.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-md bg-[var(--color-surface-2)] p-3 text-[12px]">
            <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Derivative angles</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[var(--color-text-secondary)]">
              {domainReview.derivativeAngles.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>

        <ul className="mt-2 space-y-0.5 text-[11px] text-[var(--color-text-muted)]">
          {domainReview.notes.map((note) => (
            <li key={note}>• {note}</li>
          ))}
        </ul>
      </section>

      {segments.length > 0 && (
        <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
          <h2 className="text-sm font-semibold">Segments {aiSegments ? '(AI structured)' : '(from your outline)'}</h2>
          <ol className="mt-2 space-y-2">
            {segments.map((segment, index) => (
              <li key={index} className="rounded-md bg-[var(--color-surface-2)] p-3 text-[12px]">
                <div className="font-medium">
                  {index + 1}. {segment.label}
                </div>
                {segment.purpose && <div className="mt-0.5 text-[var(--color-text-secondary)]">{segment.purpose}</div>}
                {segment.guidance && <div className="mt-0.5 text-[var(--color-text-secondary)]">{segment.guidance}</div>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}
