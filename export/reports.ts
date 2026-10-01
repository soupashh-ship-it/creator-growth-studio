import { buildAnalyticsOverview } from '../analytics/insights'
import type { Repositories } from '../database/repositories'
import { reportToMarkdown } from './exporters'

/**
 * Report builders (spec §69, §148).
 *
 * Pure and offline so they can run in tests and be exported anywhere. Every
 * section states its provenance, and the header notes that scores are heuristic.
 */
export interface MonthlyReview {
  markdown: string
  generatedAt: string
}

function fmt(value: number | null): string {
  return value === null ? 'Not available' : new Intl.NumberFormat().format(Math.round(value))
}

export function buildMonthlyReview(repos: Repositories, workspaceId: string, now = Date.now()): MonthlyReview {
  const overview = buildAnalyticsOverview(repos, workspaceId, { now })
  const channels = repos.listChannels(workspaceId)
  const keywords = repos.listKeywords(workspaceId).slice(0, 15)
  const generatedAt = new Date(now).toISOString()

  const entries: Array<{ heading: string; lines: string[] }> = []

  entries.push({
    heading: 'Channels',
    lines:
      channels.length === 0
        ? ['_No channel synced._']
        : channels.map(
            (c) => `- **${c.title ?? '(untitled)'}** (${c.platform}) — ${fmt(c.subscriber_count)} subscribers, ${fmt(c.video_count)} videos`,
          ),
  })

  entries.push({
    heading: 'Performance',
    lines: [
      `- Videos stored: ${overview.videoCount}`,
      `- Total views: ${fmt(overview.totalViews)}`,
      `- Median views: ${fmt(overview.medianViews)}`,
      overview.comparison
        ? `- Last 30 days: ${fmt(overview.comparison.currentViews)} vs ${fmt(overview.comparison.previousViews)} prior${
            overview.comparison.changePct === null ? ' (no baseline)' : ` (${overview.comparison.changePct.toFixed(1)}%)`
          }`
        : '- Last 30 days: Not available',
    ],
  })

  entries.push({
    heading: 'Channel health (heuristic)',
    lines: overview.health
      ? [
          `- Score: ${overview.health.score ?? 'Not available'}/100 · ${overview.health.confidence} confidence · input coverage ${Math.round(overview.health.coverage * 100)}%`,
          ...overview.health.explanation.map((line) => `- ${line}`),
          overview.health.missing.length > 0 ? `- Excluded (no data): ${overview.health.missing.join(', ')}` : '- All inputs available.',
        ]
      : ['_Not enough data to compute a score._'],
  })

  entries.push({
    heading: 'Top videos',
    lines: overview.topVideos.length === 0 ? ['_None._'] : overview.topVideos.map((v) => `- ${v.title} — ${fmt(v.views)} views`),
  })

  entries.push({
    heading: 'Outliers (vs channel median)',
    lines: overview.outliers.length === 0 ? ['_None._'] : overview.outliers.map((o) => `- ${o.title} — ${o.multiple}× median`),
  })

  entries.push({
    heading: 'Title patterns (association only)',
    lines:
      overview.patterns.length === 0
        ? ['_Not enough data._']
        : overview.patterns.map(
            (p) =>
              `- "${p.token}" — n=${p.sample}, lift ${p.liftPct === null ? 'Not available' : `${p.liftPct.toFixed(0)}%`}, ${p.confidence} confidence`,
          ),
  })

  entries.push({
    heading: 'Keywords (relative demand only)',
    lines:
      keywords.length === 0
        ? ['_None saved._']
        : keywords.map(
            (k) =>
              `- ${k.term} — opportunity ${k.opportunity ?? 'Not available'}, demand ${k.relative_demand ?? 'unknown'}, competition ${k.competition_estimate ?? 'unknown'}`,
          ),
  })

  entries.push({ heading: 'Caveats', lines: overview.notes.map((note) => `- ${note}`) })

  return {
    generatedAt,
    markdown: reportToMarkdown('Monthly Review', entries, { generatedAt }),
  }
}
