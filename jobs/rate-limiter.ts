/**
 * Centralized rate limiting (spec §140).
 *
 * One token bucket per API key (e.g. "twitch", "youtube"), so we never spawn
 * uncontrolled parallel platform requests. Time and sleep are injectable so the
 * behaviour is testable without real waiting.
 */
export interface Clock {
  now(): number
  sleep(ms: number): Promise<void>
}

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
}

export class TokenBucket {
  private tokens: number
  private lastRefill: number

  constructor(
    private readonly capacity: number,
    /** Tokens replenished per millisecond. */
    private readonly refillPerMs: number,
    private readonly clock: Clock = realClock,
  ) {
    this.tokens = capacity
    this.lastRefill = clock.now()
  }

  private refill(): void {
    const now = this.clock.now()
    const elapsed = now - this.lastRefill
    if (elapsed > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerMs)
      this.lastRefill = now
    }
  }

  async acquire(cost = 1): Promise<void> {
    if (cost > this.capacity) {
      throw new Error(`Requested ${cost} tokens but bucket capacity is ${this.capacity}`)
    }
    for (;;) {
      this.refill()
      if (this.tokens >= cost) {
        this.tokens -= cost
        return
      }
      const deficit = cost - this.tokens
      const waitMs = Math.max(1, Math.ceil(deficit / this.refillPerMs))
      await this.clock.sleep(waitMs)
    }
  }

  available(): number {
    this.refill()
    return Math.floor(this.tokens)
  }
}

export class RateLimitManager {
  private readonly buckets = new Map<string, TokenBucket>()

  constructor(private readonly clock: Clock = realClock) {}

  /** Declares a bucket: `capacity` tokens, refilled at `refillPerSecond`. */
  register(key: string, capacity: number, refillPerSecond: number): void {
    this.buckets.set(key, new TokenBucket(capacity, refillPerSecond / 1000, this.clock))
  }

  async acquire(key: string, cost = 1): Promise<void> {
    const bucket = this.buckets.get(key)
    // Unknown key means unthrottled; callers must register to be limited.
    if (!bucket) return
    await bucket.acquire(cost)
  }

  available(key: string): number | null {
    return this.buckets.get(key)?.available() ?? null
  }
}

/**
 * Default buckets from the integration audit:
 *  - Twitch Helix: ~800 points/minute per client.
 *  - YouTube Data API: 10,000 units/day (search costs 100).
 */
export function createDefaultRateLimits(clock: Clock = realClock): RateLimitManager {
  const manager = new RateLimitManager(clock)
  manager.register('twitch', 800, 800 / 60)
  manager.register('youtube', 10_000, 10_000 / 86_400)
  return manager
}
