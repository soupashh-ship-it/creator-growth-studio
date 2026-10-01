import { computeMedian } from '../analytics/query'
import { YouTubePlatform } from '../platforms/youtube'
import { getPlatformInstance } from './platform-service'
import { getServices } from './services'

/**
 * Competitor research (spec §25–26, §32).
 *
 * Uses only **public** data through the official YouTube Data API: a channel is
 * resolved by its `@handle`, and its recent uploads are read from the uploads
 * playlist (1 quota unit each, not a 100-unit search). Competitor videos are
 * stored in the competitor's own snapshot, never in the creator's `videos`
 * table, so they cannot distort the creator's analytics (§66).
 */
export interface CompetitorVideoSnapshot {
  title: string
  views: number | null
  publishedAt: string | null
}

export interface CompetitorSnapshot {
  capturedAt: string
  subscriberCount: number | null
  videoCount: number | null
  viewCount: number | null
  medianViews: number | null
  videos: CompetitorVideoSnapshot[]
}

export interface CompetitorView {
  id: string
  platform: string
  label: string
  handle: string | null
  channelExternalId: string
  lastRefreshedAt: string | null
  snapshot: CompetitorSnapshot | null
}

function parseSnapshot(json: string): CompetitorSnapshot | null {
  try {
    const parsed = JSON.parse(json) as Partial<CompetitorSnapshot>
    if (!parsed || typeof parsed !== 'object') return null
    if (!Array.isArray(parsed.videos)) return null
    return {
      capturedAt: parsed.capturedAt ?? new Date(0).toISOString(),
      subscriberCount: parsed.subscriberCount ?? null,
      videoCount: parsed.videoCount ?? null,
      viewCount: parsed.viewCount ?? null,
      medianViews: parsed.medianViews ?? null,
      videos: parsed.videos,
    }
  } catch {
    return null
  }
}

export function listCompetitors(workspaceId: string): CompetitorView[] {
  return getServices()
    .repos.listCompetitors(workspaceId)
    .map((row) => ({
      id: row.id,
      platform: row.platform,
      label: row.label ?? row.channel_external_id,
      handle: row.handle,
      channelExternalId: row.channel_external_id,
      lastRefreshedAt: row.last_refreshed_at,
      snapshot: parseSnapshot(row.snapshot_json),
    }))
}

export async function addCompetitor(
  workspaceId: string,
  input: { handle: string },
): Promise<{ ok: boolean; id?: string; label?: string; error?: string }> {
  const handle = input.handle.trim()
  if (!handle) return { ok: false, error: 'Enter a channel handle, for example @MrBeast.' }

  let platform: YouTubePlatform
  try {
    const instance = await getPlatformInstance('youtube')
    if (!(instance instanceof YouTubePlatform)) throw new Error('YouTube adapter unavailable.')
    platform = instance
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'YouTube is not connected.' }
  }

  try {
    const channel = await platform.getChannelByHandle(handle)
    if (!channel) return { ok: false, error: `No public channel found for ${handle}.` }

    const { repos } = getServices()
    const id = repos.upsertCompetitor({
      workspaceId,
      platform: 'youtube',
      channelExternalId: channel.externalId,
      label: channel.title,
      handle,
    })
    await refreshCompetitorById(workspaceId, id)
    return { ok: true, id, label: channel.title }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not add the competitor.' }
  }
}

async function refreshCompetitorById(
  workspaceId: string,
  id: string,
): Promise<{ ok: boolean; videos?: number; error?: string }> {
  const competitor = listCompetitors(workspaceId).find((c) => c.id === id)
  if (!competitor) return { ok: false, error: 'Competitor not found.' }

  try {
    const instance = await getPlatformInstance('youtube')
    if (!(instance instanceof YouTubePlatform)) throw new Error('YouTube adapter unavailable.')

    // Refresh public channel stats too (1 unit), keeping the last known values
    // when the lookup fails.
    const channel = await instance
      .getChannelByHandle(competitor.handle ?? competitor.channelExternalId)
      .catch(() => null)
    const uploads = await instance.getChannelUploads(competitor.channelExternalId, 25)
    const views = uploads.map((v) => v.stats.views).filter((v): v is number => v !== null && v > 0)

    const snapshot: CompetitorSnapshot = {
      capturedAt: new Date().toISOString(),
      subscriberCount: channel?.subscriberCount ?? competitor.snapshot?.subscriberCount ?? null,
      videoCount: channel?.videoCount ?? competitor.snapshot?.videoCount ?? null,
      viewCount: channel?.viewCount ?? competitor.snapshot?.viewCount ?? null,
      medianViews: computeMedian(views),
      videos: uploads.map((v) => ({
        title: v.title,
        views: v.stats.views,
        publishedAt: v.publishedAt || null,
      })),
    }

    getServices().repos.updateCompetitorSnapshot(id, snapshot)
    return { ok: true, videos: uploads.length }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Refresh failed.' }
  }
}

export async function refreshCompetitor(
  workspaceId: string,
  id: string,
): Promise<{ ok: boolean; videos?: number; error?: string }> {
  return refreshCompetitorById(workspaceId, id)
}

export function removeCompetitor(id: string): void {
  getServices().repos.deleteCompetitor(id)
}
