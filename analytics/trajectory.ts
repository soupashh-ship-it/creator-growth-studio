import type { Repositories } from '../database/repositories'

/**
 * Performance monitor (spec §52, docs/SCORING.md §22).
 *
 * Shows a video's stored snapshot trajectory against elapsed-time windows since
 * publish. Windows without a nearby snapshot are "no snapshot yet" — the app
 * cannot re-measure the past, and it says so instead of interpolating.
 */
export interface TrajectoryPoint {
  /** Hours since publish, rounded. */
  hoursSincePublish: number
  capturedAt: string
  views: number | null
}

export interface WindowComparison {
  label: string
  hours: number
  views: number | null
  status: 'measured' | 'no-snapshot' | 'not-yet'
}

export interface VideoTrajectory {
  videoId: string
  title: string
  publishedAt: string | null
  points: TrajectoryPoint[]
  windows: WindowComparison[]
  latest: TrajectoryPoint | null
  growthSinceFirst: number | null
  notes: string[]
}

const WINDOWS: Array<{ label: string; hours: number }> = [
  { label: '1 hour', hours: 1 },
  { label: '6 hours', hours: 6 },
  { label: '24 hours', hours: 24 },
  { label: '48 hours', hours: 48 },
  { label: '7 days', hours: 24 * 7 },
  { label: '28 days', hours: 24 * 28 },
]

export function buildVideoTrajectory(
  repos: Repositories,
  video: { id: string; title: string | null; published_at: string | null },
  now: number = Date.now(),
): VideoTrajectory {
  const rows = repos.listVideoTrajectory(video.id)
  const publishedMs = video.published_at ? new Date(video.published_at).getTime() : null

  const points: TrajectoryPoint[] = rows.map((row) => ({
    capturedAt: row.captured_at,
    views: row.views,
    hoursSincePublish:
      publishedMs !== null ? Math.max(0, Math.round((new Date(row.captured_at).getTime() - publishedMs) / 3_600_000)) : 0,
  }))

  const windows: WindowComparison[] = WINDOWS.map(({ label, hours }) => {
    if (publishedMs === null) {
      return { label, hours, views: null, status: 'no-snapshot' as const }
    }
    const elapsedHours = (now - publishedMs) / 3_600_000
    if (elapsedHours < hours) {
      return { label, hours, views: null, status: 'not-yet' as const }
    }
    // The closest snapshot at or after the window edge.
    const target = publishedMs + hours * 3_600_000
    const nearest = rows
      .filter((row) => new Date(row.captured_at).getTime() >= target)
      .sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime())[0]
    if (!nearest) {
      return { label, hours, views: null, status: 'no-snapshot' as const }
    }
    return { label, hours, views: nearest.views, status: 'measured' as const }
  })

  const first = points[0]
  const latest = points[points.length - 1] ?? null
  const growthSinceFirst =
    first && latest && first.views !== null && latest.views !== null && first.views > 0
      ? Math.round(((latest.views - first.views) / first.views) * 10) / 10
      : null

  const snapshotCount = rows.length
  const notes = [
    snapshotCount <= 1
      ? 'Only one snapshot stored so far — the trajectory fills in as background refreshes capture more points.'
      : `${snapshotCount} snapshots stored; windows use the closest snapshot at or after each mark.`,
    'The app cannot re-measure the past: windows without a nearby snapshot are reported as such, never interpolated.',
  ]

  return {
    videoId: video.id,
    title: video.title ?? '(untitled)',
    publishedAt: video.published_at,
    points,
    windows,
    latest,
    growthSinceFirst,
    notes,
  }
}
