import type { ScoreResult } from '../scores/engine'
import { clamp, combine, lin, type ScoreComponent } from '../scores/engine'
import type { Repositories } from '../../database/repositories'
import { buildAnalyticsOverview } from '../../analytics/insights'

/**
 * Weekly plan & "What should I do now?" (spec §149–150, docs/SCORING.md §18).
 *
 * Both are computed from local stored state only: calendar items, project
 * stages, upload history and goals from the creator profile. Each suggestion
 * carries its reasons; nothing predicts outcomes. When there is nothing to
 * reason from, the result says so.
 */
export interface PlanTask {
  day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'
  label: string
  reason: string
  /** Where the user acts on this (nav page), when applicable. */
  linkPage?: string
}

export interface WeeklyPlan {
  tasks: PlanTask[]
  basis: string[]
}

const DAY_ORDER: PlanTask['day'][] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function buildWeeklyPlan(repos: Repositories, workspaceId: string): WeeklyPlan {
  const items = repos.listCalendarItems(workspaceId)
  const projects = repos.listProjects(workspaceId)
  const profile = repos.getCreatorProfile(workspaceId)
  const videos = repos.listVideos(workspaceId, 30)

  const tasks: PlanTask[] = []
  const basis: string[] = []

  // 1. Move existing calendar items into the week, by their scheduled day.
  for (const item of items.slice(0, 7)) {
    if (!item.scheduled_at) continue
    const date = new Date(item.scheduled_at)
    if (Number.isNaN(date.getTime())) continue
    const dayIndex = (date.getDay() + 6) % 7 // Mon = 0
    const day = DAY_ORDER[dayIndex]
    if (!day) continue
    const label = item.title ?? '(untitled)'
    tasks.push({ day, label: `${item.kind}: ${label}`, reason: 'already on your calendar' })
  }

  // 2. Research slot early in the week if keywords exist (publish research →
  // record → edit pipeline ordering).
  const keywords = repos.listKeywords(workspaceId).slice(0, 3)
  if (keywords.length > 0 && !tasks.some((t) => t.label.startsWith('research'))) {
    tasks.push({
      day: 'Mon',
      label: `Research: ${keywords[0]?.term ?? 'saved keyword'}`,
      reason: 'highest-opportunity saved keyword',
      linkPage: 'Keywords',
    })
  }

  // 3. Stalled projects get an editing/recording slot.
  const stalled = projects.filter((p) => p.stage !== 'published').slice(0, 2)
  for (const project of stalled) {
    tasks.push({
      day: stalled.indexOf(project) === 0 ? 'Tue' : 'Wed',
      label: `${project.stage === 'idea' || project.stage === 'research' ? 'Record' : 'Advance'}: ${project.title}`,
      reason: `project is at "${project.stage}" stage`,
      linkPage: 'Projects',
    })
  }

  // 4. Goal-based community/shorts slots.
  const goals = profile?.goals ?? []
  const wantsShorts = goals.some((g) => /short|reach|subscriber/i.test(g))
  if (wantsShorts) {
    tasks.push({ day: 'Thu', label: 'Cut one Short from your latest video', reason: 'goal mentions subscribers/reach; shorts broaden reach', linkPage: 'Shorts' })
  }

  // 5. Analytics review day if there is data to review.
  if (videos.length > 0) {
    tasks.push({ day: 'Sun', label: 'Review analytics & plan next week', reason: `${videos.length} videos stored — a review closes the loop`, linkPage: 'Channel' })
  }

  if (tasks.length === 0) {
    basis.push('Nothing to plan from yet: no calendar items, projects, keywords or goals stored.')
    tasks.push({ day: 'Mon', label: 'Save your first keyword or add a calendar item', reason: 'the planner needs at least one input', linkPage: 'Keywords' })
  } else {
    basis.push(`${items.length} calendar item(s), ${projects.length} project(s), ${keywords.length} keyword(s), ${goals.length} goal(s).`)
  }
  basis.push('The plan orders what already exists locally — it does not invent best times or predict results.')

  const sortIndex = (t: PlanTask): number => DAY_ORDER.indexOf(t.day)
  tasks.sort((a, b) => sortIndex(a) - sortIndex(b))

  return { tasks, basis }
}

