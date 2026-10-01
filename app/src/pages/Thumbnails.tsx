import { useState } from 'react'
import type { JSX } from 'react'
import type { ScoreResult } from '@core/scores/engine'
import { IPC } from '../bridge'
import { callIpc } from '../useIpc'
import { ScorePanel } from '../components/ScorePanel'

interface PixelFeatures {
  brightness: number
  saturation: number
  uniqueColorCount: number
  edgeDensity: number
  samples: number
  focalPointStrength: number
  contrast: number
  clutter: number
  hierarchy: number
  colorSeparation: number
  objectSizeRatio: number
  faceVisible: boolean
  textHeightPct: number | null
}

interface ThumbnailAnalysis {
  ok: boolean
  canceled?: boolean
  error?: string
  filePath?: string
  width?: number
  height?: number
  features?: PixelFeatures
  score?: ScoreResult
  issues?: { strengths: string[]; problems: string[]; textTooSmall: boolean }
  pair?: { duplicates: boolean; overlap: number; recommendation: string; suggestions: string[] } | null
}

const input =
  'w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-accent)]'

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[var(--color-surface-2)] p-3">
      <div className="text-[15px] font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-[var(--color-text-muted)]">{label}</div>
    </div>
  )
}

/**
 * Thumbnail Intelligence (spec §16–17).
 *
 * The image is decoded locally and scored from its actual pixels. Face detection
 * and OCR are not bundled, so those dimensions are reported as "Not available"
 * rather than guessed (spec §66, §93).
 */
export function Thumbnails(): JSX.Element {
  const [title, setTitle] = useState('')
  const [thumbnailText, setThumbnailText] = useState('')
  const [analysis, setAnalysis] = useState<ThumbnailAnalysis | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function analyze(): Promise<void> {
    setBusy(true)
    setActionError(null)
    try {
      const result = await callIpc<ThumbnailAnalysis>(IPC.thumbnailsAnalyze, {
        title: title || undefined,
        thumbnailText: thumbnailText || undefined,
      })
      if (!result.ok && !result.canceled) setActionError(result.error ?? 'Could not analyse the image.')
      if (!result.canceled) setAnalysis(result)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not analyse the image.')
    } finally {
      setBusy(false)
    }
  }

  const features = analysis?.features

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Thumbnails</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
          Scores come from the image's actual pixels, computed on this machine. Nothing is uploaded,
          and dimensions the app cannot measure are labelled "Not available".
        </p>
      </header>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="thumb-title">
              Video title (optional, for the pair check)
            </label>
            <input id="thumb-title" className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lightning Arrow Deadeye Is INSANE" />
          </div>
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="thumb-text">
              Text on the thumbnail (optional)
            </label>
            <input id="thumb-text" className={input} value={thumbnailText} onChange={(e) => setThumbnailText(e.target.value)} placeholder="20 DIVINES" />
          </div>
        </div>
        <button
          type="button"
          onClick={() => void analyze()}
          disabled={busy}
          className="mt-3 rounded-md bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[#0b0d10] disabled:opacity-40"
        >
          {busy ? 'Analysing…' : 'Choose image & analyse'}
        </button>
        {actionError && <p className="mt-2 text-[12px] text-[var(--color-danger)]">{actionError}</p>}
      </section>

      {analysis?.ok && analysis.score && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <div className="space-y-3">
            <ScorePanel
              title="Thumbnail score"
              result={analysis.score}
              source="Locally derived · pixel analysis (docs/SCORING.md §4)"
            />
            <p className="text-[11px] text-[var(--color-text-muted)]">
              {analysis.filePath ? `${analysis.filePath.split(/[\\/]/).pop()} · ` : ''}
              {analysis.width}×{analysis.height} px
            </p>
          </div>

          <div className="space-y-3">
            {analysis.issues && (
              <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
                <h2 className="text-sm font-semibold">Findings</h2>
                {analysis.issues.strengths.length > 0 && (
                  <ul className="mt-2 space-y-1 text-[12px] text-[var(--color-positive)]">
                    {analysis.issues.strengths.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                )}
                {analysis.issues.problems.length === 0 ? (
                  <p className="mt-2 text-[12px] text-[var(--color-text-secondary)]">No structural problems detected.</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-[12px] text-[var(--color-warning)]">
                    {analysis.issues.problems.map((item) => (
                      <li key={item}>! {item}</li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
                  Text and face detection are not bundled — those dimensions stay "Not available".
                </p>
              </section>
            )}

            {analysis.pair && (
              <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
                <h2 className="text-sm font-semibold">Title ↔ thumbnail pair</h2>
                <p className="mt-1 text-[13px] text-[var(--color-text-secondary)]">{analysis.pair.recommendation}</p>
                <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                  overlap {Math.round(analysis.pair.overlap * 100)}% · {analysis.pair.duplicates ? 'repeats' : 'complements'} the title
                </p>
              </section>
            )}

            {features && (
              <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
                <h2 className="text-sm font-semibold">Extracted features</h2>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Stat label="Brightness" value={Math.round(features.brightness).toString()} />
                  <Stat label="Saturation" value={`${Math.round(features.saturation)}%`} />
                  <Stat label="Colours" value={features.uniqueColorCount.toString()} />
                  <Stat label="Edges" value={Math.round(features.edgeDensity).toString()} />
                  <Stat label="Object size" value={`${Math.round(features.objectSizeRatio * 100)}%`} />
                  <Stat label="Face" value={features.faceVisible ? 'Yes' : 'Not available'} />
                </div>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
