import { PlatformError } from './errors'
import type {
  Capability,
  Channel,
  Comment,
  CreatorPlatform,
  DateRange,
  MetricSeries,
  PlatformCapabilities,
  PlatformId,
  PlatformStatus,
  SearchResult,
  Stream,
  Video,
} from './types'

/**
 * A platform whose adapter is architecturally present but not implemented yet.
 *
 * Every data method raises a typed `not_configured` error, and `testConnection`
 * reports the honest state, so the UI can show "planned" without inventing data
 * (spec §66, §93, §130).
 */
export function createPlannedPlatform(options: {
  id: PlatformId
  displayName: string
  capabilities: Capability[]
  note: string
  requiresConnection?: Capability[]
}): CreatorPlatform {
  const capabilities: PlatformCapabilities = {
    platform: options.id,
    capabilities: options.capabilities,
    requiresConnection: options.requiresConnection ?? options.capabilities,
  }

  // Async so callers always receive a rejected promise (never a synchronous throw).
  const unavailable = async (): Promise<never> => {
    throw new PlatformError('not_configured', options.id, options.note)
  }

  return {
    id: options.id,
    displayName: options.displayName,
    capabilities,
    async authenticate(): Promise<{ ok: boolean; accountLabel?: string; error?: string }> {
      return { ok: false, error: options.note }
    },
    async disconnect(): Promise<void> {
      return undefined
    },
    async testConnection(): Promise<PlatformStatus> {
      return {
        connected: false,
        authenticated: false,
        detail: options.note,
        checkedAt: new Date().toISOString(),
      }
    },
    getChannel(): Promise<Channel | null> {
      return unavailable()
    },
    getContent(): Promise<Video[]> {
      return unavailable()
    },
    getAnalytics(_options: { range: DateRange; metrics: string[] }): Promise<MetricSeries[]> {
      return unavailable()
    },
    search(_query: string): Promise<SearchResult[]> {
      return unavailable()
    },
    getComments(_videoExternalId: string): Promise<Comment[]> {
      return unavailable()
    },
    getStreams(): Promise<Stream[]> {
      return unavailable()
    },
  }
}
