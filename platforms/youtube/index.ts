import { AuthError } from '../../auth/errors'
import { startLoopbackServer } from '../../auth/loopback'
import { createPkce } from '../../auth/pkce'
import type { SecretStore } from '../../auth/secret-store'
import { createState } from '../../auth/state'
import { PlatformError } from '../errors'
import type {
  Channel,
  Comment,
  CreatorPlatform,
  DateRange,
  MetricSeries,
  PlatformCapabilities,
  PlatformStatus,
  SearchResult,
  Stream,
  Video,
} from '../types'
import { YouTubeClient, buildAnalyticsUrl } from './client'
import {
  demographicsQuery,
  perVideoQuery,
  retentionQuery,
  type AnalyticsQuery,
  type AnalyticsRow,
} from './analytics'
import {
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  isExpired,
  refreshAccessToken,
  revokeToken,
  type GoogleOAuthConfig,
  type TokenSet,
} from './oauth'

export const YOUTUBE_CAPABILITIES: PlatformCapabilities = {
  platform: 'youtube',
  capabilities: ['channel', 'content', 'analytics', 'search', 'comments', 'streams'],
  requiresConnection: ['channel', 'content', 'analytics', 'comments'],
}

export interface YouTubePlatformDeps {
  config: GoogleOAuthConfig
  secretStore: SecretStore
  /** Opens the system browser for OAuth (injected so tests never launch one). */
  openBrowser: (url: string) => Promise<void>
  accountKey?: string
  fetchImpl?: typeof fetch
}

/**
 * YouTube adapter (spec §8). Uses official Google OAuth with minimal scopes;
 * tokens live only in the OS-encrypted secret store (spec §76).
 */
export class YouTubePlatform implements CreatorPlatform {
  readonly id = 'youtube' as const
  readonly displayName = 'YouTube'
  readonly capabilities = YOUTUBE_CAPABILITIES

  private tokens: TokenSet | null = null

  constructor(private readonly deps: YouTubePlatformDeps) {}

  private key(): string {
    return this.deps.accountKey ?? 'platform/youtube'
  }

  private async loadTokens(): Promise<TokenSet | null> {
    if (this.tokens) return this.tokens
    const raw = await this.deps.secretStore.get(this.key())
    if (!raw) return null
    try {
      this.tokens = JSON.parse(raw) as TokenSet
    } catch {
      this.tokens = null
    }
    return this.tokens
  }

  private async saveTokens(tokens: TokenSet): Promise<void> {
    this.tokens = tokens
    await this.deps.secretStore.set(this.key(), JSON.stringify(tokens))
  }

  private async getAccessToken(): Promise<string> {
    const tokens = await this.loadTokens()
    if (!tokens) throw new PlatformError('not_configured', 'youtube', 'YouTube is not connected.')
    if (!isExpired(tokens)) return tokens.accessToken
    if (!tokens.refreshToken) {
      throw new PlatformError('auth_expired', 'youtube', 'YouTube session expired. Reconnect the account.')
    }
    const refreshed = await refreshAccessToken(this.deps.config, tokens.refreshToken)
    await this.saveTokens(refreshed)
    return refreshed.accessToken
  }

  private client(): YouTubeClient {
    return new YouTubeClient({
      getAccessToken: () => this.getAccessToken(),
      ...(this.deps.fetchImpl ? { fetchImpl: this.deps.fetchImpl } : {}),
    })
  }

  async authenticate(): Promise<{ ok: boolean; accountLabel?: string; error?: string }> {
    const pkce = createPkce()
    const state = createState()
    const server = await startLoopbackServer({ expectedState: state })
    try {
      const url = buildAuthorizationUrl(this.deps.config, {
        redirectUri: server.redirectUri,
        state,
        codeChallenge: pkce.challenge,
      })
      await this.deps.openBrowser(url)
      const { code } = await server.waitForCallback()
      const tokens = await exchangeAuthorizationCode(this.deps.config, {
        code,
        codeVerifier: pkce.verifier,
        redirectUri: server.redirectUri,
      })
      await this.saveTokens(tokens)
      return { ok: true, accountLabel: 'YouTube channel connected' }
    } catch (error) {
      if (error instanceof AuthError) return { ok: false, error: error.message }
      return { ok: false, error: error instanceof Error ? error.message : 'YouTube sign-in failed.' }
    } finally {
      await server.close()
    }
  }

  async disconnect(): Promise<void> {
    const tokens = await this.loadTokens()
    if (tokens?.refreshToken) await revokeToken(tokens.refreshToken)
    await this.deps.secretStore.delete(this.key())
    this.tokens = null
  }

