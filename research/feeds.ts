import { tokenize } from './keywords'

/**
 * External trend signals (spec §23).
 *
 * The app ingests PUBLIC syndication feeds (RSS 2.0 and Atom) that a creator
 * chooses to follow — news feeds, blog feeds, and Reddit's public `.rss` feeds.
 * These are published for feed readers and are not scraped pages. Nothing here
 * claims search volume; a topic's weight is simply how often it appears across
 * the titles the creator subscribed to, with the raw titles kept as evidence.
 */

export interface FeedItem {
  title: string
  link: string | null
  publishedAt: string | null
  source: string
}

export interface FeedTopic {
  topic: string
  /** How many feed titles contained this token. */
  count: number
  sources: string[]
  /** Up to three raw titles the topic came from (evidence, never invented). */
  examples: string[]
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
}

export function decodeEntities(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (match) => ENTITIES[match] ?? match)
}

/** Removes CDATA wrappers, tags and entities, collapsing whitespace. */
function cleanText(value: string): string {
  let text = value.trim()
  text = text.replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/u, '$1')
  text = text.replace(/<[^>]+>/g, ' ')
  text = decodeEntities(text)
  return text.replace(/\s+/g, ' ').trim()
}

function firstTag(block: string, tags: string[]): string | null {
  for (const tag of tags) {
    const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i').exec(block)
    if (match && match[1] !== undefined) {
      const cleaned = cleanText(match[1])
      if (cleaned) return cleaned
    }
  }
  return null
}

/** Atom links live in the `href` attribute rather than element text. */
function atomLink(block: string): string | null {
  const match = /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/i.exec(block)
  return match && match[1] ? decodeEntities(match[1]) : null
}

/**
 * Parses RSS 2.0 (`<item>`) and Atom (`<entry>`) documents. Malformed input
 * yields whatever items could be read instead of throwing, so one broken feed
 * never takes down a whole sync.
 */
export function parseFeed(xml: string, source: string): FeedItem[] {
  const blocks = [
    ...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi),
    ...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi),
  ].map((match) => match[0])

  const items: FeedItem[] = []
  for (const block of blocks) {
    const title = firstTag(block, ['title'])
    if (!title) continue
    const link = atomLink(block) ?? firstTag(block, ['link', 'guid'])
    const publishedAt = firstTag(block, ['pubDate', 'published', 'updated', 'dc:date'])
    items.push({ title, link, publishedAt, source })
  }
  return items
}

export interface FeedTopicOptions {
  limit?: number
  /** Minimum number of titles a token must appear in. */
  minCount?: number
}

/**
 * Ranks tokens across feed titles. `count` is how many distinct titles mention
 * the token; the titles are kept as examples so the creator can judge relevance.
 */
export function extractFeedTopics(items: FeedItem[], options: FeedTopicOptions = {}): FeedTopic[] {
  const limit = options.limit ?? 25
  const minCount = options.minCount ?? 2
  const byTopic = new Map<string, { count: number; sources: Set<string>; examples: string[] }>()

  for (const item of items) {
    const seen = new Set<string>()
    for (const token of tokenize(item.title)) {
      if (seen.has(token)) continue
      seen.add(token)
      const entry = byTopic.get(token) ?? { count: 0, sources: new Set<string>(), examples: [] }
      entry.count += 1
      entry.sources.add(item.source)
      if (entry.examples.length < 3) entry.examples.push(item.title)
      byTopic.set(token, entry)
    }
  }

  return [...byTopic.entries()]
    .filter(([, entry]) => entry.count >= minCount)
    .map(([topic, entry]) => ({
      topic,
      count: entry.count,
      sources: [...entry.sources].sort(),
      examples: entry.examples,
    }))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic))
    .slice(0, limit)
}

/** Accepts a textarea blob (newline/comma separated) and returns valid http(s) URLs. */
export function parseFeedSources(text: string): string[] {
  return [...new Set(
    text
      .split(/[\n,]/)
      .map((line) => line.trim())
      .filter((line) => /^https?:\/\//i.test(line)),
  )]
}

export const FEED_NOTES = [
  'Only public RSS/Atom feeds you add are read — news and blog feeds, and Reddit’s published .rss feeds. Pages are never scraped.',
  'Topic weight is how many feed titles mention a word. It is NOT search volume and not a platform metric.',
  'The raw titles are stored as evidence so you can check why a topic surfaced.',
]
