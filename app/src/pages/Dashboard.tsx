import { useState } from 'react'
import type { JSX } from 'react'
import type { ScoreResult } from '@core/scores/engine'
import { IPC } from '../bridge'
import { callIpc, useIpc } from '../useIpc'
import { ScorePanel } from '../components/ScorePanel'

async function callPlan(): Promise<WeeklyPlan> {
  return callIpc<WeeklyPlan>(IPC.planWeekly)
}

interface PriorityTask {
  headline: string
  why: string[]
  linkPage?: string
}

interface PlanTask {
  day: string
  label: string
  reason: string
  linkPage?: string
}

interface WeeklyPlan {
  tasks: PlanTask[]
  basis: string[]
}

interface DashboardSummary {
  channels: Array<{
    platform: string
    title: string
    subscriberCount: number | null
    videoCount: number | null
    viewCount: number | null
    fetchedAt: string | null
  }>
  connections: Array<{ platform: string; status: string; lastCheckedAt: string | null }>
  videoSummary: { count: number; totalViews: number; averageViews: number | null; medianViews: number | null } | null
  recentVideos: Array<{
    title: string
    platform: string
    publishedAt: string | null
    views: number | null
    likes: number | null
    comments: number | null
  }>
  health: ScoreResult | null
  healthNote: string | null
  lastSyncedAt: string | null
}

const nf = new Intl.NumberFormat()

function formatCount(value: number | null): string {
  return value === null ? 'Not available' : nf.format(value)
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[var(--color-surface-2)] p-3">
      <div className="text-[18px] font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-[var(--color-text-muted)]">{label}</div>
    </div>
  )
}

/**
 * Dashboard (spec §10, §11).
 *
 * Shows real values only. With no channel connected it renders the honest empty
 * state ("Connect YouTube to view analytics") rather than placeholder numbers
 * (spec §10, §66, §93).
 */
