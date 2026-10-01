import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getAppAccessToken,
  pollForDeviceToken,
  requestDeviceCode,
  validateTwitchToken,
} from '@platforms/twitch/oauth'
import { HelixClient } from '@platforms/twitch/client'
import { TwitchPlatform } from '@platforms/twitch'
import { InMemorySecretStore } from '@auth/secret-store'

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

afterEach(() => vi.unstubAllGlobals())

describe('Twitch device code flow', () => {
  it('requests a device code with a user-facing code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({ device_code: 'dc', user_code: 'ABCD-1234', verification_uri: 'https://twitch.tv/activate', expires_in: 1800, interval: 5 }),
      ),
    )
    const code = await requestDeviceCode('client', ['user:read:email'])
    expect(code.userCode).toBe('ABCD-1234')
    expect(code.verificationUri).toContain('activate')
    expect(code.intervalSeconds).toBe(5)
  })

  it('polls through authorization_pending and then succeeds', async () => {
    const responses = [
      json({ message: 'authorization_pending' }, 400),
      json({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 }),
    ]
    let call = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => responses[Math.min(call++, responses.length - 1)]!),
    )
    const tokens = await pollForDeviceToken('client', 'dc', { sleep: async () => undefined, intervalMs: 0 })
    expect(tokens.accessToken).toBe('at')
    expect(call).toBe(2)
  })

  it('backs off on slow_down', async () => {
    const responses = [
      json({ message: 'slow_down' }, 400),
      json({ access_token: 'at', expires_in: 3600 }),
    ]
    let call = 0
    const sleeps: number[] = []
    vi.stubGlobal('fetch', vi.fn(async () => responses[Math.min(call++, 1)]!))
    await pollForDeviceToken('client', 'dc', {
      intervalMs: 1000,
      sleep: async (ms) => {
        sleeps.push(ms)
      },
    })
    expect(sleeps[0]).toBe(1000)
    expect(sleeps[1]).toBe(6000) // interval increased by 5s
  })

  it('maps access_denied to a cancelled auth error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ message: 'access_denied' }, 400)))
    await expect(
      pollForDeviceToken('client', 'dc', { sleep: async () => undefined, intervalMs: 0 }),
    ).rejects.toMatchObject({ code: 'cancelled' })
  })

  it('maps expired_token to a timeout auth error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ message: 'expired_token' }, 400)))
    await expect(
      pollForDeviceToken('client', 'dc', { sleep: async () => undefined, intervalMs: 0 }),
    ).rejects.toMatchObject({ code: 'timeout' })
  })

  it('validates tokens and reports invalid ones', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ login: 'supashh', user_id: '1', scopes: ['user:read:email'], expires_in: 100 })))
    const valid = await validateTwitchToken('at')
    expect(valid.valid).toBe(true)
    expect(valid.login).toBe('supashh')

    vi.stubGlobal('fetch', vi.fn(async () => json({}, 401)))
    expect((await validateTwitchToken('bad')).valid).toBe(false)
  })

  it('obtains an app access token for public research', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ access_token: 'app', expires_in: 3600 })))
    const tokens = await getAppAccessToken('client', 'secret')
    expect(tokens.accessToken).toBe('app')
  })
})

