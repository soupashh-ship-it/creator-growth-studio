import { describe, expect, it } from 'vitest'
import { scoreSeo } from '@core/scores/seo'
import { classifyIntent } from '@core/seo/intent'

const expectedSubtopics = ['lightning arrow', 'deadeye', 'build', 'patch']

describe('video SEO score', () => {
  it('rates a well-formed video above a poor one', () => {
    const good = scoreSeo({
      title: 'PoE 2 Lightning Arrow Deadeye Build Guide | Patch 0.4',
      description:
        'This Path of Exile 2 Lightning Arrow Deadeye build guide covers gearing, passives and bossing.\n\n' +
        '00:00 Intro\n01:20 Gear\n04:10 Bosses\n\nFull notes: https://example.com/build #poe2 #deadeye',
      tags: ['poe 2', 'lightning arrow', 'deadeye', 'build guide', 'path of exile 2', 'bossing'],
      primaryKeyword: 'poe 2 deadeye',
      secondaryKeywords: ['lightning arrow', 'build', 'gear'],
      category: 'Gaming',
      language: 'en',
      videoType: 'build guide',
      topicOpportunity: 85,
      expectedSubtopics,
    })

    const bad = scoreSeo({
      title: 'my video',
      description: 'hi',
      tags: [],
      primaryKeyword: 'poe 2 deadeye',
      expectedSubtopics,
    })

    expect(good.result.score).not.toBeNull()
    expect(bad.result.score).not.toBeNull()
    expect(good.result.score!).toBeGreaterThan(bad.result.score!)
  })

  it('produces ranked recommendations and a predicted optimized score', () => {
    const r = scoreSeo({
      title: 'my video',
      description: 'hi',
      tags: [],
      primaryKeyword: 'poe 2 deadeye',
      expectedSubtopics,
    })
    expect(r.recommendations.length).toBeGreaterThan(0)
    expect(r.recommendations[0]!.delta).toBeGreaterThanOrEqual(r.recommendations.at(-1)!.delta)
    expect(r.predictedOptimizedScore!).toBeGreaterThanOrEqual(r.result.score!)
  })

  it('omits the topic-opportunity component when no signal is available', () => {
    const r = scoreSeo({
      title: 'PoE 2 Deadeye Build',
      description: 'x'.repeat(300),
      tags: ['a', 'b', 'c', 'd', 'e'],
      primaryKeyword: 'poe 2 deadeye',
    })
    expect(r.result.missing).toContain('Topic opportunity')
    expect(r.result.coverage).toBeLessThan(1)
  })
})

describe('search intent classifier', () => {
  it('detects troubleshooting for a fix/how-to title', () => {
    expect(classifyIntent('how to fix windows 11 audio error').intent).toBe('troubleshooting')
  })

  it('detects comparison for a vs title', () => {
    expect(classifyIntent('RTX 5090 vs RX 9900 XT benchmark').intent).toBe('comparison')
  })

  it('detects news for a patch announcement', () => {
    expect(classifyIntent('patch 0.4 just dropped news').intent).toBe('news')
  })

  it('explains its reasoning', () => {
    const r = classifyIntent('best poe 2 league starter build guide')
    expect(r.reasons.length).toBeGreaterThan(0)
  })
})
