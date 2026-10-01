import { shell } from 'electron'
import type { SecretStore } from '../auth/secret-store'
import type { Repositories } from '../database/repositories'
import { TwitchPlatform } from '../platforms/twitch'
import type { CreatorPlatform, PlatformCapabilities, PlatformId } from '../platforms/types'
import { YouTubePlatform, YOUTUBE_CAPABILITIES } from '../platforms/youtube'
import { YOUTUBE_SCOPES } from '../platforms/youtube/oauth'
import { TWITCH_CAPABILITIES } from '../platforms/twitch'
import { getServices } from './services'

/**
 * Platform connection service (spec §8, §9, §73, §145).
 *
 * Owns the live YouTube/Twitch adapters. Credentials — including the Google
 * OAuth *client secret* — live only in the OS-encrypted secret store, never in
 * the database or logs (§76). Nothing here fabricates a connection: if the user
 * has not supplied an OAuth client, the platform is reported as
 * `not_configured` with instructions.
 */
const GOOGLE_KEY = 'integration/google'
const TWITCH_KEY = 'integration/twitch'

export interface GoogleClientConfig {
  clientId: string
  clientSecret?: string
}

export interface TwitchClientConfig {
  clientId: string
}

export interface PlatformSummary {
  id: PlatformId
  displayName: string
  capabilities: PlatformCapabilities
  /** Credentials for the *app* are present (OAuth client id). */
  configured: boolean
  connected: boolean
  authenticated: boolean
  detail: string
  checkedAt: string
  /** What the user must supply before sign-in can start. */
  requiredConfig: Array<{ key: string; label: string; secret: boolean }>
  /** How account sign-in works for this platform. */
  authKind: 'loopback-browser' | 'device-code' | 'unsupported'
}

const instances = new Map<PlatformId, CreatorPlatform>()

function repos(): Repositories {
  return getServices().repos
}

function secretStore(): SecretStore {
  return getServices().secretStore
}

