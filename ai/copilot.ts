import { buildAnalyticsOverview, deriveUserTopics } from '../analytics/insights'
import type { Repositories } from '../database/repositories'
import { summarizeComments } from './comment-intelligence'

/**
 * Creator Copilot context (spec §105–107).
 *
 * The copilot never receives raw tables. It gets a compact briefing of
 * **aggregated** values computed locally, plus a strict instruction to use only
 * those numbers. Anything omitted must be reported as "not available" — the
 * model is never invited to invent a metric.
 */
export const COPILOT_SYSTEM_PROMPT = `You are a creator-growth analyst inside a local desktop app.
You are given a CHANNEL BRIEFING of aggregated numbers computed on the user's machine.
Rules:
1. Use ONLY the numbers in the briefing. Never invent or estimate a metric.
2. If something is not in the briefing, say it is "not available" and explain which source would provide it.
3. Scores are heuristic packaging signals, not predictions of rankings or CTR. Do not promise outcomes.
4. Give concrete, actionable advice tied to a number in the briefing.
5. Never suggest bots, fake engagement, purchased views, spam, or anything that breaks platform rules.`

const nf = new Intl.NumberFormat()

function line(label: string, value: string | null): string {
  return `- ${label}: ${value ?? 'not available'}`
}

export interface CopilotBriefing {
  text: string
  /** True when there is at least one stored video or keyword to reason about. */
  hasData: boolean
}

/**
 * Context selector (§59): which briefing sections the creator allows the model
 * to see. Everything defaults ON except knowledge excerpts; the omitted
 * sections are listed so the model can say "not available" instead of guessing.
 */
export interface BriefingContextOptions {
  performance?: boolean
  topVideos?: boolean
  patterns?: boolean
  topics?: boolean
  keywords?: boolean
  comments?: boolean
  profile?: boolean
  knowledge?: boolean
}

export const DEFAULT_CONTEXT: Required<BriefingContextOptions> = {
  performance: true,
  topVideos: true,
  patterns: true,
  topics: true,
  keywords: true,
  comments: true,
  profile: true,
  knowledge: false,
}

/** Testable core that renders only the selected sections. */
export function renderBriefing(
  parts: {
    performance: string[]
    topVideos: string[]
    patterns: string[]
    topics: string[]
    keywords: string[]
    comments: string[]
    profile: string[]
    knowledge: string[]
  },
  selected: BriefingContextOptions,
): string {
  const lines: string[] = ['CHANNEL BRIEFING (aggregated locally from stored data)']
  const sections: Array<[boolean, string, string[]]> = [
    [selected.profile ?? true, 'CREATOR PROFILE (user-stated)', parts.profile],
    [selected.performance ?? true, 'PERFORMANCE', parts.performance],
    [selected.topVideos ?? true, 'TOP VIDEOS', parts.topVideos],
    [selected.patterns ?? true, 'TITLE PATTERNS (association only, sample size shown)', parts.patterns],
    [selected.topics ?? true, 'TOPICS THE CREATOR COVERS (own uploads)', parts.topics],
    [selected.keywords ?? true, 'SAVED KEYWORDS (relative demand only — never absolute volume)', parts.keywords],
    [selected.comments ?? true, 'COMMENT SIGNALS', parts.comments],
    [selected.knowledge ?? false, 'KNOWLEDGE BASE EXCERPTS (creator-supplied documents)', parts.knowledge],
  ]
  const omitted: string[] = []
  for (const [enabled, heading, lines_] of sections) {
    if (!enabled) {
      omitted.push(heading)
      continue
    }
    lines.push(heading)
    lines.push(...lines_)
  }
  if (omitted.length > 0) {
    lines.push(`CONTEXT NOT SHARED BY THE CREATOR: ${omitted.join(', ')} — treat these as not available.`)
  }
  return lines.join('\n')
}

