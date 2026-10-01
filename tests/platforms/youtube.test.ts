import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  refreshAccessToken,
  YOUTUBE_SCOPES,
} from '@platforms/youtube/oauth'
import { buildAnalyticsUrl, estimateQuotaCost, YouTubeClient } from '@platforms/youtube/client'
import { YouTubePlatform } from '@platforms/youtube'
import { InMemorySecretStore } from '@auth/secret-store'

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

afterEach(() => vi.unstubAllGlobals())

const config = { clientId: 'client-123', scopes: [...YOUTUBE_SCOPES] }

describe('Google authorization URL', () => {
  it('requests PKCE S256, offline access and the minimal scopes', () => {
    const url = new URL(
      buildAuthorizationUrl(config, {
        redirectUri: 'http://127.0.0.1:5000/callback',
        state: 'st4te',
        codeChallenge: 'challenge',
      }),
    )
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('state')).toBe('st4te')
    expect(url.searchParams.get('scope')).toContain('youtube.readonly')
    expect(url.searchParams.get('scope')).toContain('yt-analytics.readonly')
  })
})

describe('token exchange', () => {
  it('returns a token set on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({ access_token: 'at', refresh_token: 'rt', expires_in: 3600, scope: 's', token_type: 'Bearer' }),
      ),
    )
    const tokens = await exchangeAuthorizationCode(config, {
      code: 'c',
      codeVerifier: 'v',
      redirectUri: 'http://127.0.0.1:1/callback',
    })
    expect(tokens.accessToken).toBe('at')
    expect(tokens.refreshToken).toBe('rt')
    expect(tokens.expiresAt).toBeGreaterThan(Date.now())
  })

  it('keeps the existing refresh token when Google omits a new one', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ access_token: 'at2', expires_in: 3600 })))
    const refreshed = await refreshAccessToken(config, 'old-refresh')
    expect(refreshed.accessToken).toBe('at2')
    expect(refreshed.refreshToken).toBe('old-refresh')
  })

  it('throws a typed error when no access token is returned', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'invalid_grant' })))
    await expect(
      exchangeAuthorizationCode(config, { code: 'c', codeVerifier: 'v', redirectUri: 'r' }),
    ).rejects.toThrow(/access token/i)
  })
})

describe('YouTube client', () => {
  it('maps a 401 to auth_expired', async () => {
    const client = new YouTubeClient({
      getAccessToken: async () => 'token',
      fetchImpl: (async () => json({}, 401)) as unknown as typeof fetch,
    })
    await expect(client.getMyChannel()).rejects.toMatchObject({ code: 'auth_expired' })
  })

  it('maps a quota 403 to quota_reached', async () => {
    const client = new YouTubeClient({
      getAccessToken: async () => 'token',
      fetchImpl: (async () => json({ error: { errors: [{ reason: 'quotaExceeded' }] } }, 403)) as unknown as typeof fetch,
    })
    await expect(client.getMyChannel()).rejects.toMatchObject({ code: 'quota_reached' })
  })

  it('parses channel statistics', async () => {
    const client = new YouTubeClient({
      getAccessToken: async () => 'token',
      fetchImpl: (async () =>
        json({
          items: [
            {
              id: 'UC1',
              snippet: { title: 'SupAshh', description: 'd', thumbnails: { default: { url: 'u' } } },
              statistics: { subscriberCount: '8741', videoCount: '120', viewCount: '500000' },
            },
          ],
        })) as unknown as typeof fetch,
    })
    const channel = await client.getMyChannel()
    expect(channel?.title).toBe('SupAshh')
    expect(channel?.subscriberCount).toBe(8741)
  })

  it('estimates quota cost (search = 100 units)', () => {
    expect(estimateQuotaCost('search')).toBe(100)
    expect(estimateQuotaCost('videos')).toBe(1)
  })
})

describe('analytics request builder', () => {
  it('builds a reports.query URL with metrics and dimensions', () => {
    const url = new URL(
      buildAnalyticsUrl({ startDate: '2026-09-01', endDate: '2026-09-30', metrics: ['views', 'estimatedMinutesWatched'], dimensions: ['day'] }),
    )
    expect(url.origin + url.pathname).toBe('https://youtubeanalytics.googleapis.com/v2/reports')
    expect(url.searchParams.get('ids')).toBe('channel==MINE')
    expect(url.searchParams.get('metrics')).toBe('views,estimatedMinutesWatched')
    expect(url.searchParams.get('dimensions')).toBe('day')
  })
})

describe('YouTubePlatform', () => {
  it('is not configured before any connection', async () => {
    const platform = new YouTubePlatform({
      config,
      secretStore: new InMemorySecretStore(),
      openBrowser: async () => undefined,
    })
    await expect(platform.getChannel()).rejects.toMatchObject({ code: 'not_configured' })
    const status = await platform.testConnection()
    expect(status.connected).toBe(false)
  })

  it('refreshes an expired token from the secret store before calling the API', async () => {
    const store = new InMemorySecretStore()
    await store.set(
      'platform/youtube',
      JSON.stringify({ accessToken: 'old', refreshToken: 'rt', expiresAt: Date.now() - 1000, scope: '', tokenType: 'Bearer' }),
    )

    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(String(url))
        if (String(url).includes('oauth2.googleapis.com')) {
          return json({ access_token: 'new', expires_in: 3600, token_type: 'Bearer' })
        }
        return json({ items: [{ id: 'UC1', snippet: { title: 'X' }, statistics: {} }] })
      }),
    )

    const platform = new YouTubePlatform({ config, secretStore: store, openBrowser: async () => undefined })
    const channel = await platform.getChannel()
    expect(channel?.id).toBe('UC1')
    expect(calls.some((u) => u.includes('oauth2.googleapis.com'))).toBe(true)
    expect(calls.some((u) => u.includes('googleapis.com/youtube/v3/channels'))).toBe(true)
  })

  it('declares capabilities so the UI can hide unsupported actions', () => {
    const platform = new YouTubePlatform({
      config,
      secretStore: new InMemorySecretStore(),
      openBrowser: async () => undefined,
    })
    expect(platform.capabilities.capabilities).toContain('analytics')
    expect(platform.capabilities.capabilities).toContain('comments')
  })
})
