import { extractFeedTopics, parseFeed, parseFeedSources, type FeedItem, type FeedTopic } from '../research/feeds'
import { getServices } from './services'

/**
 * External trend ingestion (spec §23).
 *
 * Fetches ONLY the public RSS/Atom feeds the creator adds. There is no scraping
 * and no unofficial endpoint: these are syndication feeds published for exactly
 * this purpose. The observed topics are stored in the `trends` table with the
 * feed titles that produced them.
 */

export interface FeedFetchResult {
  source: string
  ok: boolean
  items: number
  error: string | null
}

export interface FeedSyncResult {
  fetched: number
  totalItems: number
  results: FeedFetchResult[]
  topics: FeedTopic[]
}

const MAX_FEEDS = 25
const FETCH_TIMEOUT_MS = 12_000

async function fetchFeed(url: string): Promise<FeedItem[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5',
        'user-agent': 'CreatorGrowthStudio/0.1 (local feed reader)',
      },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const text = await response.text()
    return parseFeed(text, url)
  } finally {
    clearTimeout(timer)
  }
}

/** Validates and de-duplicates the feed list, dropping anything non-http(s). */
export function normalizeFeedSources(urls: string[]): string[] {
  return parseFeedSources(urls.join('\n')).slice(0, MAX_FEEDS)
}

export async function syncFeeds(workspaceId: string, rawUrls: string[]): Promise<FeedSyncResult> {
  const urls = normalizeFeedSources(rawUrls)
  if (urls.length === 0) {
    throw new Error('Add at least one http(s) RSS/Atom feed URL first.')
  }

  const results: FeedFetchResult[] = []
  const items: FeedItem[] = []
  for (const url of urls) {
    try {
      const parsed = await fetchFeed(url)
      items.push(...parsed)
      results.push({ source: url, ok: true, items: parsed.length, error: null })
    } catch (cause) {
      const aborted = cause instanceof Error && cause.name === 'AbortError'
      results.push({
        source: url,
        ok: false,
        items: 0,
        error: aborted ? 'Timed out' : cause instanceof Error ? cause.message : 'Fetch failed',
      })
    }
  }

  const topics = extractFeedTopics(items)
  const { repos } = getServices()
  // Replace only the feed-derived rows so re-syncs reflect the current set.
  repos.clearTrends(workspaceId)
  for (const topic of topics) {
    repos.upsertTrend({
      workspaceId,
      topic: topic.topic,
      source: topic.sources.join(', '),
      freshness: topic.count,
      rawJson: JSON.stringify(topic.examples),
    })
  }

  return { fetched: urls.length, totalItems: items.length, results, topics }
}

export type TrendRow = {
  topic: string
  source: string
  freshness: number | null
  last_seen: string | null
  raw_json: string
}

export function listTrendTopics(workspaceId: string): TrendRow[] {
  return getServices().repos.listTrends(workspaceId)
}
