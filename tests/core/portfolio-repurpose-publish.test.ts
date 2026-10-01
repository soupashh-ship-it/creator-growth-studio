import { describe, expect, it } from 'vitest'
import { classifyContent, buildPortfolioBalance } from '@research/portfolio'
import { buildRepurposeKit } from '@core/writing/repurpose'
import { reviewPublishedVideo } from '@core/writing/post-publish'
import { renderBriefing, DEFAULT_CONTEXT } from '@ai/copilot'

describe('content portfolio', () => {
  it('classifies lifecycle categories from title patterns', () => {
    expect(classifyContent('Best Lightning Arrow Build in PoE 2')).toBe('evergreen')
    expect(classifyContent('PoE 2 Patch 0.4 reaction')).toBe('news')
    expect(classifyContent('Patch 0.4 Deadeye changes')).toBe('trend')
    expect(classifyContent('Day 12 of hardcore mode')).toBe('format')
    expect(classifyContent('My holiday gaming setup')).toBe('evergreen')
  })

  it('computes per-video shares and honest notes', () => {
    const balance = buildPortfolioBalance([
      { title: 'Best PoE 2 Build' },
      { title: 'Ultimate Beginner Guide' },
      { title: 'Patch 0.4 overview' },
    ] as never)
    const evergreen = balance.slices.find((slice) => slice.category === 'evergreen')
    expect(evergreen?.sharePct).toBeCloseTo(66.7, 0)
    expect(balance.notes.join(' ')).toContain('heuristic')
  })

  it('explains when nothing is stored', () => {
    const balance = buildPortfolioBalance([])
    expect(balance.slices).toHaveLength(0)
    expect(balance.notes.some((note) => note.includes('No titled videos'))).toBe(true)
  })
})

describe('repurposing kit', () => {
  it('builds derivative set from the creator payoff statement', () => {
    const kit = buildRepurposeKit({
      title: 'PoE 2 Budget Deadeye',
      payoff: 'a 10-divine build that clears pinnacle bosses',
      keyword: 'poe 2 deadeye',
    })
    expect(kit.shortsConcepts.length).toBeGreaterThanOrEqual(3)
    expect(kit.captions.length).toBeGreaterThanOrEqual(3)
    expect(kit.communityPoll.options.length).toBe(4)
    expect(kit.followUpIdea.title).toContain('differently')
    expect(kit.pinnedComment).toBeTruthy()
  })

  it('falls back to honest placeholders rather than invented stats', () => {
    const kit = buildRepurposeKit({ title: '', payoff: '' })
    expect(kit.shortsConcepts[0]?.firstLine).toContain('the main result')
  })
})

describe('post-publish review', () => {
  const base = { title: 'Best PoE 2 Deadeye Build', likes: 100, comments: 10 }

  it('flags underperformers for thumbnail revision and titles missing keywords', () => {
    const review = reviewPublishedVideo({
      ...base,
      title: 'WEIRD NEW VIDEO!!!',
      primaryKeyword: 'deadeye build',
      views: 1000,
      channelMedianViews: 10_000,
    })
    expect(review.belowMedian).toBe(true)
    expect(review.medianRatio).toBeCloseTo(0.1, 1)
    expect(review.suggestions.some((s) => s.action.toLowerCase().includes('thumbnail'))).toBe(true)
    expect(review.suggestions.some((s) => s.action.toLowerCase().includes('keyword'))).toBe(true)
  })

  it('recommends a follow-up for strong performers and otherwise leaves it alone', () => {
    const strong = reviewPublishedVideo({ ...base, views: 30_000, channelMedianViews: 10_000 })
    expect(strong.suggestions.some((s) => s.action.toLowerCase().includes('follow-up'))).toBe(true)

    const healthy = reviewPublishedVideo({ ...base, views: 10_000, channelMedianViews: 10_000 })
    expect(healthy.suggestions.some((s) => s.action.includes('Healthy'))).toBe(true)
  })

  it('notes that the app never edits platform content itself', () => {
    const review = reviewPublishedVideo({ ...base, views: null, channelMedianViews: null })
    expect(review.notes.join(' ')).toContain('never edits platform content')
    expect(review.medianRatio).toBeNull()
  })
})

describe('briefing context selector', () => {
  const parts = {
    performance: ['PERF-LINE'],
    topVideos: ['VIDEO-LINE'],
    patterns: ['PATTERN-LINE'],
    topics: ['TOPIC-LINE'],
    keywords: ['KEYWORD-LINE'],
    comments: ['COMMENT-LINE'],
    profile: ['PROFILE-LINE'],
    knowledge: ['KNOWLEDGE-LINE'],
  }

  it('includes defaults and omits knowledge by default', () => {
    const text = renderBriefing(parts, DEFAULT_CONTEXT)
    expect(text).toContain('PERF-LINE')
    expect(text).not.toContain('KNOWLEDGE-LINE')
  })

  it('lists omitted sections as not available', () => {
    const text = renderBriefing(parts, { ...DEFAULT_CONTEXT, comments: false, keywords: false })
    expect(text).not.toContain('COMMENT-LINE')
    expect(text).toContain('CONTEXT NOT SHARED BY THE CREATOR')
    expect(text).toContain('treat these as not available')
  })

  it('includes knowledge only when selected', () => {
    const text = renderBriefing(parts, { ...DEFAULT_CONTEXT, knowledge: true })
    expect(text).toContain('KNOWLEDGE-LINE')
  })
})
