import { useState } from 'react'
import type { JSX } from 'react'
import { LINKING_NOTES, type LinkCandidate } from '@core/planning/link-projects'
import { callIpc, useIpc } from '../useIpc'

interface Project {
  id: string
  title: string
  stage: string
  updated_at: string
}

/** The project workflow from spec §123. */
const STAGES = ['idea', 'research', 'script', 'recording', 'editing', 'thumbnail', 'scheduled', 'published']

const input =
  'w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-accent)]'

export function Projects(): JSX.Element {
  const { data, error, loading, reload } = useIpc<Project[]>('projects:list')
  const suggestions = useIpc<LinkCandidate[]>('projects:linkSuggestions')
  const [title, setTitle] = useState('')
  const [stage, setStage] = useState('idea')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [linkNotice, setLinkNotice] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<string[]>([])

  async function create(): Promise<void> {
    if (!title.trim()) return
    setBusy(true)
    setActionError(null)
    try {
      await callIpc('projects:create', { title: title.trim(), stage })
      setTitle('')
      setStage('idea')
      reload()
      suggestions.reload()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not create project')
    } finally {
      setBusy(false)
    }
  }

  async function advance(project: Project, nextStage: string): Promise<void> {
    try {
      await callIpc('projects:updateStage', { id: project.id, stage: nextStage })
      reload()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not update project')
    }
  }

  async function link(candidate: LinkCandidate): Promise<void> {
    setLinkNotice(null)
    try {
      await callIpc('projects:link', { videoId: candidate.videoId, projectId: candidate.projectId })
      setLinkNotice(`Linked “${candidate.projectTitle}” to “${candidate.videoTitle}”.`)
      suggestions.reload()
      reload()
    } catch (cause) {
      setLinkNotice(cause instanceof Error ? cause.message : 'Could not link the video.')
    }
  }

  async function autoLink(): Promise<void> {
    setLinkNotice(null)
    try {
      const result = await callIpc<{ linked: number }>('projects:autoLink')
      setLinkNotice(
        result.linked === 0
          ? 'No confident matches left to apply.'
          : `Linked ${result.linked} confident match(es).`,
      )
      suggestions.reload()
      reload()
    } catch (cause) {
      setLinkNotice(cause instanceof Error ? cause.message : 'Auto-link failed.')
    }
  }

  const visibleSuggestions = (suggestions.data ?? []).filter(
    (candidate) => !dismissed.includes(candidate.videoId),
  )
  const confidentCount = visibleSuggestions.filter((candidate) => candidate.confident).length

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Projects</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
          Every video project stays linked across research, SEO, titles, thumbnails, scripting and
          performance (spec §123), and a published video can be linked back to its project (§124).
        </p>
      </header>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className={input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="New video project title"
            aria-label="New project title"
          />
          <select className={input + ' sm:w-48'} value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Starting stage">
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void create()}
            disabled={busy || !title.trim()}
            className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[#0b0d10] disabled:opacity-40"
          >
            Create
          </button>
        </div>
        {actionError && <p className="mt-2 text-[12px] text-[var(--color-danger)]">{actionError}</p>}
      </section>

      {loading && <p className="text-[13px] text-[var(--color-text-secondary)]">Loading projects…</p>}
      {error && <p className="text-[13px] text-[var(--color-danger)]">{error}</p>}

      {data && data.length === 0 && !loading && (
        <section className="rounded-lg border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-6 text-[13px] text-[var(--color-text-secondary)]">
          No projects yet. Create one above to start tracking a video from idea to published.
        </section>
      )}

      {data && data.length > 0 && (
        <div className="space-y-2">
          {data.map((project) => (
            <article
              key={project.id}
              className="flex flex-col gap-2 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="text-[13px] font-medium">{project.title}</div>
                <div className="text-[11px] text-[var(--color-text-muted)]">updated {new Date(project.updated_at).toLocaleString()}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px]">{project.stage}</span>
                <select
                  className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-2 py-1 text-[12px]"
                  value={project.stage}
                  onChange={(e) => void advance(project, e.target.value)}
                  aria-label={`Stage for ${project.title}`}
                >
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </article>
          ))}
        </div>
      )}

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Link published videos (§124)</h2>
          <button
            type="button"
            onClick={() => void autoLink()}
            disabled={(suggestions.data?.length ?? 0) === 0 || confidentCount === 0}
            className="rounded-md border border-[var(--color-border-subtle)] px-3 py-1.5 text-[12px] disabled:opacity-40"
          >
            Auto-link {confidentCount} confident match(es)
          </button>
        </div>

        {linkNotice && <p className="mt-2 text-[12px] text-[var(--color-text-secondary)]">{linkNotice}</p>}
        {suggestions.error && <p className="mt-2 text-[12px] text-[var(--color-danger)]">{suggestions.error}</p>}

        {suggestions.loading && <p className="mt-2 text-[12px] text-[var(--color-text-secondary)]">Matching titles…</p>}

        {!suggestions.loading && visibleSuggestions.length === 0 && (
          <p className="mt-2 text-[12px] text-[var(--color-text-muted)]">
            No title matches found. Create a project whose title resembles a stored video, or sync
            your channel from Connections — matches only ever come from titles you already have.
          </p>
        )}

        {visibleSuggestions.length > 0 && (
          <ul className="mt-3 space-y-2">
            {visibleSuggestions.map((candidate) => (
              <li
                key={`${candidate.projectId}:${candidate.videoId}`}
                className="rounded-md bg-[var(--color-surface-2)] p-3 text-[12px]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {candidate.confident && (
                    <span className="rounded-sm border border-[var(--color-positive)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-positive)]">
                      Confident
                    </span>
                  )}
                  <span className="tabular-nums text-[var(--color-text-muted)]">
                    {Math.round(candidate.score * 100)}%
                  </span>
                </div>
                <div className="mt-1">
                  <span className="font-medium">{candidate.projectTitle}</span>
                  <span className="text-[var(--color-text-muted)]"> ←→ </span>
                  <span>{candidate.videoTitle}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">{candidate.reason}</div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void link(candidate)}
                    className="rounded-md bg-[var(--color-accent)] px-3 py-1 text-[12px] font-medium text-[#0b0d10]"
                  >                    Link
                  </button>
                  <button
                    type="button"
                    onClick={() => setDismissed((list) => [...list, candidate.videoId])}
                    className="rounded-md border border-[var(--color-border-subtle)] px-3 py-1 text-[12px]"
                  >
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <ul className="mt-3 space-y-0.5 text-[11px] text-[var(--color-text-muted)]">
          {LINKING_NOTES.map((note) => (
            <li key={note}>• {note}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
