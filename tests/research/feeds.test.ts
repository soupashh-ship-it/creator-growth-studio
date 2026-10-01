import { describe, expect, it } from 'vitest'
import { extractFeedTopics, parseFeed, parseFeedSources } from '@research/feeds'

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Example blog</title>
  <item>
    <title><![CDATA[Lightning Arrow build guide for 0.4]]></title>
    <link>https://example.com/a</link>
    <pubDate>Mon, 29 Sep 2026 10:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Lightning Arrow &amp; Deadeye changes</title>
    <link>https://example.com/b</link>
    <pubDate>Sun, 28 Sep 2026 10:00:00 GMT</pubDate>
  </item>
</channel></rss>`

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>News</title>
  <entry>
    <title>New league starter builds</title>
    <link href="https://news.example.com/1" />
    <updated>2026-09-30T12:00:00Z</updated>
  </entry>
</feed>`

describe('parseFeed', () => {
  it('parses RSS items, CDATA and entities', () => {
    const items = parseFeed(RSS, 'https://example.com/feed.xml')
    expect(items).toHaveLength(2)
    expect(items[0]?.title).toBe('Lightning Arrow build guide for 0.4')
    expect(items[1]?.title).toBe('Lightning Arrow & Deadeye changes')
    expect(items[0]?.link).toBe('https://example.com/a')
    expect(items[0]?.source).toBe('https://example.com/feed.xml')
  })

  it('parses Atom entries and the href link attribute', () => {
    const items = parseFeed(ATOM, 'https://news.example.com/atom')
    expect(items).toHaveLength(1)
    expect(items[0]?.title).toBe('New league starter builds')
    expect(items[0]?.link).toBe('https://news.example.com/1')
    expect(items[0]?.publishedAt).toBe('2026-09-30T12:00:00Z')
  })

  it('returns nothing for malformed input instead of throwing', () => {
    expect(parseFeed('<html><body>not a feed</body></html>', 'x')).toEqual([])
  })
})

describe('extractFeedTopics', () => {
  it('counts topics across titles and keeps examples', () => {
    const items = parseFeed(RSS, 'a').concat(parseFeed(ATOM, 'b'))
    const topics = extractFeedTopics(items, { minCount: 2 })
    const lightning = topics.find((t) => t.topic === 'lightning')
    expect(lightning).toBeDefined()
    expect(lightning?.count).toBe(2)
    expect(lightning?.examples.length).toBeGreaterThan(0)
    expect(lightning?.examples.every((example) => example.toLowerCase().includes('lightning'))).toBe(true)
  })

  it('drops topics below the minimum count', () => {
    const items = parseFeed(ATOM, 'a')
    const topics = extractFeedTopics(items, { minCount: 2 })
    expect(topics.find((t) => t.topic === 'league')).toBeUndefined()
  })
})

describe('parseFeedSources', () => {
  it('accepts newline and comma separated http(s) URLs only', () => {
    const urls = parseFeedSources('https://a.com/feed.xml, https://b.com/rss\njavascript:alert(1)\nftp://c.com')
    expect(urls).toEqual(['https://a.com/feed.xml', 'https://b.com/rss'])
  })

  it('de-duplicates', () => {
    expect(parseFeedSources('https://a.com\nhttps://a.com')).toEqual(['https://a.com'])
  })
})
