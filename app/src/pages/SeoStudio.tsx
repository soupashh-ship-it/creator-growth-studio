import { useMemo, useState } from 'react'
import type { JSX } from 'react'
import { scoreSeo, type SeoInput } from '@core/scores/seo'
import { optimizeSeo, type OptimizeResult } from '@core/seo/optimizer'
import { ScorePanel } from '../components/ScorePanel'

const label = 'text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]'
const input =
  'mt-1 w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]'

/**
 * SEO Studio (spec §12–13).
 *
 * The numeric score is produced entirely by the local deterministic engine — no
 * account, no AI, and no network are required. The AI layer only adds optional
 * qualitative commentary elsewhere and can never overwrite these numbers.
 */
export function SeoStudio(): JSX.Element {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [primaryKeyword, setPrimaryKeyword] = useState('')
  const [subtopics, setSubtopics] = useState('')
  const [videoType, setVideoType] = useState('tutorial')
  const [optimization, setOptimization] = useState<OptimizeResult | null>(null)

  const seoInput = useMemo<SeoInput>(
    () => ({
      title,
      description,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      primaryKeyword,
      videoType,
      expectedSubtopics: subtopics
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    }),
    [title, description, tags, primaryKeyword, subtopics, videoType],
  )

  const analysis = useMemo(() => scoreSeo(seoInput), [seoInput])

  const hasInput = title.trim().length > 0 || description.trim().length > 0

  function applyDraft(): void {
    if (!optimization) return
    setTitle(optimization.draft.title)
    setDescription(optimization.draft.description)
    setTags(optimization.draft.tags.join(', '))
    setPrimaryKeyword(optimization.draft.primaryKeyword ?? primaryKeyword)
    setOptimization(null)
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">SEO Studio</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
          Scores are deterministic and computed locally. They estimate packaging quality and are not
          a prediction of rankings or views.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
          <h2 className="text-sm font-semibold">Video inputs</h2>

          <div className="mt-3 space-y-3">
            <div>
              <label className={label} htmlFor="seo-title">
                Title
              </label>
              <input id="seo-title" className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="PoE 2 Lightning Arrow Deadeye Build Guide" />
            </div>

            <div>
              <label className={label} htmlFor="seo-desc">
                Description
              </label>
              <textarea id="seo-desc" className={`${input} min-h-28 resize-y`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Write the description you plan to publish…" />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="seo-keyword">
                  Primary keyword
                </label>
                <input id="seo-keyword" className={input} value={primaryKeyword} onChange={(e) => setPrimaryKeyword(e.target.value)} placeholder="poe 2 deadeye" />
              </div>
              <div>
                <label className={label} htmlFor="seo-type">
                  Video type
                </label>
                <select id="seo-type" className={input} value={videoType} onChange={(e) => setVideoType(e.target.value)}>
                  <option value="tutorial">Tutorial</option>
                  <option value="build guide">Build guide</option>
                  <option value="comparison">Comparison</option>
                  <option value="review">Review</option>
                  <option value="news">News</option>
                  <option value="entertainment">Entertainment</option>
                  <option value="troubleshooting">Troubleshooting</option>
                </select>
              </div>
            </div>

            <div>
              <label className={label} htmlFor="seo-tags">
                Tags (comma-separated)
              </label>
              <input id="seo-tags" className={input} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="poe 2, lightning arrow, deadeye, build guide" />
            </div>

            <div>
              <label className={label} htmlFor="seo-subtopics">
                Expected subtopics (comma-separated, optional)
              </label>
              <input id="seo-subtopics" className={input} value={subtopics} onChange={(e) => setSubtopics(e.target.value)} placeholder="lightning arrow, deadeye, gear, bosses" />
            </div>
          </div>
        </section>

        <div className="space-y-5">
          {hasInput ? (
            <>
              <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold">Optimize everything</h2>
                    <p className="mt-1 text-[12px] text-[var(--color-text-secondary)]">
                      Applies deterministic rules to the title, description and tags, then re-scores the
                      result. Runs locally.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOptimization(optimizeSeo(seoInput))}
                    className="shrink-0 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-medium text-[#0b0d10]"
                  >
                    Optimize
                  </button>
                </div>

                {optimization && (
                  <div className="mt-3 space-y-2">
                    <p className="text-[12px] text-[var(--color-text-secondary)]">
                      Score {optimization.before.result.score ?? '—'} →{' '}
                      <span className="font-semibold text-[var(--color-positive)]">
                        {optimization.after.result.score ?? '—'}
                      </span>
                    </p>
                    {optimization.changes.map((change) => (
                      <div key={change.field} className="rounded-md bg-[var(--color-surface-2)] p-3 text-[12px]">
                        <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                          {change.field}
                        </div>
                        <div className="mt-1 whitespace-pre-wrap">{change.to || '(empty)'}</div>
                        <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">{change.reason}</div>
                      </div>
                    ))}
                    <ul className="space-y-1 text-[11px] text-[var(--color-text-muted)]">
                      {optimization.notes.map((note) => (
                        <li key={note}>• {note}</li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={applyDraft}
                      className="rounded-md border border-[var(--color-border-subtle)] px-3 py-1.5 text-[12px]"
                    >
                      Apply to inputs
                    </button>
                  </div>
                )}
              </section>

              <ScorePanel
                title="Video SEO score"
                result={analysis.result}
                source="Locally derived · deterministic engine (docs/SCORING.md §2)"
              />

              <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
                <h2 className="text-sm font-semibold">Detected search intent</h2>
                <p className="mt-1 text-[13px] text-[var(--color-text-secondary)]">
                  {analysis.intent.intent} · {analysis.intent.confidence} confidence
                </p>
                <ul className="mt-2 space-y-1 text-[11px] text-[var(--color-text-muted)]">
                  {analysis.intent.reasons.map((reason) => (
                    <li key={reason}>• {reason}</li>
                  ))}
                </ul>
              </section>

              <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold">High-impact improvements</h2>
                  {analysis.predictedOptimizedScore !== null && (
                    <span className="text-[11px] text-[var(--color-text-muted)]">
                      predicted optimized score {analysis.predictedOptimizedScore}
                    </span>
                  )}
                </div>
                {analysis.recommendations.length === 0 ? (
                  <p className="mt-2 text-[13px] text-[var(--color-text-secondary)]">
                    No high-impact issues detected for the inputs provided.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {analysis.recommendations.map((rec) => (
                      <li key={rec.label} className="flex gap-3 rounded-md bg-[var(--color-surface-2)] p-3">
                        <span className="mt-0.5 w-10 shrink-0 text-right text-[13px] font-semibold tabular-nums text-[var(--color-positive)]">
                          +{rec.delta}
                        </span>
                        <span>
                          <span className="block text-[13px]">{rec.label}</span>
                          <span className="block text-[11px] text-[var(--color-text-muted)]">{rec.rationale}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : (
            <section className="rounded-lg border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-6 text-[13px] text-[var(--color-text-secondary)]">
              Enter a title or description to see the analysis. Nothing is sent anywhere — this runs
              entirely on your machine.
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
