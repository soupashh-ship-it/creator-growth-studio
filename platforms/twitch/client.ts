import type { RateLimitManager } from '../../jobs/rate-limiter'
import { PlatformError } from '../errors'
import type { Channel, SearchResult, Stream, Video } from '../types'

const HELIX = 'https://api.twitch.tv/helix'

export interface TwitchAuth {
  token: string
  clientId: string
}

export interface TwitchCategoryStats {
  gameId: string
  gameName: string
  /** Viewers summed over the scanned live sample — an observed LOWER BOUND. */
  viewers: number
  /** Live channels counted within the scanned sample. */
  channels: number
  viewersPerChannel: number
  /** False when the category had no stream in the scanned sample. */
  observed: boolean
  /** How many currently-live streams were scanned to produce these sums. */
  sampleSize: number
}

/**
 * Twitch Helix client (spec §9). Every request goes through the shared rate
 * limiter, and 401/429 map to typed platform errors (spec §81, §140).
 */
export class HelixClient {
  private readonly fetchImpl: typeof fetch

  constructor(
    private readonly getAuth: () => Promise<TwitchAuth>,
    private readonly limiter?: RateLimitManager,
    fetchImpl?: typeof fetch,
  ) {
    this.fetchImpl = fetchImpl ?? fetch
  }