export interface PriorityTask {
  headline: string
  why: string[]
  score: ScoreResult | null
  linkPage?: string
}

/**
 * "What should I work on?" (§150) — the single highest-value task, scored by
 * urgency (deadline proximity), project completion, and data availability.
 */
export function findHighestValueTask(repos: Repositories, workspaceId: string, now: number = Date.now()): PriorityTask | null {
  const items = repos.listCalendarItems(workspaceId)
  const projects = repos.listProjects(workspaceId)
  const videos = repos.listVideos(workspaceId, 50)
  const overview = buildAnalyticsOverview(repos, workspaceId)

  const candidates: Array<PriorityTask & { priority: number }> = []

  for (const item of items) {
    if (!item.scheduled_at) continue
    const when = new Date(item.scheduled_at).getTime()
    if (Number.isNaN(when)) continue
    const hoursAway = (when - now) / 3_600_000
    if (hoursAway < -1 || hoursAway > 72) continue
    const urgency = clamp(100 - lin(hoursAway, 0, 72))
    const components: ScoreComponent[] = [
      { key: 'urgency', label: 'Deadline proximity', weight: 60, value: urgency, detail: `${Math.max(0, Math.round(hoursAway))}h from now` },
      { key: 'preparedness', label: 'Preparation', weight: 40, value: item.status === 'idea' ? 20 : 60, detail: `calendar status "${item.status}"` },
    ]
    candidates.push({
      headline: `Prepare "${item.title ?? item.kind}" (scheduled ${new Date(when).toLocaleString()})`,
      why: [`on the calendar in ${Math.max(0, Math.round(hoursAway))} hours`, `status is "${item.status}"`],
      score: combine(components),
      linkPage: 'Calendar',
      priority: urgency,
    })
  }

  for (const project of projects) {
    if (project.stage === 'published') continue
    const near = items.some(
      (i) => i.title === project.title && i.scheduled_at && Math.abs(new Date(i.scheduled_at).getTime() - now) < 7 * 24 * 3_600_000,
    )
    const components: ScoreComponent[] = [
      { key: 'deadline', label: 'Linked calendar deadline', weight: 45, value: near ? 80 : 25, detail: near ? 'scheduled within a week' : 'no scheduled date' },
      { key: 'stage', label: 'How early the stage is', weight: 35, value: clamp(lin(['idea', 'research', 'seo', 'title', 'thumbnail', 'script'].indexOf(project.stage), 0, 5) ), detail: `at "${project.stage}"` },
      { key: 'momentum', label: 'Channel momentum', weight: 20, value: overview.videoCount > 0 ? 60 : 20, detail: overview.videoCount > 0 ? `${overview.videoCount} videos stored` : 'no synced data yet' },
    ]
    candidates.push({
      headline: `Advance "${project.title}" — currently at ${project.stage}`,
      why: [`project stage "${project.stage}"`, near ? 'scheduled within a week' : 'not scheduled yet'],
      score: combine(components),
      linkPage: 'Projects',
      priority: near ? 70 : 30,
    })
  }

  // Publishing gap: the creator has not published in 14+ days despite history.
  const lastPublished = videos.map((v) => v.published_at).filter((v): v is string => v !== null).sort().at(-1)
  if (lastPublished) {
    const daysSince = (now - new Date(lastPublished).getTime()) / 86_400_000
    if (daysSince > 14) {
      candidates.push({
        headline: 'Publish something this week',
        why: [`last upload was ${Math.round(daysSince)} days ago`, 'consistency is the strongest lever you control'],
        score: null,
        linkPage: 'Projects',
        priority: clamp(daysSince),
      })
    }
  }

  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.priority - a.priority)
  const best = candidates[0]
  if (!best) return null
  return { headline: best.headline, why: best.why, score: best.score, linkPage: best.linkPage }
}
