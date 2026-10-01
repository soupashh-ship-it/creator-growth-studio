import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_TTLS_MS, MemoryCache } from '@jobs/cache'
import { JobQueue } from '@jobs/queue'
import { freshnessBadge, relativeTime } from '@core/format/freshness'

describe('MemoryCache', () => {
  it('stores and reads unexpired values with provenance', () => {
    let now = 1_000
    const cache = new MemoryCache(() => now)
    cache.set('channel:1', { name: 'SupAshh' }, 60_000, 'YouTube Data API')
    expect(cache.get<{ name: string }>('channel:1')?.value.name).toBe('SupAshh')
    expect(cache.get('channel:1')?.source).toBe('YouTube Data API')
    expect(cache.isFresh('channel:1')).toBe(true)

    now += 61_000
    expect(cache.get('channel:1')).toBeNull()
    expect(cache.isFresh('channel:1')).toBe(false)
  })

  it('supports delete/clear/keys', () => {
    const cache = new MemoryCache()
    cache.set('a', 1, 1000)
    cache.set('b', 2, 1000)
    expect(cache.keys().sort()).toEqual(['a', 'b'])
    cache.delete('a')
    expect(cache.keys()).toEqual(['b'])
    cache.clear()
    expect(cache.keys()).toEqual([])
  })

  it('exposes the documented default TTLs', () => {
    expect(DEFAULT_TTLS_MS.channel).toBe(60 * 60 * 1000)
    expect(DEFAULT_TTLS_MS.keywords).toBe(6 * 60 * 60 * 1000)
    expect(DEFAULT_TTLS_MS.trends).toBe(60 * 60 * 1000)
  })
})

describe('freshness badges', () => {
  const now = Date.parse('2026-09-30T12:00:00Z')

  it('labels recency levels', () => {
    expect(freshnessBadge('2026-09-30T11:59:30Z', now).label).toBe('LIVE')
    expect(freshnessBadge('2026-09-30T11:55:00Z', now).label).toBe('5m old')
    expect(freshnessBadge('2026-09-30T10:00:00Z', now).label).toBe('2h old')
    expect(freshnessBadge('2026-09-29T09:00:00Z', now).label).toBe('Yesterday')
    expect(freshnessBadge('2026-09-01T00:00:00Z', now).label).toBe('Stale')
  })

  it('handles invalid timestamps', () => {
    expect(freshnessBadge('not-a-date', now).level).toBe('stale')
    expect(relativeTime(new Date(now).toISOString(), now)).toBe('just now')
  })
})

describe('JobQueue', () => {
  it('runs jobs and records completion', async () => {
    const queue = new JobQueue()
    const job = queue.enqueue('test', async () => 42)
    await vi.waitFor(() => expect(queue.get(job.id)?.state).toBe('completed'))
    expect(queue.get(job.id)?.result).toBe(42)
  })

  it('records failures without throwing', async () => {
    const queue = new JobQueue()
    const job = queue.enqueue('test', async () => {
      throw new Error('nope')
    })
    await vi.waitFor(() => expect(queue.get(job.id)?.state).toBe('failed'))
    expect(queue.get(job.id)?.error).toBe('nope')
  })

  it('cancels a running job via its abort signal', async () => {
    const queue = new JobQueue()
    const started = new Promise<void>((resolve) => {
      queue.enqueue('test', async (signal) => {
        resolve()
        return new Promise((_res, rej) => {
          signal.addEventListener('abort', () => rej(new Error('aborted')))
        })
      })
    })
    await started
    const [job] = queue.list()
    expect(queue.cancel(job!.id)).toBe(true)
    await vi.waitFor(() => expect(queue.get(job!.id)?.state).toBe('cancelled'))
  })

  it('refuses to cancel a finished job', async () => {
    const queue = new JobQueue()
    const job = queue.enqueue('test', async () => 1)
    await vi.waitFor(() => expect(queue.get(job.id)?.state).toBe('completed'))
    expect(queue.cancel(job.id)).toBe(false)
  })
})
