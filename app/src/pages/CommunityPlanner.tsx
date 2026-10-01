import { useState } from 'react'
import type { JSX } from 'react'
import { IPC } from '../bridge'
import { EmptyState } from '../components/EmptyState'
import { callIpc, useIpc } from '../useIpc'

interface CalendarItem {
  id: string
  kind: string
  title: string | null
  scheduled_at: string | null
  status: string
}

interface GenerateResponse {
  text: string
  providerId: string
  modelId: string
  cached: boolean
}

interface PostDraft {
  hook: string
  body: string
  callToAction: string
}

const POST_TYPES = [
  'poll',
  'question',
  'teaser',
  'behind-the-scenes',
  'clip',
  'update',
  'meme prompt',
  'livestream announcement',
] as const

const input =
  'w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-accent)]'

/**
 * Community Planner (spec §48).
 *
 * Helps the creator draft community posts and schedule them on the local
 * calendar. Posting is manual — the app does not auto-post or auto-comment
 * anywhere (legitimacy rule §2). Drafts must be accurate to real content;
 * the prompt forbids invented metrics like "you asked for this 100 times".
 */
export function CommunityPlanner(): JSX.Element {
  const upcoming = useIpc<CalendarItem[]>('calendar:list')
  const [subject, setSubject] = useState('')
  const [postType, setPostType] = useState<(typeof POST_TYPES)[number]>('question')
  const [context, setContext] = useState('')
  const [draft, setDraft] = useState<PostDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [saveNote, setSaveNote] = useState<string | null>(null)

  async function draftPost(): Promise<void> {
    if (!subject.trim()) return
    setBusy(true)
    setActionError(null)
    try {
      const result = await callIpc<GenerateResponse>(IPC.providersGenerate, {
        task: 'community-post-draft',
        system:
          'You draft community posts for a creator. The post must be accurate to the context provided; never ' +
          'invent statistics ("97% of you asked this") or fake urgency. Keep it honest and specific. Return ' +
          'ONLY JSON: {"hook": string, "body": string, "callToAction": string}',
        input: `Post type: ${postType}\nSubject: ${subject.trim()}\n${
          context.trim() ? `Context from the creator: ${context.trim()}\n` : ''
        }Return the JSON object.`,
        promptName: 'community-post-draft',
        promptVersion: 1,
      })
      setDraft(JSON.parse(result.text) as PostDraft)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Draft failed')
    } finally {
      setBusy(false)
    }
  }

  async function schedule(): Promise<void> {
    if (!draft || !subject.trim()) return
    try {
      await callIpc('calendar:create', {
        kind: 'community-post',
        title: `[${postType}] ${draft.hook.trim() || subject.trim()}`,
        scheduledAt: null,
      })
      setSaveNote('Added to the local calendar as an unscheduled reminder — posting stays manual.')
      upcoming.reload()
    } catch (cause) {
      setSaveNote(cause instanceof Error ? cause.message : 'Could not save to the calendar')
    }
  }

  const communityPosts = (upcoming.data ?? []).filter((item) => item.kind === 'community-post')

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Community Planner</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
          Draft community posts and keep them on the local calendar. Posting is manual by design —
          this app never auto-posts, auto-comments, or mass-messages anywhere.
        </p>
      </header>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="cp-subject">
          What is the post about?
        </label>
        <input
          id="cp-subject"
          className={`${input} mt-1`}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="New league-starter video is live"
        />
        <label className="mt-3 block text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="cp-type">
          Post type
        </label>
        <select
          id="cp-type"
          value={postType}
          onChange={(e) => setPostType(e.target.value as (typeof POST_TYPES)[number])}
          className="mt-1 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px]"
        >
          {POST_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>

        <label className="mt-3 block text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="cp-context">
          Context (optional — real facts only)
        </label>
        <textarea
          id="cp-context"
          className={`${input} mt-1 min-h-20 resize-y`}
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="e.g. tested in standard league, budget was 8 divines, link to the build doc"
        />
        <button
          type="button"
          onClick={() => void draftPost()}
          disabled={busy || !subject.trim()}
          className="mt-2 rounded-md bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[#0b0d10] disabled:opacity-40"
        >
          {busy ? 'Drafting…' : 'Draft a post'}
        </button>
        {actionError && <p className="mt-2 text-[12px] text-[var(--color-danger)]">{actionError}</p>}
      </section>

      {draft && (
        <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
          <h2 className="text-sm font-semibold">Draft</h2>
          <p className="mt-2 text-[13px] font-medium">{draft.hook}</p>
          <p className="mt-1 whitespace-pre-wrap text-[12px] text-[var(--color-text-secondary)]">{draft.body}</p>
          <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">{draft.callToAction}</p>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void schedule()}
              className="rounded-md border border-[var(--color-border-subtle)] px-3 py-1.5 text-[12px]"
            >
              Add to calendar (manual posting)
            </button>
            {saveNote && <span className="text-[11px] text-[var(--color-text-muted)]">{saveNote}</span>}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold">Community posts on your calendar</h2>
        {communityPosts.length === 0 ? (
          <EmptyState
            title="No community posts planned"
            body="Draft one above and add it to the calendar. The calendar is local; nothing is published automatically."
          />
        ) : (
          <ul className="mt-2 space-y-2">
            {communityPosts.map((post) => (
              <li key={post.id} className="rounded-md bg-[var(--color-surface-2)] px-3 py-2 text-[12px]">
                <div className="flex items-center justify-between">
                  <span>{post.title}</span>
                  <span className="text-[var(--color-text-muted)]">
                    {post.scheduled_at ? new Date(post.scheduled_at).toLocaleString() : 'unscheduled'} · {post.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