async function readJson<T>(key: string): Promise<T | null> {
  const raw = await secretStore().get(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export async function getGoogleConfig(): Promise<GoogleClientConfig | null> {
  const stored = await readJson<GoogleClientConfig>(GOOGLE_KEY)
  const envId = process.env['CGS_GOOGLE_CLIENT_ID']
  if (!stored && !envId) return null
  return {
    clientId: stored?.clientId ?? envId ?? '',
    ...(stored?.clientSecret ? { clientSecret: stored.clientSecret } : {}),
  }
}

export async function getTwitchConfig(): Promise<TwitchClientConfig | null> {
  const stored = await readJson<TwitchClientConfig>(TWITCH_KEY)
  const envId = process.env['CGS_TWITCH_CLIENT_ID']
  if (!stored && !envId) return null
  return { clientId: stored?.clientId ?? envId ?? '' }
}

/** Stores the OAuth client used for sign-in. Never returns the secret. */
export async function configurePlatform(
  id: PlatformId,
  config: { clientId: string; clientSecret?: string },
): Promise<{ ok: boolean; error?: string }> {
  if (!config.clientId.trim()) return { ok: false, error: 'A client id is required.' }
  if (id === 'youtube') {
    const existing = (await readJson<GoogleClientConfig>(GOOGLE_KEY))?.clientSecret
    const next: GoogleClientConfig = { clientId: config.clientId.trim() }
    const secret = config.clientSecret?.trim() || existing
    if (secret) next.clientSecret = secret
    await secretStore().set(GOOGLE_KEY, JSON.stringify(next))
    return { ok: true }
  }
  if (id === 'twitch') {
    await secretStore().set(TWITCH_KEY, JSON.stringify({ clientId: config.clientId.trim() }))
    return { ok: true }
  }
  return { ok: false, error: `${id} sign-in is not implemented yet.` }
}

async function buildInstance(id: PlatformId): Promise<CreatorPlatform> {
  const cached = instances.get(id)
  if (cached) return cached

  if (id === 'youtube') {
    const config = await getGoogleConfig()
    if (!config) throw new Error('YouTube OAuth client id is not configured.')
    const platform = new YouTubePlatform({
      config: {
        clientId: config.clientId,
        ...(config.clientSecret ? { clientSecret: config.clientSecret } : {}),
        scopes: [...YOUTUBE_SCOPES],
      },
      secretStore: secretStore(),
      openBrowser: async (url) => {
        await shell.openExternal(url)
      },
    })
    instances.set(id, platform)
    return platform
  }

  if (id === 'twitch') {
    const config = await getTwitchConfig()
    if (!config) throw new Error('Twitch client id is not configured.')
    const platform = new TwitchPlatform({ clientId: config.clientId, secretStore: secretStore() })
    instances.set(id, platform)
    return platform
  }

  throw new Error(`${id} is not implemented yet.`)
}

/**
 * Returns a live adapter instance, building it from stored credentials when
 * needed. Throws a plain Error when the platform is not configured yet.
 */
export async function getPlatformInstance(id: PlatformId): Promise<CreatorPlatform> {
  return buildInstance(id)
}

const REQUIRED_CONFIG: Record<'youtube' | 'twitch', PlatformSummary['requiredConfig']> = {
  youtube: [
    { key: 'clientId', label: 'Google OAuth client id (Desktop app)', secret: false },
    { key: 'clientSecret', label: 'Google OAuth client secret', secret: true },
  ],
  twitch: [{ key: 'clientId', label: 'Twitch application client id', secret: false }],
}

/** Reports real connection state for both implemented platforms. */
export async function listPlatforms(): Promise<PlatformSummary[]> {
  const summaries: PlatformSummary[] = []

  for (const id of ['youtube', 'twitch'] as const) {
    const capabilities = id === 'youtube' ? YOUTUBE_CAPABILITIES : TWITCH_CAPABILITIES
    const authKind = id === 'youtube' ? 'loopback-browser' : 'device-code'
    const config = id === 'youtube' ? await getGoogleConfig() : await getTwitchConfig()

    if (!config) {
      summaries.push({
        id,
        displayName: id === 'youtube' ? 'YouTube' : 'Twitch',
        capabilities,
        configured: false,
        connected: false,
        authenticated: false,
        detail: `Set the ${id === 'youtube' ? 'Google' : 'Twitch'} OAuth client id to enable sign-in.`,
        checkedAt: new Date().toISOString(),
        requiredConfig: REQUIRED_CONFIG[id],
        authKind,
      })
      continue
    }

    const platform = await buildInstance(id)
    const status = await platform.testConnection()
    summaries.push({
      id,
      displayName: platform.displayName,
      capabilities,
      configured: true,
      connected: status.connected,
      authenticated: status.authenticated,
      detail: status.detail,
      checkedAt: status.checkedAt,
      requiredConfig: REQUIRED_CONFIG[id],
      authKind,
    })
  }

  return summaries
}

/**
 * Starts sign-in. YouTube completes synchronously (loopback callback); Twitch
 * returns a device code the user must confirm with `completeDeviceSignIn`.
 */
export async function connectPlatform(
  id: PlatformId,
  workspaceId: string,
): Promise<{
  ok: boolean
  pending?: boolean
  userCode?: string
  verificationUri?: string
  deviceCode?: string
  accountLabel?: string
  error?: string
}> {
  const platform = await buildInstance(id)
  try {
    if (id === 'twitch') {
      const start = await (platform as TwitchPlatform).startDeviceAuthorization()
      return {
        ok: false,
        pending: true,
        userCode: start.userCode,
        verificationUri: start.verificationUri,
        deviceCode: start.deviceCode,
      }
    }
    const result = await platform.authenticate()
    if (result.ok) {
      repos().upsertPlatformConnection({
        workspaceId,
        platform: id,
        status: 'connected',
        scopes: id === 'youtube' ? [...YOUTUBE_SCOPES] : [],
      })
    }
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sign-in failed.'
    repos().upsertPlatformConnection({ workspaceId, platform: id, status: 'not_configured' })
    return { ok: false, error: message }
  }
}

/** Finishes the Twitch device flow after the user enters their code. */
export async function completeDeviceSignIn(
  id: PlatformId,
  deviceCode: string,
  workspaceId: string,
): Promise<{ ok: boolean; accountLabel?: string; error?: string }> {
  if (id !== 'twitch') return { ok: false, error: 'Device sign-in only applies to Twitch.' }
  const platform = (await buildInstance(id)) as TwitchPlatform
  const result = await platform.completeDeviceAuthorization(deviceCode)
  if (result.ok) {
    repos().upsertPlatformConnection({ workspaceId, platform: id, status: 'connected' })
  }
  return result
}

export async function disconnectPlatform(id: PlatformId, workspaceId: string): Promise<void> {
  const platform = instances.get(id)
  if (platform) {
    await platform.disconnect().catch(() => undefined)
    instances.delete(id)
  }
  repos().upsertPlatformConnection({ workspaceId, platform: id, status: 'not_connected' })
}

export interface SyncResult {
  ok: boolean
  channelTitle?: string
  videosUpserted?: number
  error?: string
}

/** Pulls the connected channel + recent uploads into the local database. */
export async function syncPlatform(id: PlatformId, workspaceId: string): Promise<SyncResult> {
  try {
    const platform = instances.get(id) ?? (await buildInstance(id))
    const channel = await platform.getChannel()
    if (!channel) return { ok: false, error: 'No channel was returned for this account.' }

    repos().upsertChannel({
      workspaceId,
      platform: id,
      externalId: channel.externalId,
      title: channel.title,
      subscriberCount: channel.subscriberCount,
      videoCount: channel.videoCount,
      viewCount: channel.viewCount,
    })
    // §119: record the observation so goal progress can show real 30-day change.
    if (channel.subscriberCount !== null || channel.viewCount !== null) {
      repos().recordChannelSnapshot({
        workspaceId,
        platform: id,
        externalId: channel.externalId,
        subscriberCount: channel.subscriberCount,
        viewCount: channel.viewCount,
      })
    }

    const videos = await platform.getContent({ limit: 50 })
    for (const video of videos) {
      repos().upsertVideo({
        workspaceId,
        platform: id,
        externalId: video.externalId,
        title: video.title,
        publishedAt: video.publishedAt,
        description: video.description,
        tags: video.tags,
        thumbUrl: video.thumbUrl,
        views: video.stats.views,
        likes: video.stats.likes,
        comments: video.stats.comments,
      })
    }

    repos().upsertPlatformConnection({ workspaceId, platform: id, status: 'connected' })
    return { ok: true, channelTitle: channel.title, videosUpserted: videos.length }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Sync failed.' }
  }
}
