import { describe, expect, it } from 'vitest'
import {
  CONFIDENT_SCORE,
  normalizeTitle,
  suggestProjectLinks,
  titleSimilarity,
} from '@core/planning/link-projects'

describe('normalizeTitle', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeTitle("Path of Exile 2: Best Build?!")).toBe('path of exile 2 best build')
  })
})

describe('titleSimilarity', () => {
  it('returns 1 for identical titles', () => {
    expect(titleSimilarity('Lightning Arrow Build', 'lightning arrow build')).toBe(1)
  })

  it('scores a contained title highly', () => {
    expect(titleSimilarity('Lightning Arrow Build', 'Lightning Arrow Build — Full Guide')).toBeGreaterThanOrEqual(
      CONFIDENT_SCORE,
    )
  })

  it('scores unrelated titles low', () => {
    expect(titleSimilarity('Lightning Arrow Build', 'Cozy farming stream highlights')).toBeLessThan(0.2)
  })

  it('returns 0 when either title is empty', () => {
    expect(titleSimilarity('', 'anything')).toBe(0)
  })
})

describe('suggestProjectLinks', () => {
  const projects = [
    { id: 'p1', title: 'Lightning Arrow Build Guide' },
    { id: 'p2', title: 'Cozy Farm Tour' },
  ]

  it('proposes a confident match for a near-identical title', () => {
    const links = suggestProjectLinks(projects, [
      { id: 'v1', title: 'Lightning Arrow Build Guide (Full Breakdown)' },
    ])
    expect(links).toHaveLength(1)
    expect(links[0]?.projectId).toBe('p1')
    expect(links[0]?.videoId).toBe('v1')
    expect(links[0]?.confident).toBe(true)
    expect(links[0]?.reason).toContain('%')
  })

  it('skips videos that are already linked', () => {
    const links = suggestProjectLinks(projects, [
      { id: 'v1', title: 'Lightning Arrow Build Guide', project_id: 'p9' },
    ])
    expect(links).toHaveLength(0)
  })

  it('ignores videos without a title', () => {
    const links = suggestProjectLinks(projects, [{ id: 'v1', title: null }])
    expect(links).toHaveLength(0)
  })

  it('keeps links one-to-one (strongest match wins)', () => {
    const links = suggestProjectLinks(projects, [
      { id: 'v1', title: 'Lightning Arrow Build Guide' },
      { id: 'v2', title: 'Lightning Arrow Build Guide 2026' },
    ])
    const videoIds = links.map((link) => link.videoId)
    expect(new Set(videoIds).size).toBe(videoIds.length)
    expect(links).toHaveLength(1)
  })

  it('returns nothing when titles are unrelated', () => {
    expect(suggestProjectLinks(projects, [{ id: 'v1', title: 'random unrelated upload' }])).toHaveLength(0)
  })
})
