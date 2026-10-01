import { describe, expect, it } from 'vitest'
import { optimizeSeo, truncateTitle } from '@core/seo/optimizer'
import type { SeoInput } from '@core/scores/seo'

const base: SeoInput = {
  title: 'PoE 2 Deadeye Build',
  description: '',
  tags: [],
  primaryKeyword: 'poe 2 deadeye',
  videoType: 'build guide',
  expectedSubtopics: ['lightning arrow', 'gear', 'bosses'],
}

describe('truncateTitle', () => {
  it('leaves short titles alone and never cuts mid-word', () => {
    expect(truncateTitle('Short title')).toBe('Short title')
    const long = 'This is a deliberately very long video title that exceeds the recommended limit by a lot'
    const cut = truncateTitle(long, 50)
    expect(cut.length).toBeLessThanOrEqual(50)
    expect(long.startsWith(cut)).toBe(true)
    expect(cut.endsWith(' ')).toBe(false)
  })
})

describe('optimizeSeo', () => {
  it('front-loads the primary keyword and improves the score', () => {
    const result = optimizeSeo(base)
    expect(result.draft.title.toLowerCase()).toContain('poe 2 deadeye')
    expect(result.changes.some((c) => c.field === 'title')).toBe(true)
    expect(result.after.result.score ?? 0).toBeGreaterThanOrEqual(result.before.result.score ?? 0)
  })

  it('keeps the keyword even when the title has to be truncated', () => {
    const long = optimizeSeo({
      ...base,
      title: 'A really long build guide title that runs on and on and on and on and on and on and on and on',
    })
    expect(long.draft.title.length).toBeLessThanOrEqual(70)
    expect(long.draft.title.toLowerCase()).toContain('poe 2 deadeye')
  })

  it('front-loads the keyword in the description and names the subtopics', () => {
    const result = optimizeSeo(base)
    expect(result.draft.description.slice(0, 150).toLowerCase()).toContain('poe 2 deadeye')
    expect(result.draft.description.toLowerCase()).toContain('lightning arrow')
    expect(result.changes.some((c) => c.field === 'description')).toBe(true)
  })

  it('de-duplicates, lowercases and caps tags while adding required terms', () => {
    const result = optimizeSeo({
      ...base,
      tags: ['PoE 2 Deadeye', 'poe 2 deadeye', '', ...Array.from({ length: 20 }, (_, i) => `tag ${i}`)],
    })
    expect(result.draft.tags.length).toBeLessThanOrEqual(15)
    expect(new Set(result.draft.tags).size).toBe(result.draft.tags.length)
    expect(result.draft.tags).toContain('poe 2 deadeye')
    expect(result.draft.tags).toContain('lightning arrow')
    expect(result.draft.tags.every((t) => t === t.toLowerCase())).toBe(true)
  })

  it('is explicit when no primary keyword is set', () => {
    const result = optimizeSeo({ ...base, primaryKeyword: '' })
    expect(result.notes.join(' ')).toMatch(/no primary keyword/i)
  })

  it('records a reason for every change and never promises a ranking', () => {
    const result = optimizeSeo(base)
    expect(result.changes.length).toBeGreaterThan(0)
    expect(result.changes.every((c) => c.reason.length > 0)).toBe(true)
    expect(result.notes.join(' ')).toMatch(/not a ranking guarantee/i)
  })
})