  private async get<T>(
    path: string,
    params: Record<string, string | string[] | undefined> = {},
  ): Promise<T> {
    await this.limiter?.acquire('twitch')
    const auth = await this.getAuth()

    const url = new URL(`${HELIX}/${path}`)
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue
      if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(key, v))
      else url.searchParams.set(key, value)
    }

    let response: Response
    try {
      response = await this.fetchImpl(url.toString(), {
        headers: { 'client-id': auth.clientId, authorization: `Bearer ${auth.token}` },
      })
    } catch (error) {
      throw new PlatformError('offline', 'twitch', 'Could not reach Twitch.', error instanceof Error ? error.message : undefined)
    }

    if (response.status === 401) {
      throw new PlatformError('auth_expired', 'twitch', 'Twitch authorization expired. Reconnect the account.')
    }
    if (response.status === 429) {
      throw new PlatformError('rate_limited', 'twitch', 'Twitch rate limit reached. Try again shortly.')
    }
    if (!response.ok) {
      throw new PlatformError('unavailable', 'twitch', `Twitch returned HTTP ${response.status}.`)
    }
    return (await response.json()) as T
  }

  async getUsers(login?: string): Promise<Channel[]> {
    const data = await this.get<{
      data?: Array<{
        id: string
        login: string
        display_name: string
        description: string
        profile_image_url: string
      }>
    }>('users', login ? { login } : {})

    return (data.data ?? []).map((u) => ({
      id: u.id,
      platform: 'twitch' as const,
      externalId: u.id,
      title: u.display_name,
      description: u.description,
      thumbUrl: u.profile_image_url,
      subscriberCount: null, // Twitch does not expose subscriber counts publicly
      videoCount: null,
      viewCount: null,
      fetchedAt: new Date().toISOString(),
    }))
  }

  async getStreams(userLogin?: string): Promise<Stream[]> {
    const data = await this.get<{
      data?: Array<{
        id: string
        user_name: string
        title: string
        game_name: string
        started_at: string
        viewer_count: number
      }>
    }>('streams', userLogin ? { user_login: userLogin } : {})

    return (data.data ?? []).map((s) => ({
      externalId: s.id,
      title: s.title,
      category: s.game_name || null,
      startedAt: s.started_at,
      endedAt: null,
      isLive: true,
      peakViewers: null,
    }))
  }

  async getGames(names: string[]): Promise<Array<{ id: string; name: string }>> {
    if (names.length === 0) return []
    const data = await this.get<{ data?: Array<{ id: string; name: string }> }>('games', { name: names })
    return data.data ?? []
  }

  async getTopGames(first = 20): Promise<Array<{ id: string; name: string }>> {
    const data = await this.get<{ data?: Array<{ id: string; name: string }> }>('games/top', {
      first: String(Math.min(first, 100)),
    })
    return data.data ?? []
  }

  /**
   * Public category research (spec §40): live viewers and channel counts, joined
   * with the category name. Every value comes from Twitch — nothing is invented.
   *
   * Helix paginates live streams without publishing totals, so up to
   * `maxPages` pages are scanned and the result is explicitly labelled an
   * observed sample (lower bound). Categories absent from the sample get
   * `observed: false` instead of an implied zero.
   */
  async getCategoryStats(gameNames: string[], maxPages = 3): Promise<TwitchCategoryStats[]> {
    const games = await this.getGames(gameNames)
    const byName = new Map(games.map((g) => [g.name.toLowerCase(), g]))

    const viewers = new Map<string, number>()
    const channels = new Map<string, number>()
    let sampleSize = 0
    let cursor: string | undefined

    for (let page = 0; page < Math.max(1, maxPages); page += 1) {
      const streams = await this.get<{
        data?: Array<{ game_id: string; game_name: string; viewer_count: number }>
        pagination?: { cursor?: string }
      }>('streams', cursor ? { first: '100', after: cursor } : { first: '100' })

      const rows = streams.data ?? []
      sampleSize += rows.length
      for (const row of rows) {
        const key = row.game_id
        viewers.set(key, (viewers.get(key) ?? 0) + row.viewer_count)
        channels.set(key, (channels.get(key) ?? 0) + 1)
      }

      cursor = streams.pagination?.cursor
      if (!cursor || rows.length === 0) break
    }

    return gameNames.flatMap((name) => {
      const game = byName.get(name.toLowerCase())
      if (!game) return []
      const viewerCount = viewers.get(game.id) ?? 0
      const channelCount = channels.get(game.id) ?? 0
      return [
        {
          gameId: game.id,
          gameName: game.name,
          viewers: viewerCount,
          channels: channelCount,
          viewersPerChannel: channelCount === 0 ? 0 : viewerCount / channelCount,
          observed: channelCount > 0,
          sampleSize,
        },
      ]
    })
  }

  async getClips(broadcasterId: string): Promise<Array<{ id: string; title: string; url: string; viewCount: number; createdAt: string; duration: number }>> {
    const data = await this.get<{
      data?: Array<{ id: string; title: string; url: string; view_count: number; created_at: string; duration: number }>
    }>('clips', { broadcaster_id: broadcasterId, first: '20' })
    return (data.data ?? []).map((c) => ({
      id: c.id,
      title: c.title,
      url: c.url,
      viewCount: c.view_count,
      createdAt: c.created_at,
      duration: c.duration,
    }))
  }

  async getVideos(userId: string): Promise<Video[]> {
    const data = await this.get<{
      data?: Array<{
        id: string
        title: string
        description: string
        created_at: string
        duration: string
        thumbnail_url: string
        view_count: number
      }>
    }>('videos', { user_id: userId, first: '25' })

    const parseDuration = (value: string): number | null => {
      // Twitch returns e.g. "1h2m3s"
      const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value)
      if (!match) return null
      const [, h, m, s] = match
      return Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0)
    }

    return (data.data ?? []).map((v) => ({
      platform: 'twitch' as const,
      externalId: v.id,
      channelId: userId,
      title: v.title,
      description: v.description,
      publishedAt: v.created_at,
      durationS: parseDuration(v.duration),
      tags: [],
      category: null,
      thumbUrl: v.thumbnail_url,
      stats: { views: v.view_count, likes: null, comments: null },
    }))
  }

  async getSchedule(broadcasterId: string): Promise<Array<{ id: string; startTime: string; title: string; category: string | null }>> {
    const data = await this.get<{
      data?: { segments?: Array<{ id: string; start_time: string; title: string; category?: { name?: string } }> }
    }>('schedule', { broadcaster_id: broadcasterId })
    return (data.data?.segments ?? []).map((seg) => ({
      id: seg.id,
      startTime: seg.start_time,
      title: seg.title,
      category: seg.category?.name ?? null,
    }))
  }

  async getFollowerTotal(broadcasterId: string): Promise<number | null> {
    const data = await this.get<{ total?: number }>('channels/followers', {
      broadcaster_id: broadcasterId,
      first: '1',
    })
    return data.total ?? null
  }

  async searchChannels(query: string): Promise<SearchResult[]> {
    const data = await this.get<{
      data?: Array<{
        id: string
        display_name: string
        game_name: string
        title: string
        thumbnail_url: string
        is_live: boolean
        started_at: string
      }>
    }>('search/channels', { query, first: '10' })

    return (data.data ?? []).map((c) => ({
      externalId: c.id,
      title: c.display_name,
      channelTitle: c.display_name,
      publishedAt: c.started_at ?? '',
      thumbUrl: c.thumbnail_url,
      description: c.title,
    }))
  }
}
