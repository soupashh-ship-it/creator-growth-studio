/**
 * TTL cache (spec §79). Prevents unnecessary API calls and powers the freshness
 * badges (spec §137). A DB-backed implementation can substitute this later; the
 * interface is what matters.
 */
export interface CacheEntry<T> {
  value: T
  storedAt: string
  expiresAt: string
  source: string
}

export interface CacheStore {
  get<T>(key: string): CacheEntry<T> | null
  set<T>(key: string, value: T, ttlMs: number, source?: string): void
  isFresh(key: string): boolean
  delete(key: string): void
  clear(): void
  keys(): string[]
}

export class MemoryCache implements CacheStore {
  private readonly entries = new Map<string, CacheEntry<unknown>>()

  constructor(private readonly now: () => number = Date.now) {}

  get<T>(key: string): CacheEntry<T> | null {
    const entry = this.entries.get(key)
    if (!entry) return null
    if (Date.parse(entry.expiresAt) <= this.now()) return null
    return entry as CacheEntry<T>
  }

  set<T>(key: string, value: T, ttlMs: number, source = 'unknown'): void {
    const storedAt = new Date(this.now()).toISOString()
    this.entries.set(key, {
      value,
      storedAt,
      expiresAt: new Date(this.now() + ttlMs).toISOString(),
      source,
    })
  }

  /** True when a value exists that has not expired. */
  isFresh(key: string): boolean {
    return this.get(key) !== null
  }

  delete(key: string): void {
    this.entries.delete(key)
  }

  clear(): void {
    this.entries.clear()
  }

  keys(): string[] {
    return [...this.entries.keys()]
  }
}

/**
 * Default TTLs from the spec (§79). `videoStats` is user-configurable (§139) —
 * the value here is only the default.
 */
export const DEFAULT_TTLS_MS = {
  channel: 60 * 60 * 1000, // 1h
  videoStats: 30 * 60 * 1000, // 30m (configurable)
  keywords: 6 * 60 * 60 * 1000, // 6h
  trends: 60 * 60 * 1000, // 1h
  competitor: 6 * 60 * 60 * 1000, // 6h
} as const

export type CacheTtlKey = keyof typeof DEFAULT_TTLS_MS
