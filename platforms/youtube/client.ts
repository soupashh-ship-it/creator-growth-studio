import { PlatformError } from '../errors'
import type { Channel, Comment, SearchResult, Video } from '../types'
import { analyticsRowsToObjects, type AnalyticsQuery, type AnalyticsRow } from './analytics'

const DATA_API = 'https://www.googleapis.com/youtube/v3'
export const ANALYTICS_API = 'https://youtubeanalytics.googleapis.com/v2/reports'

/**
 * YouTube Data API quota costs (docs/INTEGRATION_AUDIT.md §4): 10,000 units/day
 * per project, and a single `search` call costs 100 units. Every other read here
 * costs 1. We surface the cost so the rate-limit manager can budget (§140).
 */
export function estimateQuotaCost(endpoint: string): number {
  return endpoint === 'search' ? 100 : 1
}

/**
 * Builds a YouTube Analytics `reports.query` URL. Pure and unit-tested so the
 * request shape is verifiable without hitting Google (spec §106).
 */
export function buildAnalyticsUrl(params: {
  startDate: string
  endDate: string
  metrics: string[]
  dimensions?: string[]
  filters?: string
  ids?: string
}): string {
  const url = new URL(ANALYTICS_API)
  url.searchParams.set('ids', params.ids ?? 'channel==MINE')
  url.searchParams.set('startDate', params.startDate)
  url.searchParams.set('endDate', params.endDate)
  url.searchParams.set('metrics', params.metrics.join(','))
  if (params.dimensions?.length) url.searchParams.set('dimensions', params.dimensions.join(','))
  if (params.filters) url.searchParams.set('filters', params.filters)
  return url.toString()
}

export interface YouTubeClientOptions {
  /** Supplies a valid access token, refreshing when needed. */
  getAccessToken: () => Promise<string>
  fetchImpl?: typeof fetch
}

/**
 * Thin YouTube Data API client. 401 → `auth_expired`; a quota-exceeded 403 →
 * `quota_reached`; both are typed so the UI shows the right state (§81).
 */
export class YouTubeClient {
  private readonly fetchImpl: typeof fetch

  constructor(private readonly options: YouTubeClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  private async get<T>(path: string, params: Record<string, string | undefined>): Promise<T> {
    const token = await this.options.getAccessToken()
    const url = new URL(`${DATA_API}/${path}`)
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, value)
    }

    let response: Response
    try {
      response = await this.fetchImpl(url.toString(), {
        headers: { authorization: `Bearer ${token}` },
      })
    } catch (error) {
      throw new PlatformError('offline', 'youtube', 'Could not reach YouTube.', error instanceof Error ? error.message : undefined)
    }

