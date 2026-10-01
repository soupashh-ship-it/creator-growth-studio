import { describe, expect, it } from 'vitest'
import { buildConversionFunnel, conversionSuggestions } from '@core/scores/conversion'
import type { ChannelRow, VideoRow } from '@database/repositories'

function channel(over: Partial<ChannelRow> = {}): ChannelRow {
  return {
    id: 'c1',
    workspace_id: 'w1',
    platform: 'youtube',
    external_id: 'UC1',
    title: 'Chan',
    subscriber_count: null,
    video_count: null,
    view_count: null,
    fetched_at: null,
    ...over,
  }
}

function video(over: Partial<VideoRow> = {}): VideoRow {
  return {
    id: 'v1',
    workspace_id: 'w1',
    platform: 'youtube',
    external_id: 'vid1',
    title: 'Video',
    published_at: '2026-09-01T00:00:00Z',
    views: null,
    likes: null,
    comments: null,
    project_id: null,
    ...over,
  }
}

describe('buildConversionFunnel', () => {
  it('computes views→subs from official totals and engagement from snapshots', () => {
    const funnel = buildConversionFunnel(
      channel({ subscriber_count: 8741, view_count: 500_000 }),
      [
        video({ views: 10_000, likes: 500, comments: 40 }),
        video({ views: 20_000, likes: 400, comments: 60 }),
      ],
    )
    const viewsToSubs = funnel.stages.find((stage) => stage.key === 'views_to_subs')
    expect(viewsToSubs?.rate).toBeCloseTo(1.7, 1)
    const likes = funnel.stages.find((stage) => stage.key === 'views_to_engagement')
    expect(likes?.rate).toBe(3) // 900 / 30000
    const comments = funnel.stages.find((stage) => stage.key === 'views_to_comments')
    expect(comments?.rate).toBeCloseTo(0.3, 1)
    expect(funnel.availableCount).toBe(3)
  })

  it('keeps the members stage unavailable by design and says why', () => {
    const funnel = buildConversionFunnel(channel({ subscriber_count: 100 }), [])
    const members = funnel.stages.find((stage) => stage.key === 'subs_to_members')
    expect(members?.rate).toBeNull()
    expect(members?.whyUnavailable).toContain('by design')
  })

  it('marks everything unavailable with no stored data', () => {
    const funnel = buildConversionFunnel(null, [])
    expect(funnel.availableCount).toBe(0)
    expect(funnel.stages.every((stage) => stage.rate === null)).toBe(true)
  })
})

describe('conversionSuggestions', () => {
  it('gives data-aware suggestions only for available stages', () => {
    const funnel = buildConversionFunnel(
      channel({ subscriber_count: 8741, view_count: 500_000 }),
      [video({ views: 10_000, likes: 100, comments: 10 })],
    )
    const suggestions = conversionSuggestions(funnel)
    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions.some((suggestion) => suggestion.detail.includes('1.7%'))).toBe(true)
  })
})
