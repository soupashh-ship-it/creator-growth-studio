import { AuthError } from '../../auth/errors'

/**
 * Twitch OAuth (docs/INTEGRATION_AUDIT.md §7).
 *
 * Twitch recommends the **Device Code Grant** for limited-input / Electron-class
 * apps, so no client secret is shipped or stored. We also support app access
 * tokens for public research and OAuth for connected accounts.
 */
export const TWITCH_AUTH_BASE = 'https://id.twitch.tv/oauth2'
export const TWITCH_DEVICE_ENDPOINT = `${TWITCH_AUTH_BASE}/device`
export const TWITCH_TOKEN_ENDPOINT = `${TWITCH_AUTH_BASE}/token`
export const TWITCH_VALIDATE_ENDPOINT = `${TWITCH_AUTH_BASE}/validate`

/** Minimal scopes — requested only where the feature needs them (spec §9). */
export const TWITCH_SCOPES = [
  'user:read:email',
  'channel:read:subscriptions',
  'moderator:read:followers',
] as const

export interface DeviceCodeResponse {
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresIn: number
  intervalSeconds: number
}

export interface TwitchTokenSet {
  accessToken: string
  refreshToken: string | null
  expiresAt: number
  scopes: string[]
}

interface TwitchTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string[] | string
  message?: string
}

function toTokenSet(data: TwitchTokenResponse): TwitchTokenSet {
  if (!data.access_token) {
    throw new AuthError('token_exchange_failed', 'Twitch did not return an access token.', data.message)
  }
  const scopes = Array.isArray(data.scope) ? data.scope : data.scope ? data.scope.split(' ') : []
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    scopes,
  }
}

export async function requestDeviceCode(
  clientId: string,
  scopes: readonly string[],
  fetchImpl: typeof fetch = fetch,
): Promise<DeviceCodeResponse> {
  const body = new URLSearchParams({ client_id: clientId, scopes: scopes.join(' ') })
  const response = await fetchImpl(TWITCH_DEVICE_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = (await response.json().catch(() => ({}))) as {
    device_code?: string
    user_code?: string
    verification_uri?: string
    expires_in?: number
    interval?: number
    message?: string
  }
  if (!response.ok || !data.device_code || !data.user_code || !data.verification_uri) {
    throw new AuthError('token_exchange_failed', 'Twitch device authorization could not be started.', data.message)
  }
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    expiresIn: data.expires_in ?? 1800,
    intervalSeconds: data.interval ?? 5,
  }
}

export interface PollOptions {
  intervalMs?: number
  timeoutMs?: number
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

/**
 * Polls the token endpoint until the user authorizes. Handles Twitch's
 * documented `authorization_pending`, `slow_down`, `access_denied` and
 * `expired_token` responses, and always terminates (spec §81, §91).
 */
export async function pollForDeviceToken(
  clientId: string,
  deviceCode: string,
  options: PollOptions = {},
): Promise<TwitchTokenSet> {
  const fetchImpl = options.fetchImpl ?? fetch
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const timeoutMs = options.timeoutMs ?? 300_000
  let intervalMs = options.intervalMs ?? 5_000
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    await sleep(intervalMs)

    const body = new URLSearchParams({
      client_id: clientId,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    })
    const response = await fetchImpl(TWITCH_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    })
    const data = (await response.json().catch(() => ({}))) as TwitchTokenResponse

    if (response.ok && data.access_token) return toTokenSet(data)

    switch (data.message) {
      case 'authorization_pending':
        continue
      case 'slow_down':
        intervalMs += 5_000
        continue
      case 'expired_token':
        throw new AuthError('timeout', 'The Twitch device code expired before authorization.')
      case 'access_denied':
        throw new AuthError('cancelled', 'Twitch authorization was denied.')
      default:
        throw new AuthError('token_exchange_failed', 'Twitch token request failed.', data.message)
    }
  }

  throw new AuthError('timeout', 'Timed out waiting for Twitch authorization.')
}

export async function refreshTwitchToken(
  clientId: string,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TwitchTokenSet> {
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
  const response = await fetchImpl(TWITCH_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = (await response.json().catch(() => ({}))) as TwitchTokenResponse
  if (!response.ok) {
    throw new AuthError('token_exchange_failed', 'Twitch token refresh failed.', data.message)
  }
  const tokens = toTokenSet(data)
  return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken }
}

/** Third-party apps must validate tokens (docs/INTEGRATION_AUDIT.md §7). */
export async function validateTwitchToken(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ valid: boolean; login?: string; userId?: string; scopes?: string[]; expiresIn?: number }> {
  const response = await fetchImpl(TWITCH_VALIDATE_ENDPOINT, {
    headers: { authorization: `OAuth ${accessToken}` },
  })
  if (!response.ok) return { valid: false }
  const data = (await response.json()) as { login?: string; user_id?: string; scopes?: string[]; expires_in?: number }
  return { valid: true, login: data.login, userId: data.user_id, scopes: data.scopes, expiresIn: data.expires_in }
}

/** App access token for public research (categories, streams, clips). */
export async function getAppAccessToken(
  clientId: string,
  clientSecret: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TwitchTokenSet> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  })
  const response = await fetchImpl(TWITCH_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = (await response.json().catch(() => ({}))) as TwitchTokenResponse
  if (!response.ok) {
    throw new AuthError('token_exchange_failed', 'Twitch app token request failed.', data.message)
  }
  return toTokenSet(data)
}
