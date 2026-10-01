import { useState } from 'react'
import type { JSX } from 'react'
import type { ScoreResult } from '@core/scores/engine'
import { DEFAULT_CHECKLIST, type ChecklistItem } from '@core/writing/checklist'
import { buildStreamPipeline } from '@core/writing/stream-pipeline'
import { IPC } from '../bridge'
import { ScorePanel } from '../components/ScorePanel'
import { callIpc, useIpc } from '../useIpc'

type DiscoveryScore = ScoreResult

interface CategoryComparison {
  category: string
  viewers: number
  channels: number
  viewersPerChannel: number
  observed: boolean
  saturation: number | null
  discovery: DiscoveryScore | null
  fitDetail: string
}

interface OwnStreamSummary {
  totalSessions: number
  medianPeakViewers: number | null
  perCategory: Array<{ category: string; sessions: number; medianPeakViewers: number | null }>
  lastStreamedAt: string | null
}

interface StreamResearchResult {
  connected: boolean
  detail: string
  own: OwnStreamSummary
  categories: CategoryComparison[]
  notes: string[]
}

interface SessionRow {
  id: string
  title: string | null
  category: string | null
  started_at: string | null
  ended_at: string | null
  peak_viewers: number | null
}

const input =
  'w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-accent)]'

interface StreamTitleAssessment {
  score: ScoreResult
  improvements: Array<{ label: string; detail: string; severity: 'high' | 'medium' | 'low' }>
}

const severityColor: Record<'high' | 'medium' | 'low', string> = {
  high: 'var(--color-danger)',
  medium: 'var(--color-warning)',
  low: 'var(--color-text-muted)',
}

const fmt = (n: number | null): string => (n === null ? '—' : n.toLocaleString())

/**
 * Stream Optimizer (spec §41, docs/SCORING.md §5).
 *
 * Compares candidate Twitch categories using ONLY official live data. Helix
 * exposes no platform-wide totals, so numbers are labelled as an observed
 * sample. The discovery score is app-defined and shown with its calculation.
 */
