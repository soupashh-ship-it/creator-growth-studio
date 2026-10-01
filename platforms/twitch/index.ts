import type { SecretStore } from '../../auth/secret-store'
import type { RateLimitManager } from '../../jobs/rate-limiter'
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
import { HelixClient, type TwitchAuth, type TwitchCategoryStats } from './client'
import {
  pollForDeviceToken,
  refreshTwitchToken,
  requestDeviceCode,
  TWITCH_SCOPES,
  validateTwitchToken,
  type TwitchTokenSet,
} from './oauth'

export const TWITCH_CAPABILITIES: PlatformCapabilities = {
  platform: 'twitch',
  capabilities: ['channel', 'content', 'streams', 'clips', 'vods', 'search', 'schedule'],
  requiresConnection: ['channel'],
}

interface StoredTwitchSession {
  tokens: TwitchTokenSet
  login: string
  userId: string
}

export interface TwitchPlatformDeps {
  clientId: string
  secretStore: SecretStore
  limiter?: RateLimitManager
  accountKey?: string
  fetchImpl?: typeof fetch
}

/**
 * Twitch adapter (spec §9). Uses the Device Code Grant (Twitch's recommendation
 * for Electron-class apps) so no client secret is stored. Only public/authorized
 * data is read; genuinely unavailable data raises a typed error rather than
 * being fabricated (spec §40, §66).
 */
export class TwitchPlatform implements CreatorPlatform {
  readonly id = 'twitch' as const
  readonly displayName = 'Twitch'
  readonly capabilities = TWITCH_CAPABILITIES

  private session: StoredTwitchSession | null = null

  constructor(private readonly deps: TwitchPlatformDeps) {}

  private key(): string {
    return this.deps.accountKey ?? 'platform/twitch'
  }

  private async loadSession(): Promise<StoredTwitchSession | null> {
    if (this.session) return this.session
    const raw = await this.deps.secretStore.get(this.key())
    if (!raw) return null
    try {
      this.session = JSON.parse(raw) as StoredTwitchSession
    } catch {
      this.session = null
    }
    return this.session
  }

  private async saveSession(session: StoredTwitchSession): Promise<void> {
    this.session = session
    await this.deps.secretStore.set(this.key(), JSON.stringify(session))
  }

  private async getAuth(): Promise<TwitchAuth> {
    const session = await this.loadSession()
    if (!session) throw new PlatformError('not_configured', 'twitch', 'Twitch is not connected.')

    let tokens = session.tokens
    if (Date.now() >= tokens.expiresAt - 60_000) {
      if (!tokens.refreshToken) {
        throw new PlatformError('auth_expired', 'twitch', 'Twitch session expired. Reconnect the account.')
      }
      tokens = await refreshTwitchToken(this.deps.clientId, tokens.refreshToken, this.deps.fetchImpl ?? fetch)
      await this.saveSession({ ...session, tokens })
    }
    return { token: tokens.accessToken, clientId: this.deps.clientId }
  }

  private client(): HelixClient {
    return new HelixClient(
      () => this.getAuth(),
      this.deps.limiter,
      this.deps.fetchImpl,
    )
  }

  /** Step 1 of the device flow — call this to show the user their code. */
  async startDeviceAuthorization(): Promise<{ deviceCode: string; userCode: string; verificationUri: string }> {
    const code = await requestDeviceCode(this.deps.clientId, TWITCH_SCOPES, this.deps.fetchImpl ?? fetch)
    return { deviceCode: code.deviceCode, userCode: code.userCode, verificationUri: code.verificationUri }
  }