    if (response.status === 401) {
      throw new PlatformError('auth_expired', 'youtube', 'YouTube authentication expired. Reconnect the account.')
    }
    if (response.status === 403) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: { errors?: Array<{ reason?: string }>; message?: string }
      }
      const reason = body.error?.errors?.[0]?.reason
      if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
        throw new PlatformError('quota_reached', 'youtube', 'YouTube API daily quota reached.', reason)
      }
      throw new PlatformError('permission_missing', 'youtube', body.error?.message ?? 'YouTube denied the request.', reason)
    }
    if (!response.ok) {
      throw new PlatformError('unavailable', 'youtube', `YouTube returned HTTP ${response.status}.`)
    }

    return (await response.json()) as T
  }

  /**
   * Runs an official YouTube Analytics `reports.query`.
   *
   * Returns the raw typed rows; the caller converts them (see
   * `platforms/youtube/analytics.ts`). Nothing is estimated here.
   */
  async queryAnalytics(query: AnalyticsQuery): Promise<{ headers: string[]; rows: AnalyticsRow[] }> {
    const token = await this.options.getAccessToken()
    const url = new URL(ANALYTICS_API)
    url.searchParams.set('ids', query.ids ?? 'channel==MINE')
    url.searchParams.set('startDate', query.startDate)
    url.searchParams.set('endDate', query.endDate)
    url.searchParams.set('metrics', query.metrics.join(','))
    if (query.dimensions?.length) url.searchParams.set('dimensions', query.dimensions.join(','))
    if (query.filters) url.searchParams.set('filters', query.filters)
    if (query.sort) url.searchParams.set('sort', query.sort)
    if (query.maxResults) url.searchParams.set('maxResults', String(query.maxResults))

    let response: Response
    try {
      response = await this.fetchImpl(url.toString(), {
        headers: { authorization: `Bearer ${token}` },
      })
    } catch (error) {
      throw new PlatformError('offline', 'youtube', 'Could not reach YouTube Analytics.', error instanceof Error ? error.message : undefined)
    }

    if (response.status === 401) {
      throw new PlatformError('auth_expired', 'youtube', 'YouTube Analytics authorization expired. Reconnect the account.')
    }
    if (response.status === 403) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: { message?: string; errors?: Array<{ reason?: string }> }
      }
      const reason = body.error?.errors?.[0]?.reason
      if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
        throw new PlatformError('quota_reached', 'youtube', 'YouTube Analytics quota reached.', reason)
      }
      throw new PlatformError('permission_missing', 'youtube', body.error?.message ?? 'YouTube Analytics denied the request.', reason)
    }
    if (!response.ok) {
      throw new PlatformError('unavailable', 'youtube', `YouTube Analytics returned HTTP ${response.status}.`)
    }

    const payload = (await response.json()) as {
      columnHeaders?: Array<{ name?: string }>
      rows?: Array<Array<string | number>>
    }
    return {
      headers: (payload.columnHeaders ?? []).map((header) => header.name ?? ''),
      rows: analyticsRowsToObjects(payload),
    }
  }

  async getMyChannel(): Promise<Channel | null> {
    const data = await this.get<{
      items?: Array<{
        id: string
        snippet?: { title?: string; description?: string; thumbnails?: { default?: { url?: string } } }
        statistics?: { subscriberCount?: string; videoCount?: string; viewCount?: string }
      }>
    }>('channels', { part: 'snippet,statistics,contentDetails', mine: 'true' })

    const item = data.items?.[0]
    if (!item) return null

    const num = (v?: string): number | null => (v === undefined ? null : Number(v))
    return {
      id: item.id,
      platform: 'youtube',
      externalId: item.id,
      title: item.snippet?.title ?? '',
      description: item.snippet?.description ?? '',
      thumbUrl: item.snippet?.thumbnails?.default?.url ?? null,
      subscriberCount: num(item.statistics?.subscriberCount),
      videoCount: num(item.statistics?.videoCount),
      viewCount: num(item.statistics?.viewCount),
      fetchedAt: new Date().toISOString(),
    }
  }

  async getUploadsPlaylistId(): Promise<string | null> {
    const data = await this.get<{
      items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }>
    }>('channels', { part: 'contentDetails', mine: 'true' })
    return data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads ?? null
  }

  /**
   * Looks up any public channel by `@handle` (spec §32 competitor research).
   * Uses the official `forHandle` filter — no scraping.
   */
  async getChannelByHandle(handle: string): Promise<Channel | null> {
    const normalized = handle.trim().startsWith('@') ? handle.trim() : `@${handle.trim()}`
    const data = await this.get<{
      items?: Array<{
        id: string
        snippet?: { title?: string; description?: string; thumbnails?: { default?: { url?: string } } }
        statistics?: { subscriberCount?: string; videoCount?: string; viewCount?: string }
      }>
    }>('channels', { part: 'snippet,statistics,contentDetails', forHandle: normalized })

    const item = data.items?.[0]
    if (!item) return null
    const num = (v?: string): number | null => (v === undefined ? null : Number(v))
    return {
      id: item.id,
      platform: 'youtube',
      externalId: item.id,
      title: item.snippet?.title ?? normalized,
      description: item.snippet?.description ?? '',
      thumbUrl: item.snippet?.thumbnails?.default?.url ?? null,
      subscriberCount: num(item.statistics?.subscriberCount),
      videoCount: num(item.statistics?.videoCount),
      viewCount: num(item.statistics?.viewCount),
      fetchedAt: new Date().toISOString(),
    }
  }

  /** Uploads playlist for a public channel id (cost 1 unit, not a search). */
  async getUploadsPlaylistIdForChannel(channelId: string): Promise<string | null> {
    const data = await this.get<{
      items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }>
    }>('channels', { part: 'contentDetails', id: channelId })
    return data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads ?? null
  }

  /** Recent public uploads for any channel (spec §32). */
  async listChannelUploads(channelId: string, max = 25): Promise<Video[]> {
    const playlistId = await this.getUploadsPlaylistIdForChannel(channelId)
    if (!playlistId) return []
    return this.listUploads(playlistId, max)
  }

  async listUploads(playlistId: string, max = 25): Promise<Video[]> {
    const data = await this.get<{
      items?: Array<{
        snippet?: { title?: string; description?: string; publishedAt?: string; thumbnails?: { medium?: { url?: string } } }
        contentDetails?: { videoId?: string }
      }>
    }>('playlistItems', {
      part: 'snippet,contentDetails',
      playlistId,
      maxResults: String(Math.min(max, 50)),
    })

    const ids = (data.items ?? [])
      .map((i) => i.contentDetails?.videoId)
      .filter((id): id is string => Boolean(id))
    const stats = ids.length > 0 ? await this.getVideoStats(ids) : new Map()

    return (data.items ?? []).flatMap((item): Video[] => {
      const id = item.contentDetails?.videoId
      if (!id) return []
      const s = stats.get(id)
      return [
        {
          platform: 'youtube',
          externalId: id,
          channelId: '',
          title: item.snippet?.title ?? '',
          description: item.snippet?.description ?? '',
          publishedAt: item.snippet?.publishedAt ?? '',
          durationS: null,
          tags: [],
          category: null,
          thumbUrl: item.snippet?.thumbnails?.medium?.url ?? null,
          stats: s ?? { views: null, likes: null, comments: null },
        },
      ]
    })
  }

  async getVideoStats(ids: string[]): Promise<Map<string, { views: number | null; likes: number | null; comments: number | null }>> {
    const data = await this.get<{
      items?: Array<{ id: string; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }>
    }>('videos', { part: 'statistics', id: ids.join(',') })

    const map = new Map<string, { views: number | null; likes: number | null; comments: number | null }>()
    for (const item of data.items ?? []) {
      const num = (v?: string): number | null => (v === undefined ? null : Number(v))
      map.set(item.id, {
        views: num(item.statistics?.viewCount),
        likes: num(item.statistics?.likeCount),
        comments: num(item.statistics?.commentCount),
      })
    }
    return map
  }

  async search(query: string, max = 10): Promise<SearchResult[]> {
    const data = await this.get<{
      items?: Array<{
        id?: { videoId?: string }
        snippet?: { title?: string; channelTitle?: string; publishedAt?: string; description?: string; thumbnails?: { medium?: { url?: string } } }
      }>
    }>('search', { part: 'snippet', q: query, type: 'video', maxResults: String(Math.min(max, 50)) })

    return (data.items ?? []).flatMap((item): SearchResult[] => {
      const id = item.id?.videoId
      if (!id) return []
      return [
        {
          externalId: id,
          title: item.snippet?.title ?? '',
          channelTitle: item.snippet?.channelTitle ?? '',
          publishedAt: item.snippet?.publishedAt ?? '',
          thumbUrl: item.snippet?.thumbnails?.medium?.url ?? null,
          description: item.snippet?.description ?? '',
        },
      ]
    })
  }

  async getComments(videoExternalId: string, max = 50): Promise<Comment[]> {
    const data = await this.get<{
      items?: Array<{
        id: string
        snippet?: {
          topLevelComment?: {
            snippet?: { authorDisplayName?: string; textDisplay?: string; publishedAt?: string; likeCount?: number }
          }
        }
      }>
    }>('commentThreads', { part: 'snippet', videoId: videoExternalId, maxResults: String(Math.min(max, 100)), textFormat: 'plainText' })

    return (data.items ?? []).map((item) => {
      const s = item.snippet?.topLevelComment?.snippet
      return {
        externalId: item.id,
        author: s?.authorDisplayName ?? '',
        body: s?.textDisplay ?? '',
        publishedAt: s?.publishedAt ?? null,
        likeCount: s?.likeCount ?? null,
      }
    })
  }
}
