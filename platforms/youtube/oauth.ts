import { AuthError } from '../../auth/errors'

/**
 * Google OAuth 2.0 for installed apps (docs/INTEGRATION_AUDIT.md §4, §6).
 *
 * Uses Authorization Code + PKCE with a loopback redirect. Google no longer
 * supports custom URI schemes on Chrome/Android; loopback is the recommended
 * desktop method. Incremental authorization is NOT supported, so the full
 * scope set must be requested up front.
 */
export interface GoogleOAuthConfig {
  clientId: string
  /** Desktop clients are "non-secret", but Google still issues one. */
  clientSecret?: string
  scopes: string[]
}

export interface TokenSet {
  accessToken: string
  refreshToken: string | null
  /** Epoch millis. */
  expiresAt: number
  scope: string
  tokenType: string
}

export const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
export const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke'

/** Minimal scopes needed for the YouTube features we implement (spec §8). */
export const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
] as const

export interface AuthUrlParams {
  redirectUri: string
  state: string
  codeChallenge: string
  /** OIDC nonce (optional for Google, included for completeness). */
  nonce?: string
}

export function buildAuthorizationUrl(config: GoogleOAuthConfig, params: AuthUrlParams): string {
  const url = new URL(GOOGLE_AUTH_ENDPOINT)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', config.scopes.join(' '))
  url.searchParams.set('state', params.state)
  url.searchParams.set('code_challenge', params.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('access_type', 'offline') // required for a refresh token
  url.searchParams.set('prompt', 'consent')
  if (params.nonce) url.searchParams.set('nonce', params.nonce)
  return url.toString()
}

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  token_type?: string
  error?: string
  error_description?: string
}

function toTokenSet(data: TokenResponse): TokenSet {
  if (!data.access_token) {
    throw new AuthError('token_exchange_failed', 'Google did not return an access token.', data.error_description ?? data.error)
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    scope: data.scope ?? '',
    tokenType: data.token_type ?? 'Bearer',
  }
}

async function postForm(body: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = (await response.json().catch(() => ({}))) as TokenResponse
  if (!response.ok) {
    throw new AuthError(
      'token_exchange_failed',
      `Google token endpoint returned ${response.status}.`,
      data.error_description ?? data.error,
    )
  }
  return data
}

export async function exchangeAuthorizationCode(
  config: GoogleOAuthConfig,
  params: { code: string; codeVerifier: string; redirectUri: string },
): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    code_verifier: params.codeVerifier,
    redirect_uri: params.redirectUri,
    client_id: config.clientId,
  })
  if (config.clientSecret) body.set('client_secret', config.clientSecret)
  return toTokenSet(await postForm(body))
}

export async function refreshAccessToken(
  config: GoogleOAuthConfig,
  refreshToken: string,
): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId,
  })
  if (config.clientSecret) body.set('client_secret', config.clientSecret)
  const data = await postForm(body)
  // Google may omit refresh_token on refresh; keep using the existing one.
  return { ...toTokenSet(data), refreshToken: data.refresh_token ?? refreshToken }
}

/** Best-effort revocation on disconnect (never throws). */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(`${GOOGLE_REVOKE_ENDPOINT}?token=${encodeURIComponent(token)}`, { method: 'POST' })
  } catch {
    // Revocation failure must not block a local disconnect.
  }
}

export function isExpired(tokens: TokenSet, skewMs = 60_000): boolean {
  return Date.now() >= tokens.expiresAt - skewMs
}
