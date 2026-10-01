import { describe, expect, it } from 'vitest'
import { PlatformError } from '@platforms/errors'
import { InstagramPlatform } from '@platforms/instagram'
import { TikTokPlatform } from '@platforms/tiktok'

describe.each([
  ['instagram', InstagramPlatform],
  ['tiktok', TikTokPlatform],
] as const)('%s planned adapter', (_id, platform) => {
  it('reports the honest disconnected state', async () => {
    const status = await platform.testConnection()
    expect(status.connected).toBe(false)
    expect(status.authenticated).toBe(false)
    expect(status.detail.length).toBeGreaterThan(0)
  })

  it('fails data calls with a typed not_configured error instead of inventing data', async () => {
    const invoke: Array<() => Promise<unknown>> = [
      () => platform.getChannel(),
      () => platform.getContent(),
      () => platform.search('x'),
      () => platform.getComments('1'),
      () => platform.getStreams(),
      () => platform.getAnalytics({ range: { start: '2026-01-01', end: '2026-02-01' }, metrics: ['views'] }),
    ]
    for (const call of invoke) {
      await expect(call()).rejects.toBeInstanceOf(PlatformError)
      await expect(call()).rejects.toMatchObject({ code: 'not_configured' })
    }
  })

  it('cannot be authenticated while unimplemented', async () => {
    const result = await platform.authenticate()
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })
})