export function buildCopilotBriefing(
  repos: Repositories,
  workspaceId: string,
  options: { knowledgeSnippets?: string[]; context?: BriefingContextOptions } = {},
): CopilotBriefing {
  const overview = buildAnalyticsOverview(repos, workspaceId)
  const videos = repos.listVideos(workspaceId)
  const keywords = repos.listKeywords(workspaceId).slice(0, 12)
  const comments = summarizeComments(repos.listCommentBodies(workspaceId))
  const topics = deriveUserTopics(videos, 10)
  const profile = repos.getCreatorProfile(workspaceId)
  const selected = { ...DEFAULT_CONTEXT, ...(options.context ?? {}) }

  const performance: string[] = [
    line('videos stored', String(overview.videoCount)),
    line('total views', nf.format(overview.totalViews)),
    line('median views', overview.medianViews === null ? null : nf.format(Math.round(overview.medianViews))),
    line(
      'last 30 days vs prior',
      overview.comparison
        ? `${nf.format(overview.comparison.currentViews)} vs ${nf.format(overview.comparison.previousViews)}${
            overview.comparison.changePct === null ? '' : ` (${overview.comparison.changePct.toFixed(1)}%)`
          }`
        : null,
    ),
  ]
  if (overview.health) {
    performance.push(line('channel health score (heuristic)', `${overview.health.score ?? 'not available'}/100 · ${overview.health.confidence} confidence`))
    if (overview.health.missing.length > 0) performance.push(line('health inputs missing', overview.health.missing.join(', ')))
  } else {
    performance.push(line('channel health score', null))
  }
  performance.push('- recurring formats: ' + (overview.series.length > 0 ? overview.series.map((s) => s.format).join(', ') : 'none detected'))

  const topVideos: string[] = []
  for (const video of overview.topVideos.slice(0, 5)) {
    topVideos.push(`- ${video.title}: ${video.views === null ? 'views not available' : `${nf.format(video.views)} views`}`)
  }
  for (const outlier of overview.outliers.slice(0, 5)) {
    topVideos.push(`- outlier: ${outlier.title} at ${outlier.multiple}× median`)
  }
  if (topVideos.length === 0) topVideos.push('- none stored')

  const patterns: string[] = []
  for (const pattern of overview.patterns.slice(0, 5)) {
    patterns.push(
      `- "${pattern.token}": n=${pattern.sample}, lift ${pattern.liftPct === null ? 'not available' : `${pattern.liftPct.toFixed(0)}%`}, ${pattern.confidence} confidence`,
    )
  }
  if (patterns.length === 0) patterns.push('- none')

  const topicsLines = [topics.map((t) => `${t.topic}×${t.count}`).join(', ') || '- none']

  const keywordLines: string[] = []
  for (const keyword of keywords) {
    keywordLines.push(
      `- ${keyword.term}: opportunity ${keyword.opportunity ?? 'not available'}, demand ${keyword.relative_demand ?? 'unknown'}, competition ${keyword.competition_estimate ?? 'unknown'}, intent ${keyword.intent ?? 'unknown'}`,
    )
  }
  if (keywordLines.length === 0) keywordLines.push('- none saved')

  const commentLines: string[] = [line('comments stored', String(comments.total))]
  if (comments.total > 0) {
    commentLines.push(`- categories: ${Object.entries(comments.byCategory).map(([k, v]) => `${k} ${v}`).join(', ')}`)
    for (const request of comments.repeatedRequests.slice(0, 5)) {
      commentLines.push(`- repeated request: "${request.phrase}" ×${request.count}`)
    }
  }

  const profileLines: string[] = []
  if (profile) {
    profileLines.push(line('niche', profile.niche))
    profileLines.push(line('topics', profile.topics.join(', ') || null))
    profileLines.push(line('audience', profile.audience))
    profileLines.push(line('language', profile.language))
    profileLines.push(line('goals', profile.goals.join(', ') || null))
  }

  const knowledgeLines: string[] = []
  for (const snippet of options.knowledgeSnippets ?? []) {
    knowledgeLines.push(`- ${snippet}`)
  }

  let text = renderBriefing(
    {
      performance,
      topVideos,
      patterns,
      topics: topicsLines,
      keywords: keywordLines,
      comments: commentLines,
      profile: profileLines,
      knowledge: knowledgeLines,
    },
    selected,
  )

  text +=
    '\n\nNOT AVAILABLE IN THIS BRIEFING\n- retention curves, CTR, traffic sources, audience demographics (require a YouTube Analytics sync)'

  const hasData = videos.length > 0 || keywords.length > 0 || comments.total > 0 || Boolean(profile)
  if (!hasData) {
    text += '\nNOTE: nothing is stored yet — tell the user to connect and sync a channel first.'
  }

  return { text, hasData }
}