export function StreamOptimizer(): JSX.Element {
  const [categoriesText, setCategoriesText] = useState('')
  const [result, setResult] = useState<StreamResearchResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [syncNote, setSyncNote] = useState<string | null>(null)
  const sessions = useIpc<{ sessions: SessionRow[] }>(IPC.streamsList)

  // --- Stream Title Assistant (§42) ---
  const [titleDraft, setTitleDraft] = useState('')
  const [titleCategory, setTitleCategory] = useState('')
  const [assessment, setAssessment] = useState<StreamTitleAssessment | null>(null)

  // --- Stream → content pipeline (§113) ---
  const [pipelineSessionId, setPipelineSessionId] = useState<string | null>(null)

  // --- Pre-live checklist (§43) ---
  // Checklist comes straight from saved settings (or the default) — derived,
  // never copied into local state on mount, so no setState-in-effect cascade.
  const checklistSaved = useIpc<{ value: ChecklistItem[] | null }>(IPC.settingsGet, { key: 'checklist.items' })
  const [overrides, setOverrides] = useState<{ items?: ChecklistItem[]; checked: Record<string, boolean>; newItem: string }>({
    checked: {},
    newItem: '',
  })
  const checklist = overrides.items ?? checklistSaved.data?.value ?? DEFAULT_CHECKLIST

  function saveChecklist(items: ChecklistItem[]): void {
    setOverrides((current) => ({ ...current, items }))
    void callIpc(IPC.settingsSet, { key: 'checklist.items', value: items }).catch(() => {
      // Settings persistence failing must not block using the checklist.
    })
  }

  async function scoreTitleDraft(): Promise<void> {
    if (!titleDraft.trim()) return
    try {
      const data = await callIpc<StreamTitleAssessment>(IPC.streamTitleScore, {
        title: titleDraft,
        category: titleCategory || undefined,
      })
      setAssessment(data)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not score the title')
    }
  }

  async function research(): Promise<void> {
    const categories = categoriesText
      .split(/[\n,]/)
      .map((c) => c.trim())
      .filter(Boolean)
    if (categories.length === 0) return
    setBusy(true)
    setActionError(null)
    try {
      const data = await callIpc<StreamResearchResult>(IPC.streamCategories, { categories })
      setResult(data)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Category research failed')
    } finally {
      setBusy(false)
    }
  }

  async function syncLive(): Promise<void> {
    setBusy(true)
    setSyncNote(null)
    try {
      const outcome = await callIpc<{ ok: boolean; live?: boolean; error?: string }>(IPC.streamSync)
      setSyncNote(
        outcome.ok
          ? outcome.live
            ? 'Current live session saved.'
            : 'Connected, but this account is not live right now — nothing new to record.'
          : (outcome.error ?? 'Sync failed'),
      )
      sessions.reload()
    } catch (cause) {
      setSyncNote(cause instanceof Error ? cause.message : 'Sync failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Stream Optimizer</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
          Choose what to stream with official Twitch category data and your own recorded sessions.
          Scores are app-defined heuristics — not Twitch metrics and not performance predictions.
        </p>
      </header>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="cat-list">
          Categories to compare (one per line, exact Twitch names)
        </label>
        <textarea
          id="cat-list"
          className={`${input} mt-1 min-h-20 resize-y`}
          value={categoriesText}
          onChange={(e) => setCategoriesText(e.target.value)}
          placeholder={'Path of Exile 2\nJust Chatting\nRetro Gaming'}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void research()}
            disabled={busy || !categoriesText.trim()}
            className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[#0b0d10] disabled:opacity-40"
          >
            {busy ? 'Fetching live data…' : 'Compare categories'}
          </button>
          <button
            type="button"
            onClick={() => void syncLive()}
            disabled={busy}
            className="rounded-md border border-[var(--color-border-subtle)] px-4 py-2 text-[13px] disabled:opacity-40"
          >
            ↻ Record current live session
          </button>
        </div>
        {actionError && <p className="mt-2 text-[12px] text-[var(--color-danger)]">{actionError}</p>}
        {syncNote && <p className="mt-2 text-[12px] text-[var(--color-text-secondary)]">{syncNote}</p>}
      </section>

      {result && result.categories.length > 0 && (
        <section className="space-y-3">
          {result.categories.map((category) => (
            <div key={category.category} className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
              {category.observed ? (
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold">{category.category}</h3>
                    <span className="text-[11px] text-[var(--color-text-muted)]">
                      observed sample · {fmt(category.viewers)} viewers · {fmt(category.channels)} channels ·{' '}
                      {category.viewersPerChannel.toLocaleString()} viewers/channel
                    </span>
                  </div>
                  {category.discovery && (
                    <div className="mt-2">
                      <ScorePanel
                        title={`${category.category} — discovery score`}
                        result={category.discovery}
                        source="Live Twitch data + your stored sessions (docs/SCORING.md §5)"
                      />
                    </div>
                  )}
                  <p className="mt-2 text-[12px] text-[var(--color-text-secondary)]">Fit: {category.fitDetail}</p>
                </>
              ) : (
                <>
                  <h3 className="text-sm font-semibold">{category.category}</h3>
                  <p className="mt-1 text-[12px] text-[var(--color-text-secondary)]">{category.fitDetail}</p>
                </>
              )}
            </div>
          ))}

          <ul className="space-y-1 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4 text-[11px] text-[var(--color-text-muted)]">
            {result.notes.map((note) => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
        </section>
      )}

      {result && result.categories.length === 0 && (
        <section className="rounded-lg border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-6 text-[13px] text-[var(--color-text-secondary)]">
          {result.detail}
        </section>
      )}

      {sessions.data && sessions.data.sessions.length > 0 && (
        <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Your recorded sessions ({sessions.data.sessions.length})</h2>
            <button type="button" onClick={sessions.reload} className="text-[12px] text-[var(--color-accent)] underline-offset-2 hover:underline">
              ↻ Refresh
            </button>
          </div>
          {result && (
            <p className="mt-1 text-[12px] text-[var(--color-text-secondary)]">
              Median peak across sessions: {fmt(result.own.medianPeakViewers)} concurrent
              {result.own.lastStreamedAt ? ` · last streamed ${new Date(result.own.lastStreamedAt).toLocaleDateString()}` : ''}
            </p>
          )}
          <ul className="mt-2 divide-y divide-[var(--color-border-subtle)]">
            {sessions.data.sessions.slice(0, 20).map((session) => (
              <li key={session.id} className="flex items-center justify-between gap-3 py-1.5 text-[12px]">
                <span className="truncate">{session.title ?? '(untitled)'}</span>
                <span className="shrink-0 text-[var(--color-text-muted)]">
                  {session.category ?? 'no category'} ·{' '}
                  {session.ended_at === null ? 'live/ongoing' : 'ended'} · peak {fmt(session.peak_viewers)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
            Peaks are recorded when a sync runs while you are live; ended sessions keep their last known concurrent count.
          </p>
        </section>
      )}

      {sessions.data && sessions.data.sessions.length > 0 && (
        <PipelineSection sessions={sessions.data.sessions} selectedId={pipelineSessionId} onSelect={setPipelineSessionId} />
      )}

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <h2 className="text-sm font-semibold">Stream Title Assistant</h2>
        <p className="mt-1 text-[12px] text-[var(--color-text-secondary)]">
          Live titles are scored for the category browser: what, for whom, and why now. Improvements
          are mechanical rules — not CTR promises.
        </p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_12rem_auto]">
          <input
            className={input}
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            placeholder="PoE 2 0.4 Deadeye testing — road to endgame"
            aria-label="Stream title"
          />
          <input
            className={input}
            value={titleCategory}
            onChange={(e) => setTitleCategory(e.target.value)}
            placeholder="Category (optional)"
            aria-label="Category"
          />
          <button
            type="button"
            onClick={() => void scoreTitleDraft()}
            disabled={!titleDraft.trim()}
            className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[#0b0d10] disabled:opacity-40"
          >
            Score
          </button>
        </div>
        {assessment && (
          <div className="mt-3 space-y-2">
            <ScorePanel title="Stream title" result={assessment.score} source="Locally derived · deterministic live-title engine (docs/SCORING.md §16)" />
            {assessment.improvements.length > 0 && (
              <ul className="space-y-1 text-[12px]">
                {assessment.improvements.map((improvement) => (
                  <li key={improvement.label}>
                    <span style={{ color: severityColor[improvement.severity] }}>+ </span>
                    {improvement.label} — <span className="text-[var(--color-text-muted)]">{improvement.detail}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Pre-live checklist</h2>
          <span className="text-[11px] text-[var(--color-text-muted)]">
            {Object.values(overrides.checked).filter(Boolean).length}/{checklist.length} done · you tick items yourself
          </span>
        </div>
        <ul className="mt-2 space-y-1">
          {checklist.map((item) => (
            <li key={item.id} className="flex items-center gap-2 rounded-md bg-[var(--color-surface-2)] px-3 py-1.5">
              <input
                type="checkbox"
                id={`chk-${item.id}`}
                checked={overrides.checked[item.id] ?? false}
                onChange={(e) => setOverrides((current) => ({ ...current, checked: { ...current.checked, [item.id]: e.target.checked } }))}
              />
              <label htmlFor={`chk-${item.id}`} className="flex-1 text-[12px]">
                {item.label}
              </label>
              <button
                type="button"
                onClick={() => void saveChecklist(checklist.filter((c) => c.id !== item.id))}
                className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
                aria-label={`Remove ${item.label}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <input
            className={input}
            value={overrides.newItem}
            onChange={(e) => setOverrides((current) => ({ ...current, newItem: e.target.value }))}
            placeholder="Add your own item…"
            aria-label="New checklist item"
          />
          <button
            type="button"
            onClick={() => {
              const label = overrides.newItem.trim()
              if (!label) return
              saveChecklist([...checklist, { id: `custom-${Date.now()}`, label }])
              setOverrides((current) => ({ ...current, newItem: '' }))
            }}
            disabled={!overrides.newItem.trim()}
            className="shrink-0 rounded-md border border-[var(--color-border-subtle)] px-3 py-1.5 text-[12px] disabled:opacity-40"
          >
            Add
          </button>
          {checklistSaved.data?.value && (
            <button
              type="button"
              onClick={() => saveChecklist(DEFAULT_CHECKLIST)}
              className="shrink-0 rounded-md border border-[var(--color-border-subtle)] px-3 py-1.5 text-[12px]"
            >
              Reset to default
            </button>
          )}
        </div>
      </section>
    </div>
  )
}

/**
 * Stream → content pipeline (§113). Deterministic, template-driven plan built
 * from one recorded session. It never invents clip timestamps or statistics.
 */
function PipelineSection({
  sessions,
  selectedId,
  onSelect,
}: {
  sessions: SessionRow[]
  selectedId: string | null
  onSelect: (id: string) => void
}): JSX.Element | null {
  const selected = sessions.find((session) => session.id === selectedId) ?? sessions[0]
  if (!selected) return null

  const durationMinutes =
    selected.started_at && selected.ended_at
      ? Math.max(0, Math.round((Date.parse(selected.ended_at) - Date.parse(selected.started_at)) / 60_000))
      : null
  const plan = buildStreamPipeline({
    title: selected.title ?? '',
    category: selected.category,
    durationMinutes,
  })

  return (
    <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Stream → content pipeline</h2>
        <span className="text-[11px] text-[var(--color-text-muted)]">
          {durationMinutes === null ? 'duration unknown' : `${durationMinutes} min recorded`} · aim for {plan.clipTarget} clip(s)
        </span>
      </div>

      <select
        value={selected.id}
        onChange={(e) => onSelect(e.target.value)}
        aria-label="Recorded session to plan from"
        className={`${input} mt-2`}
      >
        {sessions.map((session) => (
          <option key={session.id} value={session.id}>
            {session.title ?? '(untitled)'}{session.category ? ` · ${session.category}` : ''}
          </option>
        ))}
      </select>

      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
        {plan.stages.map((stage) => (
          <div key={stage.stage} className="rounded-md bg-[var(--color-surface-2)] p-3">
            <div className="text-[12px] font-medium">{stage.stage}</div>
            <div className="text-[11px] text-[var(--color-text-muted)]">{stage.goal}</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px] text-[var(--color-text-secondary)]">
              {stage.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="rounded-md bg-[var(--color-surface-2)] p-3">
          <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Short first lines</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px] text-[var(--color-text-secondary)]">
            {plan.shortsFirstLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-md bg-[var(--color-surface-2)] p-3">
          <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Community poll</div>
          <div className="mt-1 text-[12px] font-medium">{plan.poll.question}</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px] text-[var(--color-text-secondary)]">
            {plan.poll.options.map((option) => (
              <li key={option}>{option}</li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-3 text-[12px] text-[var(--color-text-secondary)]">
        Next stream seed: <span className="font-medium">{plan.nextStreamSeed}</span>
      </p>

      <ul className="mt-2 space-y-0.5 text-[11px] text-[var(--color-text-muted)]">
        {plan.notes.map((note) => (
          <li key={note}>• {note}</li>
        ))}
      </ul>
    </section>
  )
}