  async testConnection(): Promise<PlatformStatus> {
    try {
      const channel = await this.getChannel()
      return {
        connected: channel !== null,
        authenticated: true,
        detail: channel ? `Connected as ${channel.title}` : 'Signed in, but no channel found for this account.',
        checkedAt: new Date().toISOString(),
      }
    } catch (error) {
      const code = error instanceof PlatformError ? error.code : 'unavailable'
      return {
        connected: false,
        authenticated: code !== 'not_configured' && code !== 'auth_expired',
        detail: error instanceof Error ? error.message : 'YouTube is not connected.',
        checkedAt: new Date().toISOString(),
      }
    }
  }

  getChannel(): Promise<Channel | null> {
    return this.client().getMyChannel()
  }

  /** Public channel lookup by @handle, for competitor research (spec §32). */
  getChannelByHandle(handle: string): Promise<Channel | null> {
    return this.client().getChannelByHandle(handle)
  }

  /** Recent public uploads for another channel — stored apart from own videos. */
  getChannelUploads(channelId: string, limit = 25): Promise<Video[]> {
    return this.client().listChannelUploads(channelId, limit)
  }

  async getContent(options?: { limit?: number; since?: string }): Promise<Video[]> {
    const client = this.client()
    const playlistId = await client.getUploadsPlaylistId()
    if (!playlistId) return []
    const videos = await client.listUploads(playlistId, options?.limit ?? 25)
    if (!options?.since) return videos
    return videos.filter((v) => v.publishedAt >= options.since!)
  }

  /** Analytics via the YouTube Analytics API (docs/INTEGRATION_AUDIT.md §5). */
  async getAnalytics(options: { range: DateRange; metrics: string[] }): Promise<MetricSeries[]> {
    const token = await this.getAccessToken()
    const url = buildAnalyticsUrl({
      startDate: options.range.start,
      endDate: options.range.end,
      metrics: options.metrics,
      dimensions: ['day'],
    })

    const response = await (this.deps.fetchImpl ?? fetch)(url, {
      headers: { authorization: `Bearer ${token}` },
    })
    if (response.status === 401) {
      throw new PlatformError('auth_expired', 'youtube', 'YouTube Analytics authorization expired.')
    }
    if (!response.ok) {
      throw new PlatformError('unavailable', 'youtube', `YouTube Analytics returned HTTP ${response.status}.`)
    }

    const data = (await response.json()) as {
      columnHeaders?: Array<{ name: string }>
      rows?: Array<Array<string | number>>
    }
    const headers = (data.columnHeaders ?? []).map((h) => h.name)
    const dateIndex = headers.indexOf('day')
    const source = 'YouTube Analytics API'

    return options.metrics.map((metric) => {
      const metricIndex = headers.indexOf(metric)
      const points = (data.rows ?? []).flatMap((row) => {
        const date = row[dateIndex]
        const value = row[metricIndex]
        if (date === undefined || value === undefined) return []
        return [{ date: String(date), value: Number(value) }]
      })
      return { metric, points, source }
    })
  }

  /** Arbitrary official Analytics query (used by the analytics sync service). */
  queryAnalytics(query: AnalyticsQuery): Promise<{ headers: string[]; rows: AnalyticsRow[] }> {
    return this.client().queryAnalytics(query)
  }

  /** Per-video impressions/CTR/retention/revenue for a range (§36, §67). */
  getPerVideoMetrics(range: DateRange): Promise<{ headers: string[]; rows: AnalyticsRow[] }> {
    return this.client().queryAnalytics(perVideoQuery(range))
  }

  /** Audience viewer-percentage by age group and gender for a range (§67). */
  getDemographics(range: DateRange): Promise<{ headers: string[]; rows: AnalyticsRow[] }> {
    return this.client().queryAnalytics(demographicsQuery(range))
  }

  /** Retention curve for one video by elapsed-time ratio (§36). */
  getRetention(videoId: string, range?: DateRange): Promise<{ headers: string[]; rows: AnalyticsRow[] }> {
    return this.client().queryAnalytics(retentionQuery(videoId, range))
  }

  search(query: string): Promise<SearchResult[]> {
    return this.client().search(query)
  }

  getComments(videoExternalId: string): Promise<Comment[]> {
    return this.client().getComments(videoExternalId)
  }

  /** Live metadata requires additional endpoints; nothing is fabricated. */
  async getStreams(): Promise<Stream[]> {
    return []
  }
}
