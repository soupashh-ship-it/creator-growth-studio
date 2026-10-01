import { describe, expect, it } from 'vitest'
import { RateLimitManager, TokenBucket, createDefaultRateLimits, type Clock } from '@jobs/rate-limiter'

/** Deterministic clock: sleep advances time instead of waiting. */
function fakeClock(): Clock & { advance(ms: number): void; sleeps: number[] } {
  let time = 0
  const sleeps: number[] = []
  return {
    now: () => time,
    sleep: async (ms: number) => {
      sleeps.push(ms)
      time += ms
    },
    advance: (ms: number) => {
      time += ms
    },
    sleeps,
  }
}

describe('TokenBucket', () => {
  it('allows requests up to capacity without waiting', async () => {
    const clock = fakeClock()
    const bucket = new TokenBucket(3, 1 / 1000, clock)
    await bucket.acquire()
    await bucket.acquire()
    await bucket.acquire()
    expect(clock.sleeps).toHaveLength(0)
    expect(bucket.available()).toBe(0)
  })

  it('waits for a refill when exhausted', async () => {
    const clock = fakeClock()
    const bucket = new TokenBucket(1, 1 / 1000, clock) // 1 token per second
    await bucket.acquire()
    await bucket.acquire()
    expect(clock.sleeps.length).toBeGreaterThan(0)
    expect(clock.sleeps[0]).toBe(1000)
  })

  it('refills over time', () => {
    const clock = fakeClock()
    const bucket = new TokenBucket(10, 1 / 1000, clock)
    for (let i = 0; i < 10; i += 1) void bucket.acquire()
    clock.advance(5000)
    expect(bucket.available()).toBe(5)
  })

  it('rejects a cost larger than capacity', async () => {
    const bucket = new TokenBucket(1, 1 / 1000, fakeClock())
    await expect(bucket.acquire(2)).rejects.toThrow(/capacity/)
  })
})

describe('RateLimitManager', () => {
  it('throttles a registered key and leaves unknown keys unthrottled', async () => {
    const clock = fakeClock()
    const manager = new RateLimitManager(clock)
    manager.register('twitch', 1, 1)

    await manager.acquire('twitch')
    await manager.acquire('twitch')
    expect(clock.sleeps.length).toBeGreaterThan(0)

    await manager.acquire('unregistered', 999) // no bucket -> no wait
  })

  it('registers default Twitch and YouTube buckets', () => {
    const manager = createDefaultRateLimits(fakeClock())
    expect(manager.available('twitch')).toBe(800)
    expect(manager.available('youtube')).toBe(10000)
    expect(manager.available('nope')).toBeNull()
  })
})
