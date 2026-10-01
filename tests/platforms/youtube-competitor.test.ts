import { afterEach, describe, expect, it, vi } from 'vitest'
import { YouTubeClient } from '@platforms/youtube/client'

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

afterEach(() => vi.unstubAllGlobals())

function client(): YouTubeClient {
  return new YouTubeClient({ getAccessToken: async () => 'token' })
}

describe('YouTubeClient public channel lookup', () => {
  it('resolves a handle with the official forHandle filter and reads stats', async () => {
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(String(url))
        return json({
          items: [
            {
              id: 'UCrival',
              snippet: { title: 'Rival Channel' },
              statistics: { subscriberCount: '500000', videoCount: '300', viewCount: '9000000' },
            },
          ],
        })
      }),
    )

    const channel = await client().getChannelByHandle('RivalChannel')
    expect(channel?.externalId).toBe('UCrival')
    expect(channel?.title).toBe('Rival Channel')
    expect(channel?.subscriberCount).toBe(500000)
    // A bare handle is normalised to the @ form the API expects.
    expect(decodeURIComponent(urls[0] ?? '')).toContain('forHandle=@RivalChannel')
  })

  it('returns null when the handle does not resolve', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ items: [] })))
    expect(await client().getChannelByHandle('@nobody')).toBeNull()
  })

  it('reads a competitor’s uploads playlist without using the 100-unit search endpoint', async () => {
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url)
        urls.push(u)
        if (u.includes('/channels') && u.includes('id=UCrival')) {
          return json({ items: [{ contentDetails: { relatedPlaylists: { uploads: 'UU_rival' } } }] })
        }
        if (u.includes('/playlistItems')) {
          return json({
            items: [
              {
                contentDetails: { videoId: 'v1' },
                snippet: { title: 'Rival video', publishedAt: '2026-01-01T00:00:00Z' },
              },
            ],
          })
        }
        if (u.includes('/videos')) {
          return json({ items: [{ id: 'v1', statistics: { viewCount: '120000', likeCount: '5000', commentCount: '300' } }] })
        }
        return json({})
      }),
    )

    const uploads = await client().listChannelUploads('UCrival', 10)
    expect(uploads).toHaveLength(1)
    expect(uploads[0]?.title).toBe('Rival video')
    expect(uploads[0]?.stats.views).toBe(120000)
    expect(urls.some((u) => u.includes('/search'))).toBe(false)
  })

  it('returns no uploads when the channel has no uploads playlist', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ items: [] })))
    expect(await client().listChannelUploads('UCmissing')).toEqual([])
  })
})
