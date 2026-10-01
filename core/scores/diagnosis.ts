import type { VideoRow } from '../../database/repositories'

/**
 * Early performance diagnosis (spec §53).
 *
 * Reads the creator's stored snapshot metrics for a published video and turns
 * them into a structured interpretation — which stage (packaging vs. content
 * vs. discovery) most likely limits performance. Every output is a hypothesis
 * with its evidence; nothing claims causation (spec §28, §66).
 */

export interface DiagnosisMetrics {
  videoId: string
  title: string | null
  /** Impressions served, or null when the analytics sync has not stored it. */
  impressions: number | null
  /** Click-through rate in percent (0–100), or null. */
  ctr: number | null
  /** Average percentage of the video viewed (0–100), or null. */
  avgViewPercent: number | null
  views: number | null
  /** Channel median CTR / avg-view-percent from the same snapshots, or null. */
  medianCtr: number | null
  medianAvgViewPercent: number | null
  medianViews: number | null
}

export interface DiagnosisFinding {
  stage: 'packaging' | 'content' | 'discovery' | 'healthy' | 'insufficient-data'
  /** One-line interpretation, phrased as a hypothesis. */
  summary: string
  evidence: string[]
  /** Suggested next actions the user performs manually (§54). */
  actions: string[]
}

interface SnapshotLike {
  video_id: string
  impressions?: number | null
  ctr?: number | null
  avg_view_percent?: number | null
}

function med(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const hi = sorted[mid] ?? 0
  if (sorted.length % 2 !== 0) return hi
  const lo = mid > 0 ? sorted[mid - 1] ?? hi : hi
  return (lo + hi) / 2
}

/**
 * Builds the diagnosis inputs from stored analytics snapshot rows.
 *
 * Pass ALL per-video latest rows (the video's own included). The channel
 * baseline (median CTR / avg-view %) is computed from the OTHER videos so a
 * video is never compared against itself; with no baseline the engine falls
 * back to conservative absolute thresholds. Anything absent stays null and the
 * diagnosis reports `insufficient-data` instead of guessing (spec §66).
 */
export function buildDiagnosisMetrics(
  video: Pick<VideoRow, 'id' | 'title' | 'views'>,
  snapshots: SnapshotLike[],
): DiagnosisMetrics {
  const own = snapshots.filter((s) => s.video_id === video.id)
  const others = snapshots.filter((s) => s.video_id !== video.id)
  const withCtr = others.filter((s) => typeof s.ctr === 'number').map((s) => s.ctr as number)
  const withAvp = others
    .filter((s) => typeof s.avg_view_percent === 'number')
    .map((s) => s.avg_view_percent as number)
  const latest = own.length > 0 ? (own[own.length - 1] ?? null) : null
  return {
    videoId: video.id,
    title: video.title,
    views: video.views,
    impressions: latest?.impressions ?? null,
    ctr: latest?.ctr ?? null,
    avgViewPercent: latest?.avg_view_percent ?? null,
    medianCtr: med(withCtr),
    medianAvgViewPercent: med(withAvp),
    medianViews: video.views !== null ? med([video.views]) : null,
  }
}

/**
 * Compares a video's packaging/content signals against channel medians.
 *
 * Thresholds are relative to the channel's own baseline, never absolute
 * platform claims: "weak CTR" means weak *for this channel*.
 */
export function diagnosePerformance(m: DiagnosisMetrics): DiagnosisFinding {
  const evidence: string[] = []

  if (m.ctr === null && m.avgViewPercent === null) {
    return {
      stage: 'insufficient-data',
      summary:
        'Not enough stored metrics to diagnose. Run “Sync YouTube Analytics” (Impressions/CTR/retention) and let background snapshots accumulate.',
      evidence: ['CTR: Not available', 'Average view percentage: Not available'],
      actions: ['Connect YouTube and run the analytics sync, then revisit this video after a few snapshots.'],
    }
  }

  if (m.ctr !== null) {
    evidence.push(`CTR ${m.ctr.toFixed(1)}%${m.medianCtr !== null ? ` vs channel median ${m.medianCtr.toFixed(1)}%` : ''}`)
  }
  if (m.avgViewPercent !== null) {
    evidence.push(
      `Average view ${m.avgViewPercent.toFixed(0)}%${m.medianAvgViewPercent !== null ? ` vs channel median ${m.medianAvgViewPercent.toFixed(0)}%` : ''}`,
    )
  }

  const ctrWeak = m.ctr !== null && (m.medianCtr === null ? m.ctr < 3 : m.ctr < m.medianCtr * 0.85)
  const ctrStrong = m.ctr !== null && (m.medianCtr === null ? m.ctr >= 6 : m.ctr >= m.medianCtr * 1.1)
  const retentionWeak =
    m.avgViewPercent !== null &&
    (m.medianAvgViewPercent === null ? m.avgViewPercent < 35 : m.avgViewPercent < m.medianAvgViewPercent * 0.85)
  const retentionStrong =
    m.avgViewPercent !== null &&
    (m.medianAvgViewPercent === null ? m.avgViewPercent >= 45 : m.avgViewPercent >= m.medianAvgViewPercent * 1.05)

  if (ctrWeak && retentionStrong) {
    return {
      stage: 'packaging',
      summary:
        'People who click generally watch, but fewer people are clicking — the limiting stage looks like the packaging (title/thumbnail).',
      evidence,
      actions: [
        'Test a new title in Titles (A/B lab) before changing the live one.',
        'Review the thumbnail with the size test; check the pair check for title duplication.',
      ],
    }
  }
  if (ctrStrong && retentionWeak) {
    return {
      stage: 'content',
      summary:
        'Packaging is pulling viewers in, but fewer stay than usual — the limiting stage looks like the content (opening hook / pacing).',
      evidence,
      actions: [
        'Run the transcript analyzer on the script; look for a weak intro or slow first minute.',
        'Compare the opening 30 seconds against your best-retaining video.',
      ],
    }
  }
  if (!ctrWeak && !retentionWeak && ctrStrong) {
    return {
      stage: 'healthy',
      summary: 'CTR and retention are at or above the channel baseline — no limiting stage detected from stored signals.',
      evidence,
      actions: ['Consider a follow-up video on this topic while it performs (Video Ideas → follow-up).'],
    }
  }
  if (retentionWeak && !ctrStrong) {
    return {
      stage: 'content',
      summary: 'Retention is below the channel baseline while packaging is not clearly strong — review the opening and pacing first.',
      evidence,
      actions: ['Check the retention curve (if synced) for the largest drop, then the matching script section.'],
    }
  }

  return {
    stage: 'discovery',
    summary:
      'Mixed or baseline-level signals — nothing clearly limiting from CTR/retention alone. Impressions and traffic sources would refine this.',
    evidence,
    actions: ['Check impressions on the Videos page; flat impressions with healthy CTR suggests a discovery (not packaging) issue.'],
  }
}
