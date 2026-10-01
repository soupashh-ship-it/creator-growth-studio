import {
  STREAM_RESEARCH_NOTES,
  compareCategories,
  summarizeOwnStreams,
  type CategoryComparison,
  type OwnStreamSummary,
} from '../research/stream-research'
import { TwitchPlatform } from '../platforms/twitch'
import { getPlatformInstance } from './platform-service'
import { getServices } from './services'

/**
 * Live streaming research service (spec §40–41, §45).
 *
 * Uses only the official Twitch Helix API. The creator's own stream history is
 * updated during syncs while a session is live; ended sessions keep their last
 * known peak as the closest honest value Helix offers.
 */
export interface StreamResearchResult {
  connected: boolean
  detail: string
  own: OwnStreamSummary
  categories: CategoryComparison[]
  notes: string[]
}

/** Syncs the connected Twitch account's current live session into `streams`. */
export async function syncTwitchStreams(workspaceId: string): Promise<{ ok: boolean; sessions?: number; live?: boolean; error?: string }> {
  let platform: TwitchPlatform
  try {
    const instance = await getPlatformInstance('twitch')
    if (!(instance instanceof TwitchPlatform)) throw new Error('Twitch adapter unavailable.')
    platform = instance
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Twitch is not connected.' }
  }

  try {
    const session = await platform.testConnection()
    if (!session.connected) return { ok: false, error: session.detail }

    const streams = await platform.getStreams()
    const live = streams.find((s) => s.isLive)
    const { repos } = getServices()

    if (live) {
      // Peak-so-far: the current concurrent viewer count while live.
      const peakNow = live.peakViewers ?? null
      const existing = repos
        .listStreams(workspaceId, 500)
        .find((r) => r.platform === 'twitch' && r.external_id === live.externalId)
      repos.upsertStream({
        workspaceId,
        platform: 'twitch',
        externalId: live.externalId,
        title: live.title,
        category: live.category,
        startedAt: live.startedAt,
        endedAt: null,
        peakViewers: peakNow !== null && existing?.peak_viewers != null ? Math.max(peakNow, existing.peak_viewers) : peakNow,
      })
      return { ok: true, live: true, sessions: 1 }
    }

    return { ok: true, live: false, sessions: 0 }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Stream sync failed.' }
  }
}

export async function researchTwitchCategories(
  workspaceId: string,
  input: { categories: string[] },
): Promise<StreamResearchResult> {
  const { repos } = getServices()
  const rows = repos.listStreams(workspaceId)
  const own = summarizeOwnStreams(rows)
  const names = input.categories.map((name) => name.trim()).filter(Boolean).slice(0, 12)

  if (names.length === 0) {
    return {
      connected: false,
      detail: 'Enter at least one category name.',
      own,
      categories: [],
      notes: STREAM_RESEARCH_NOTES,
    }
  }

  let platform: TwitchPlatform
  try {
    const instance = await getPlatformInstance('twitch')
    if (!(instance instanceof TwitchPlatform)) throw new Error('Twitch adapter unavailable.')
    platform = instance
  } catch (error) {
    return {
      connected: false,
      detail: error instanceof Error ? error.message : 'Twitch is not connected.',
      own,
      categories: [],
      notes: STREAM_RESEARCH_NOTES,
    }
  }

  try {
    const stats = await platform.getCategoryStats(names)
    return {
      connected: true,
      detail: `Observed ${stats[0]?.sampleSize ?? 0} live streams in the sample.`,
      own,
      categories: compareCategories(stats, own),
      notes: STREAM_RESEARCH_NOTES,
    }
  } catch (error) {
    return {
      connected: false,
      detail: error instanceof Error ? error.message : 'Twitch category lookup failed.',
      own,
      categories: [],
      notes: STREAM_RESEARCH_NOTES,
    }
  }
}
