/**
 * Platform abstraction (spec §130, §131).
 *
 * Capabilities differ per platform, so they are declared rather than assumed:
 * the UI renders only the actions a platform actually supports.
 */
export type PlatformId = 'youtube' | 'twitch' | 'instagram' | 'tiktok'

export type Capability =
  | 'channel'
  | 'content'
  | 'analytics'
  | 'search'
  | 'comments'
  | 'streams'
  | 'clips'
  | 'vods'
  | 'schedule'
  | 'members'
  | 'revenue'

export interface PlatformCapabilities {
  platform: PlatformId
  capabilities: Capability[]
  /** Capabilities that additionally require the user to be connected. */
  requiresConnection: Capability[]
}

export interface Channel {
  id: string
  platform: PlatformId
  externalId: string
  title: string
  description: string
  thumbUrl: string | null
  subscriberCount: number | null
  videoCount: number | null
  viewCount: number | null
  fetchedAt: string
}

export interface VideoStats {
  views: number | null
  likes: number | null
  comments: number | null
}

export interface Video {
  platform: PlatformId
  externalId: string
  channelId: string
  title: string
  description: string
  publishedAt: string
  durationS: number | null
  tags: string[]
  category: string | null
  thumbUrl: string | null
  stats: VideoStats
}

export interface DateRange {
  start: string
  end: string
}

export interface MetricPoint {
  date: string
  value: number
}

export interface MetricSeries {
  metric: string
  points: MetricPoint[]
  /** e.g. 'YouTube Analytics API' (§65). */
  source: string
}

export interface SearchResult {
  externalId: string
  title: string
  channelTitle: string
  publishedAt: string
  thumbUrl: string | null
  description: string
}

export interface Comment {
  externalId: string
  author: string
  body: string
  publishedAt: string | null
  likeCount: number | null
}

export interface Stream {
  externalId: string
  title: string
  category: string | null
  startedAt: string | null
  endedAt: string | null
  isLive: boolean
  peakViewers: number | null
}

export interface PlatformStatus {
  connected: boolean
  authenticated: boolean
  detail: string
  checkedAt: string
}

export interface CreatorPlatform {
  readonly id: PlatformId
  readonly displayName: string
  readonly capabilities: PlatformCapabilities
  authenticate(): Promise<{ ok: boolean; accountLabel?: string; error?: string; instructions?: string }>
  disconnect(): Promise<void>
  testConnection(): Promise<PlatformStatus>
  getChannel(): Promise<Channel | null>
  getContent(options?: { limit?: number; since?: string }): Promise<Video[]>
  getAnalytics(options: { range: DateRange; metrics: string[] }): Promise<MetricSeries[]>
  search(query: string): Promise<SearchResult[]>
  getComments(videoExternalId: string): Promise<Comment[]>
  getStreams(options?: { live?: boolean }): Promise<Stream[]>
}
