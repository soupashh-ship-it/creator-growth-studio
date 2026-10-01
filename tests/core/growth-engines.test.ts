import { describe, expect, it } from 'vitest'
import { sponsorReadiness, buildMediaKit } from '@core/scores/sponsor'
import { buildDiagnosisMetrics, diagnosePerformance } from '@core/scores/diagnosis'
import { goalProgress, parseGoal } from '@core/scores/progress'
import type { VideoRow } from '../../database/repositories'

function video(overrides: Partial<VideoRow>): VideoRow {
  return {
    id: 'v',
    workspace_id: 'w',
    platform: 'youtube',
    external_id: 'x',
    title: 'A video',
    published_at: null,
    views: null,
    likes: null,
    comments: null,
    project_id: null,
    ...overrides,
  }
}

const NOW = Date.parse('2026-10-01T12:00:00Z')
const daysAgo = (n: number): string => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString()

describe('sponsor readiness (§68)', () => {
  it('returns null-score honesty on an empty channel', () => {
    const result = sponsorReadiness({ videos: [], niche: null, now: NOW })
    expect(result.score).toBeNull()
    expect(result.missing.length).toBeGreaterThan(0)
  })

  it('rewards an active, engaged channel over a dormant one', () => {
    const active = [10, 17, 24, 31, 38].map((d, i) =>
      video({ id: `a${i}`, published_at: daysAgo(d), views: 5000 - i * 100, likes: 250, comments: 25 }),
    )
    const dormant = [10, 120, 230].map((d, i) =>
      video({ id: `d${i}`, published_at: daysAgo(d), views: 5000 - i * 100, likes: 250, comments: 25 }),
    )
    const activeScore = sponsorReadiness({ videos: active, niche: 'gaming', now: NOW })
    const dormantScore = sponsorReadiness({ videos: dormant, niche: 'gaming', now: NOW })
    expect(activeScore.score ?? 0).toBeGreaterThan(dormantScore.score ?? 0)
  })

  it('treats a stated niche as a component and documents it', () => {
    const videos = [video({ published_at: daysAgo(5), views: 4000, likes: 200, comments: 20 })]
    const withNiche = sponsorReadiness({ videos, niche: 'pc optimization', now: NOW })
    const withoutNiche = sponsorReadiness({ videos, niche: null, now: NOW })
    const nicheComp = (r: typeof withNiche) => r.components.find((c) => c.key === 'niche_clarity')!
    expect(nicheComp(withNiche).value).toBe(100)
    expect(nicheComp(withoutNiche).value).toBeNull()
  })

  it('builds a media kit from real values with an honesty caveat', () => {
    const videos = [1, 8, 15, 22].map((d, i) =>
      video({ id: `m${i}`, title: `Video ${i}`, published_at: daysAgo(d), views: 6000 - i * 500, likes: 300, comments: 30 }),
    )
    const kit = buildMediaKit('My Channel', { videos, niche: 'tech', now: NOW })
    expect(kit.channelTitle).toBe('My Channel')
    expect(kit.recentAverageViews).toBeGreaterThan(0)
    expect(kit.medianViews).toBeGreaterThan(0)
    expect(kit.uploadsPerMonth).toBeGreaterThan(0)
    expect(kit.pitchOutline.length).toBeGreaterThan(3)
    expect(kit.caveat.toLowerCase()).toContain('not promises')
  })
})

describe('early performance diagnosis (§53)', () => {
  it('reports insufficient-data instead of guessing', () => {
    const metrics = buildDiagnosisMetrics(video({ id: 'v1' }), [])
    const finding = diagnosePerformance(metrics)
    expect(finding.stage).toBe('insufficient-data')
    expect(finding.evidence.some((e) => e.includes('Not available'))).toBe(true)
  })

  it('diagnoses weak CTR + strong retention as a packaging problem', () => {
    const metrics = buildDiagnosisMetrics(video({ id: 'v1', views: 900 }), [
      { video_id: 'v1', impressions: 50_000, ctr: 1.8, avg_view_percent: 62 },
    ])
    const finding = diagnosePerformance(metrics)
    expect(finding.stage).toBe('packaging')
    expect(finding.summary.toLowerCase()).toContain('clicking')
  })

  it('diagnoses strong CTR + weak retention as a content problem', () => {
    const metrics = buildDiagnosisMetrics(video({ id: 'v1', views: 900 }), [
      { video_id: 'v1', impressions: 50_000, ctr: 9.5, avg_view_percent: 18 },
    ])
    const finding = diagnosePerformance(metrics)
    expect(finding.stage).toBe('content')
  })

  it('uses channel medians as the baseline, not absolute claims', () => {
    const metrics = buildDiagnosisMetrics(video({ id: 'v1', views: 900 }), [
      { video_id: 'v1', impressions: 10_000, ctr: 5.0, avg_view_percent: 50 },
    ])
    const finding = diagnosePerformance(metrics)
    expect(finding.evidence.some((e) => e.includes('5.0%'))).toBe(true)
  })
})

describe('goal progress (§119)', () => {
  it('parses human goal phrasing', () => {
    expect(parseGoal('10k subscribers')).toEqual({ goal: 10_000, metric: 'subscribers' })
    expect(parseGoal('1,000,000 views')).toEqual({ goal: 1_000_000, metric: 'views' })
    expect(parseGoal('be more consistent')).toBeNull()
  })

  it('computes 30-day change from real snapshots only', () => {
    const samples = [
      { at: daysAgo(40), subscriberCount: 8300, viewCount: 1_000_000 },
      { at: daysAgo(10), subscriberCount: 8720, viewCount: 1_100_000 },
    ]
    const progress = goalProgress(10_000, 'subscribers', samples, NOW)
    expect(progress.current).toBe(8720)
    expect(progress.baseline).toBe(8300)
    expect(progress.change30d).toBe(420)
    expect(progress.remaining).toBe(1280)
    expect(progress.basis).toContain('real stored observations')
  })

  it('refuses to interpolate or predict dates', () => {
    const samples = [{ at: daysAgo(2), subscriberCount: 8720, viewCount: null }]
    const progress = goalProgress(10_000, 'subscribers', samples, NOW)
    expect(progress.baseline).toBeNull()
    expect(progress.change30d).toBeNull()
    expect(progress.basis).toContain('Not available')
    expect(JSON.stringify(progress)).not.toMatch(/completion|eta|date/i)
  })

  it('says what is missing when no snapshots exist', () => {
    const progress = goalProgress(10_000, 'subscribers', [], NOW)
    expect(progress.current).toBeNull()
    expect(progress.basis).toContain('No channel snapshots stored yet')
  })
})