describe('HelixClient', () => {
  const auth = async () => ({ token: 'at', clientId: 'cid' })

  it('maps 401 to auth_expired and 429 to rate_limited', async () => {
    const unauthorized = new HelixClient(auth, undefined, (async () => json({}, 401)) as unknown as typeof fetch)
    await expect(unauthorized.getUsers('x')).rejects.toMatchObject({ code: 'auth_expired' })

    const limited = new HelixClient(auth, undefined, (async () => json({}, 429)) as unknown as typeof fetch)
    await expect(limited.getUsers('x')).rejects.toMatchObject({ code: 'rate_limited' })
  })

  it('computes public category stats without inventing numbers', async () => {
    const fetchImpl = (async (url: string) => {
      if (String(url).includes('/games')) {
        return json({ data: [{ id: 'g1', name: 'Path of Exile 2' }] })
      }
      return json({
        data: [
          { game_id: 'g1', game_name: 'Path of Exile 2', viewer_count: 30000 },
          { game_id: 'g1', game_name: 'Path of Exile 2', viewer_count: 12310 },
        ],
      })
    }) as unknown as typeof fetch

    const client = new HelixClient(auth, undefined, fetchImpl)
    const stats = await client.getCategoryStats(['Path of Exile 2'])
    expect(stats).toHaveLength(1)
    expect(stats[0]!.viewers).toBe(42310)
    expect(stats[0]!.channels).toBe(2)
    expect(stats[0]!.viewersPerChannel).toBe(21155)
    expect(stats[0]!.observed).toBe(true)
    expect(stats[0]!.sampleSize).toBe(2)
  })

  it('paginates the live sample and reports the observed sample size', async () => {
    const fetchImpl = (async (url: string) => {
      const u = String(url)
      if (u.includes('/games')) return json({ data: [{ id: 'g1', name: 'Game' }] })
      if (u.includes('after=c1')) {
        return json({ data: [{ game_id: 'g1', viewer_count: 10 }], pagination: {} })
      }
      return json({
        data: [{ game_id: 'g1', viewer_count: 20 }],
        pagination: { cursor: 'c1' },
      })
    }) as unknown as typeof fetch

    const client = new HelixClient(auth, undefined, fetchImpl)
    const stats = await client.getCategoryStats(['Game'])
    expect(stats[0]!.viewers).toBe(30)
    expect(stats[0]!.channels).toBe(2)
    expect(stats[0]!.sampleSize).toBe(2)
  })

  it('marks categories absent from the sample as not observed instead of zero', async () => {
    const fetchImpl = (async (url: string) => {
      const u = String(url)
      if (u.includes('/games')) {
        return json({ data: [{ id: 'g1', name: 'Observed' }, { id: 'g2', name: 'Invisible' }] })
      }
      return json({ data: [{ game_id: 'g1', viewer_count: 5 }], pagination: {} })
    }) as unknown as typeof fetch

    const client = new HelixClient(auth, undefined, fetchImpl)
    const stats = await client.getCategoryStats(['Observed', 'Invisible'])
    expect(stats.find((s) => s.gameName === 'Observed')?.observed).toBe(true)
    const invisible = stats.find((s) => s.gameName === 'Invisible')
    expect(invisible?.channels).toBe(0)
    expect(invisible?.observed).toBe(false)
  })

  it('stops paginating after maxPages', async () => {
    let calls = 0
    const fetchImpl = (async (url: string) => {
      const u = String(url)
      if (u.includes('/games')) return json({ data: [{ id: 'g1', name: 'Game' }] })
      calls += 1
      return json({
        data: [{ game_id: 'g1', viewer_count: 1 }],
        pagination: { cursor: `c${calls}` },
      })
    }) as unknown as typeof fetch

    const client = new HelixClient(auth, undefined, fetchImpl)
    await client.getCategoryStats(['Game'], 2)
    expect(calls).toBe(2)
  })

  it('parses VOD durations', async () => {
    const fetchImpl = (async () =>
      json({
        data: [
          {
            id: 'v1',
            title: 'Stream',
            description: '',
            created_at: '2026-09-01T00:00:00Z',
            duration: '1h2m3s',
            thumbnail_url: 't',
            view_count: 10,
          },
        ],
      })) as unknown as typeof fetch
    const client = new HelixClient(auth, undefined, fetchImpl)
    const videos = await client.getVideos('u1')
    expect(videos[0]!.durationS).toBe(3723)
  })
})

describe('TwitchPlatform', () => {
  const make = () => new TwitchPlatform({ clientId: 'cid', secretStore: new InMemorySecretStore() })

  it('is not configured before connection', async () => {
    const platform = make()
    expect((await platform.testConnection()).connected).toBe(false)
    await expect(platform.getChannel()).rejects.toMatchObject({ code: 'not_configured' })
  })

  it('reports Twitch analytics as genuinely unavailable', async () => {
    const platform = make()
    await expect(platform.getAnalytics({ range: { start: 'a', end: 'b' }, metrics: ['views'] })).rejects.toMatchObject({
      code: 'permission_missing',
    })
  })

  it('declares capabilities that exclude unsupported actions', () => {
    const platform = make()
    expect(platform.capabilities.capabilities).toContain('clips')
    expect(platform.capabilities.capabilities).not.toContain('analytics')
    expect(platform.capabilities.capabilities).not.toContain('comments')
  })
})