  /** Step 2 — polls until the user authorizes, then stores the session. */
  async completeDeviceAuthorization(deviceCode: string): Promise<{ ok: boolean; accountLabel?: string; error?: string }> {
    try {
      const tokens = await pollForDeviceToken(this.deps.clientId, deviceCode, {
        fetchImpl: this.deps.fetchImpl ?? fetch,
      })
      const validation = await validateTwitchToken(tokens.accessToken, this.deps.fetchImpl ?? fetch)
      const login = validation.login ?? ''
      const userId = validation.userId ?? ''
      if (!login) return { ok: false, error: 'Twitch authorized but no account identity was returned.' }
      await this.saveSession({ tokens, login, userId })
      return { ok: true, accountLabel: `Twitch connected as ${login}` }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Twitch authorization failed.' }
    }
  }

  async authenticate(): Promise<{ ok: boolean; accountLabel?: string; error?: string; instructions?: string }> {
    const start = await this.startDeviceAuthorization()
    const result = await this.completeDeviceAuthorization(start.deviceCode)
    return {
      ...result,
      instructions: `Enter code ${start.userCode} at ${start.verificationUri}`,
    }
  }

  async disconnect(): Promise<void> {
    await this.deps.secretStore.delete(this.key())
    this.session = null
  }

  async testConnection(): Promise<PlatformStatus> {
    try {
      const session = await this.loadSession()
      if (!session) {
        return { connected: false, authenticated: false, detail: 'Twitch is not connected.', checkedAt: new Date().toISOString() }
      }
      const validation = await validateTwitchToken(
        (await this.getAuth()).token,
        this.deps.fetchImpl ?? fetch,
      )
      return {
        connected: validation.valid,
        authenticated: validation.valid,
        detail: validation.valid ? `Connected as ${validation.login ?? session.login}` : 'Twitch token is no longer valid.',
        checkedAt: new Date().toISOString(),
      }
    } catch (error) {
      return {
        connected: false,
        authenticated: false,
        detail: error instanceof Error ? error.message : 'Twitch is not connected.',
        checkedAt: new Date().toISOString(),
      }
    }
  }

  async getChannel(): Promise<Channel | null> {
    const session = await this.loadSession()
    if (!session) throw new PlatformError('not_configured', 'twitch', 'Twitch is not connected.')
    const channels = await this.client().getUsers(session.login)
    const channel = channels[0]
    if (!channel) return null
    const followers = await this.client().getFollowerTotal(session.userId).catch(() => null)
    return { ...channel, subscriberCount: followers }
  }

  async getContent(): Promise<Video[]> {
    const session = await this.loadSession()
    if (!session) throw new PlatformError('not_configured', 'twitch', 'Twitch is not connected.')
    return this.client().getVideos(session.userId)
  }

  async getStreams(): Promise<Stream[]> {
    const session = await this.loadSession()
    if (!session) return []
    return this.client().getStreams(session.login)
  }

  search(query: string): Promise<SearchResult[]> {
    return this.client().searchChannels(query)
  }

  /** Public category research (spec §40). */
  getCategoryStats(gameNames: string[], maxPages = 3): Promise<TwitchCategoryStats[]> {
    return this.client().getCategoryStats(gameNames, maxPages)
  }

  async getClipList(broadcasterId: string): ReturnType<HelixClient['getClips']> {
    return this.client().getClips(broadcasterId)
  }

  async getSchedule(): Promise<Array<{ id: string; startTime: string; title: string; category: string | null }>> {
    const session = await this.loadSession()
    if (!session) throw new PlatformError('not_configured', 'twitch', 'Twitch is not connected.')
    return this.client().getSchedule(session.userId)
  }

  /**
   * Twitch does not expose channel analytics to third-party apps through the
   * public API, so this is honestly unavailable rather than approximated.
   */
  getAnalytics(_options: { range: DateRange; metrics: string[] }): Promise<MetricSeries[]> {
    return Promise.reject(
      new PlatformError(
        'permission_missing',
        'twitch',
        'Twitch does not expose channel analytics to third-party applications.',
      ),
    )
  }

  /** Twitch has no public comment API for past broadcasts. */
  getComments(): Promise<Comment[]> {
    return Promise.reject(
      new PlatformError('permission_missing', 'twitch', 'Twitch does not provide a public comment API.'),
    )
  }
}
