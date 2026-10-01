import { computeMedian } from '../analytics/query'
import type { ScoreResult } from '../core/scores/engine'
import { clamp, lin } from '../core/scores/engine'
import { streamDiscoveryScore } from '../core/scores/stream-discovery'
import type { TwitchCategoryStats } from '../platforms/twitch/client'
import type { StreamRow } from '../database/repositories'

/**
 * Live category research (spec §40–41, docs/SCORING.md §5).
 *
 * All category numbers come from the official Twitch Helix API. Because Helix
 * only exposes live streams page by page, the numbers are an **observed sample
 * lower bound**, never a platform-wide total — the UI must say so. Categories
 * that did not appear in the sample are reported as "not observed" rather than
 * shown as zero.
 */

export const STREAM_RESEARCH_NOTES = [
  'Category viewers/channels are an observed lower bound from a sample of currently-live streams (official Twitch API), not a platform-wide total.',
  'Discovery and fit scores are app-defined heuristics (docs/SCORING.md §5), not Twitch metrics and not a prediction of your performance.',
  'Trend inputs need repeated snapshots over time; they are excluded until then.',
]

export interface OwnStreamSummary {
  totalSessions: number
  medianPeakViewers: number | null
  perCategory: Array<{ category: string; sessions: number; medianPeakViewers: number | null }>
  lastStreamedAt: string | null
}

/** Summarizes the creator's own stored stream sessions (captured during syncs). */
export function summarizeOwnStreams(rows: StreamRow[]): OwnStreamSummary {
  const peaks = rows.map((r) => r.peak_viewers).filter((v): v is number => v !== null && v > 0)
  const byCategory = new Map<string, number[]>()
  for (const row of rows) {
    if (!row.category) continue
    const list = byCategory.get(row.category) ?? []
    if (row.peak_viewers !== null) list.push(row.peak_viewers)
    byCategory.set(row.category, list)
  }

  const lastStarted = rows
    .map((r) => r.started_at)
    .filter((s): s is string => s !== null)
    .sort()

  return {
    totalSessions: rows.length,
    medianPeakViewers: computeMedian(peaks),
    perCategory: [...byCategory.entries()]
      .map(([category, list]) => ({
        category,
        sessions: rows.filter((r) => r.category === category).length,
        medianPeakViewers: list.length > 0 ? computeMedian(list) : null,
      }))
      .sort((a, b) => b.sessions - a.sessions || a.category.localeCompare(b.category)),
    lastStreamedAt: lastStarted.length > 0 ? (lastStarted[lastStarted.length - 1] ?? null) : null,
  }
}

export interface CategoryComparison {
  category: string
  /** Observed viewers within the scanned live sample (lower bound). */
  viewers: number
  /** Observed live channels within the scanned sample. */
  channels: number
  viewersPerChannel: number
  observed: boolean
  /** 0–100, higher = more crowded. Null when not observed. */
  saturation: number | null
  /** App-defined discovery score with its full explanation. */
  discovery: ScoreResult | null
  fitDetail: string
}

export interface CategoryComparisonOptions {
  /** Defaults to the current time (unused today; kept for deterministic tests). */
  now?: number
}

/**
 * Compares candidate categories using the discovery score. Categories that were
 * not observed in the live sample are kept with a null score and an honest
 * explanation instead of a fabricated zero.
 */
export function compareCategories(
  stats: TwitchCategoryStats[],
  own: OwnStreamSummary,
  _options: CategoryComparisonOptions = {},
): CategoryComparison[] {
  const totalSessions = own.totalSessions

  return stats
    .map((stat) => {
      if (!stat.observed) {
        return {
          category: stat.gameName,
          viewers: 0,
          channels: 0,
          viewersPerChannel: 0,
          observed: false,
          saturation: null,
          discovery: null,
          fitDetail: `Not observed in the live sample of ${stat.sampleSize} streams — smaller categories can be invisible in top-streamer samples. This is not "zero viewers".`,
        }
      }

      const saturation = clamp(lin(stat.channels, 200, 8000))
      const ratio = stat.viewersPerChannel

      // Familiarity: what share of the creator's stored sessions were in this
      // category (0–100). Null when nothing is stored yet.
      const sessionsHere = own.perCategory.find((c) => c.category === stat.gameName)?.sessions ?? 0
      const creatorHistory = totalSessions > 0 ? (sessionsHere / totalSessions) * 100 : null

      // Size fit: a big viewer/channel ratio is usually dominated by very large
      // streamers. Fit falls as the ratio exceeds a few times the creator's own
      // median concurrent viewers.
      const median = own.medianPeakViewers
      const channelSizeFit =
        median !== null && median > 0 && ratio > 0
          ? clamp(100 - lin(ratio / median, 3, 60))
          : null

      const discovery = streamDiscoveryScore({
        viewers: stat.viewers,
        channels: stat.channels,
        creatorHistory,
        channelSizeFit,
        trend: null,
      })

      const fitParts: string[] = []
      if (creatorHistory !== null) {
        fitParts.push(
          sessionsHere === 0
            ? 'you have no stored sessions in this category yet'
            : `${sessionsHere} of your ${totalSessions} stored sessions were here`,
        )
      }
      if (channelSizeFit !== null) {
        fitParts.push(
          `${Math.round(ratio)} viewers/channel vs your median ${median} concurrent`,
        )
      }

      return {
        category: stat.gameName,
        viewers: stat.viewers,
        channels: stat.channels,
        viewersPerChannel: Math.round(ratio * 10) / 10,
        observed: true,
        saturation,
        discovery,
        fitDetail: fitParts.length > 0 ? fitParts.join(' · ') : 'Connect and sync Twitch while live to add personal fit inputs.',
      }
    })
    .sort((a, b) => {
      const scoreA = a.discovery?.score ?? -1
      const scoreB = b.discovery?.score ?? -1
      return scoreB - scoreA || a.category.localeCompare(b.category)
    })
}
