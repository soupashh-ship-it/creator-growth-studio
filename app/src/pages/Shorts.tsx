import { useState } from 'react'
import type { JSX } from 'react'
import type { ShortIdeaReview } from '@core/writing/scripts'
import { hookStrength } from '@core/writing/hooks'
import { parseSubtitles } from '@core/media/subtitles'
import { analyzeTranscript } from '@core/writing/transcript'
import { IPC } from '../bridge'
import { callIpc } from '../useIpc'
import { ClipExporter } from '../components/ClipExporter'

interface GeneratedIdea {
  concept: string
  sourceTimestampHint: string
  onScreenText: string
  firstLine: string
}

interface GenerateResponse {
  text: string
  providerId: string
  modelId: string
  cached: boolean
}

const input =
  'w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-accent)]'

function reviewIdea(idea: GeneratedIdea): ShortIdeaReview {
  const needsTimestamp = /unknown|verify/i.test(idea.sourceTimestampHint)
  const notes: string[] = []
  if (needsTimestamp) notes.push('Timestamp not located in your material — find it before filming.')
  if (idea.onScreenText.trim().length > 40) notes.push('On-screen text is long; shorts carry ~3–6 words on screen.')
  return {
    idea,
    firstLineHook: hookStrength({ text: idea.firstLine }),
    needsTimestamp,
    notes,
  }
}

/**
 * Shorts (spec §35–36).
 *
 * Clip ideas are derived ONLY from source material the creator pastes in (VOD
 * transcript, video notes). The model cannot know real timestamps, so hints
 * stay honest ("the section titled X" / "verify manually") and unresolved items
 * are surfaced as todos. First lines are scored by the local hook engine.
 */
export function Shorts(): JSX.Element {
  const [topic, setTopic] = useState('')
  const [source, setSource] = useState('')
  const [reviews, setReviews] = useState<ShortIdeaReview[] | null>(null)
  const [subtitleCheck, setSubtitleCheck] = useState<ReturnType<typeof analyzeTranscript> | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function plan(): Promise<void> {
    if (!source.trim()) return
    setBusy(true)
    setActionError(null)
    try {
      const result = await callIpc<GenerateResponse>(IPC.providersGenerate, {
        task: 'shorts-planning',
        system:
          'You plan short-form clips from source material the creator supplies. Each concept must be faithful ' +
          'to the material. You do not know real timestamps: either reference a literal marker from the text ' +
          '(e.g. "the section titled X") or write "unknown - verify manually". Never invent view counts. ' +
          'Return ONLY JSON: {"ideas": [{"concept": string, "sourceTimestampHint": string, "onScreenText": ' +
          'string, "firstLine": string}]} with 4-6 ideas.',
        input: `Topic: ${topic.trim() || 'clips from this material'}\nSource material:\n${source.trim()}\n\nReturn the JSON object.`,
        promptName: 'shorts-planner',
        promptVersion: 1,
      })
      const parsed = JSON.parse(result.text) as { ideas?: GeneratedIdea[] }
      const ideas = Array.isArray(parsed.ideas) ? parsed.ideas : []
      setReviews(ideas.map(reviewIdea))
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Planning failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Shorts</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
          Plan short clips from material you already have. Timestamps are never invented — hints
          referencing nothing specific are flagged for manual verification.
        </p>
      </header>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="sh-topic">
          Topic (optional)
        </label>
        <input id="sh-topic" className={`${input} mt-1`} value={topic} onChange={(e) => setTopic(e.target.value)} />

        <label className="mt-3 block text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="sh-source">
          Source material (paste, or load a .txt/.srt/.vtt file — YouTube Studio exports work)
        </label>
        <input
          type="file"
          accept=".txt,.srt,.vtt"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            void file.text().then((raw) => {
              const parsed = parseSubtitles(raw)
              setSource(parsed.transcript)
              if (parsed.cues.length > 0) {
                setSubtitleCheck(analyzeTranscript(parsed))
              }
            })
          }}
          className="mt-1 block w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-3 py-2 text-[12px]"
        />
        {subtitleCheck && (
          <details className="mt-2 rounded-md bg-[var(--color-surface-2)] p-3 text-[12px]">
            <summary className="cursor-pointer font-medium">Transcript check ({subtitleCheck.wordCount} words{subtitleCheck.wordsPerMinute ? ` · ~${subtitleCheck.wordsPerMinute} wpm` : ''})</summary>
            <ul className="mt-1 space-y-1 text-[var(--color-text-secondary)]">
              {subtitleCheck.findings.length === 0 ? (
                <li>No issues detected by the local checks.</li>
              ) : (
                subtitleCheck.findings.map((finding, index) => (
                  <li key={index}>
                    {finding.clock ? <span className="font-mono">[{finding.clock}]</span> : '·'} {finding.detail}
                  </li>
                ))
              )}
            </ul>
          </details>
        )}
        <textarea
          id="sh-source"
          className={`${input} mt-1 min-h-40 resize-y`}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="Paste the transcript or section notes here…"
        />
        <button
          type="button"
          onClick={() => void plan()}
          disabled={busy || !source.trim()}
          className="mt-2 rounded-md bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[#0b0d10] disabled:opacity-40"
        >
          {busy ? 'Planning…' : 'Plan clips'}
        </button>
        {actionError && <p className="mt-2 text-[12px] text-[var(--color-danger)]">{actionError}</p>}
      </section>

      <ClipExporter />

      {reviews && reviews.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Planned clips · {reviews.length}</h2>
          {reviews.map((review, index) => (
            <div key={index} className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-[13px] font-medium">{review.idea.concept}</h3>
                <span className="shrink-0 text-right">
                  <span className="text-[18px] font-semibold tabular-nums">{review.firstLineHook.score ?? '—'}</span>
                  <span className="block text-[10px] text-[var(--color-text-muted)]">hook score (local)</span>
                </span>
              </div>
              <dl className="mt-2 space-y-1 text-[12px] text-[var(--color-text-secondary)]">
                <div>
                  <dt className="inline text-[var(--color-text-muted)]">First line: </dt>
                  <dd className="inline">{review.idea.firstLine}</dd>
                </div>
                <div>
                  <dt className="inline text-[var(--color-text-muted)]">On-screen text: </dt>
                  <dd className="inline">{review.idea.onScreenText}</dd>
                </div>
                <div>
                  <dt className="inline text-[var(--color-text-muted)]">Where in your material: </dt>
                  <dd className="inline">{review.idea.sourceTimestampHint}</dd>
                </div>
              </dl>
              {review.notes.length > 0 && (
                <ul className="mt-2 space-y-1 text-[11px] text-[var(--color-warning)]">
                  {review.notes.map((note) => (
                    <li key={note}>⚠ {note}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          <p className="text-[11px] text-[var(--color-text-muted)]">
            Hook scores come from the deterministic local engine. Cutting and uploading are manual —
            the app does not automate platform actions.
          </p>
        </section>
      )}

      {reviews && reviews.length === 0 && (
        <section className="rounded-lg border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-6 text-[13px] text-[var(--color-text-secondary)]">
          The model returned no usable ideas. Try more specific source material.
        </section>
      )}
    </div>
  )
}