export function Dashboard({ onNavigate }: { onNavigate: (page: string) => void }): JSX.Element {
  const { data, error, loading, reload } = useIpc<DashboardSummary>('dashboard:summary')
  const nextTask = useIpc<PriorityTask | null>(IPC.planNextTask)
  const [plan, setPlan] = useState<WeeklyPlan | null>(null)
  const [planLoading, setPlanLoading] = useState(false)
  const [planError, setPlanError] = useState<string | null>(null)

  async function generatePlan(): Promise<void> {
    setPlanLoading(true)
    setPlanError(null)
    try {
      setPlan(await callPlan())
    } catch (cause) {
      setPlanError(cause instanceof Error ? cause.message : 'Could not build the plan.')
    } finally {
      setPlanLoading(false)
    }
  }

  const hasChannel = (data?.channels.length ?? 0) > 0

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
            Channel health, performance and opportunities from the accounts you connected.
          </p>
        </div>
        <button
          type="button"
          onClick={reload}
          className="rounded-md border border-[var(--color-border-subtle)] px-3 py-1.5 text-[12px]"
        >
          ↻ Refresh
        </button>
      </header>

      {error && (
        <section className="rounded-lg border border-[var(--color-danger)] bg-[var(--color-surface-1)] p-4 text-[13px]">
          {error}
        </section>
      )}

      {!hasChannel && !loading && (
        <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-5">
          <h2 className="text-sm font-semibold">Channel Health</h2>
          <p className="mt-2 text-[13px] text-[var(--color-text-secondary)]">
            Connect YouTube to view analytics. If your channel is already connected, sync it from the
            Connections page to pull its data in.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('Connections')}
            className="mt-3 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-medium text-[#0b0d10]"
          >
            Open Connections
          </button>
        </section>
      )}

      {hasChannel && data && (
        <>
          <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Channels</h2>
              {data.lastSyncedAt && (
                <span className="text-[11px] text-[var(--color-text-muted)]">
                  last synced {new Date(data.lastSyncedAt).toLocaleString()}
                </span>
              )}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.channels.map((channel) => (
                <article
                  key={`${channel.platform}:${channel.title}`}
                  className="rounded-md border border-[var(--color-border-subtle)] p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-medium">{channel.title}</span>
                    <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] uppercase tracking-wide">
                      {channel.platform}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-[var(--color-text-muted)]">
                    <div>
                      <div className="tabular-nums text-[var(--color-text-primary)]">
                        {formatCount(channel.subscriberCount)}
                      </div>
                      subscribers
                    </div>
                    <div>
                      <div className="tabular-nums text-[var(--color-text-primary)]">
                        {formatCount(channel.videoCount)}
                      </div>
                      videos
                    </div>
                    <div>
                      <div className="tabular-nums text-[var(--color-text-primary)]">
                        {formatCount(channel.viewCount)}
                      </div>
                      views
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {data.videoSummary && (
            <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
              <h2 className="text-sm font-semibold">Stored performance</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Videos tracked" value={String(data.videoSummary.count)} />
                <Stat label="Total views" value={nf.format(data.videoSummary.totalViews)} />
                <Stat
                  label="Average views"
                  value={data.videoSummary.averageViews === null ? '—' : nf.format(Math.round(data.videoSummary.averageViews))}
                />
                <Stat
                  label="Median views"
                  value={data.videoSummary.medianViews === null ? '—' : nf.format(Math.round(data.videoSummary.medianViews))}
                />
              </div>
            </section>
          )}

          {data.health && (
            <div className="space-y-2">
              <ScorePanel
                title="Channel health"
                result={data.health}
                source="Locally derived · deterministic engine (docs/SCORING.md §1)"
              />
              {data.healthNote && (
                <p className="text-[11px] text-[var(--color-text-muted)]">{data.healthNote}</p>
              )}
            </div>
          )}

          {data.recentVideos.length > 0 && (
            <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
              <h2 className="text-sm font-semibold">Recent uploads</h2>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left text-[12px]">
                  <thead className="text-[var(--color-text-muted)]">
                    <tr>
                      <th className="py-1 pr-4">Title</th>
                      <th className="py-1 pr-4">Published</th>
                      <th className="py-1 pr-4 text-right">Views</th>
                      <th className="py-1 pr-4 text-right">Likes</th>
                      <th className="py-1 pr-4 text-right">Comments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentVideos.map((video, index) => (
                      <tr key={`${video.title}-${index}`} className="border-t border-[var(--color-border-subtle)]">
                        <td className="py-1 pr-4">{video.title}</td>
                        <td className="py-1 pr-4 text-[var(--color-text-muted)]">
                          {video.publishedAt ? new Date(video.publishedAt).toLocaleDateString() : 'Not available'}
                        </td>
                        <td className="py-1 pr-4 text-right tabular-nums">{video.views === null ? '—' : nf.format(video.views)}</td>
                        <td className="py-1 pr-4 text-right tabular-nums">{video.likes === null ? '—' : nf.format(video.likes)}</td>
                        <td className="py-1 pr-4 text-right tabular-nums">{video.comments === null ? '—' : nf.format(video.comments)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">What should I work on?</h2>
            {nextTask.data ? (
              <>
                <p className="mt-1 text-[13px]">{nextTask.data.headline}</p>
                <ul className="mt-1 space-y-0.5 text-[12px] text-[var(--color-text-secondary)]">
                  {nextTask.data.why.map((reason) => (
                    <li key={reason}>• {reason}</li>
                  ))}
                </ul>
                {nextTask.data.linkPage && (
                  <button
                    type="button"
                    onClick={() => onNavigate(nextTask.data!.linkPage!)}
                    className="mt-2 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-medium text-[#0b0d10]"
                  >
                    Open {nextTask.data.linkPage}
                  </button>
                )}
              </>
            ) : (
              <p className="mt-1 text-[13px] text-[var(--color-text-secondary)]">
                {nextTask.loading
                  ? 'Thinking…'
                  : 'Nothing actionable yet — add a project or calendar item and sync a channel.'}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">My week</h2>
          <button
            type="button"
            onClick={() => void generatePlan()}
            disabled={planLoading}
            className="rounded-md border border-[var(--color-border-subtle)] px-3 py-1.5 text-[12px] disabled:opacity-40"
          >
            {planLoading ? 'Building…' : plan ? '↻ Rebuild plan' : 'Generate my week'}
          </button>
        </div>
        {planError && <p className="mt-2 text-[12px] text-[var(--color-danger)]">{planError}</p>}
        {plan && (
          <>
            <ul className="mt-2 space-y-1">
              {plan.tasks.map((task, index) => (
                <li key={index} className="flex items-start justify-between gap-3 rounded-md bg-[var(--color-surface-2)] px-3 py-1.5 text-[12px]">
                  <span>
                    <span className="font-medium">{task.day}</span> · {task.label}
                  </span>
                  <span className="shrink-0 text-[11px] text-[var(--color-text-muted)]">{task.reason}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">{plan.basis.join(' ')}</p>
          </>
        )}
        {!plan && !planLoading && (
          <p className="mt-2 text-[12px] text-[var(--color-text-secondary)]">
            Builds a Mon–Sun plan from your calendar, projects, keywords and goals — computed locally.
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
          <h2 className="text-sm font-semibold">Works offline</h2>
          <p className="mt-2 text-[13px] text-[var(--color-text-secondary)]">
            SEO analysis, title scoring, keyword reasoning and the content calendar work with no
            account and no network. Try{' '}
            <button
              type="button"
              className="text-[var(--color-accent)] underline-offset-2 hover:underline"
              onClick={() => onNavigate('SEO Studio')}
            >
              SEO Studio
            </button>
            .
          </p>
        </section>

        <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
          <h2 className="text-sm font-semibold">Data stays local</h2>
          <p className="mt-2 text-[13px] text-[var(--color-text-secondary)]">
            Analytics are stored only in a local SQLite file. Back it up any time from{' '}
            <button
              type="button"
              className="text-[var(--color-accent)] underline-offset-2 hover:underline"
              onClick={() => onNavigate('Data')}
            >
              Data
            </button>
            .
          </p>
        </section>
      </div>
    </div>
  )
}
