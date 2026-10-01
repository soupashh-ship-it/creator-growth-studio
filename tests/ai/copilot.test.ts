import { beforeEach, describe, expect, it } from 'vitest'
import { buildCopilotBriefing, COPILOT_SYSTEM_PROMPT } from '@ai/copilot'
import { openDatabase, type DatabaseSync } from '@database/connection'
import { runMigrations } from '@database/migrate'
import { migrations } from '@database/migrations'
import { Repositories } from '@database/repositories'

let db: DatabaseSync
let repos: Repositories

beforeEach(() => {
  db = openDatabase(':memory:')
  runMigrations(db, migrations)
  repos = new Repositories(db)
  repos.createWorkspace('w1', 'WS')
})

describe('buildCopilotBriefing', () => {
  it('flags an empty workspace instead of inventing numbers', () => {
    const briefing = buildCopilotBriefing(repos, 'w1')
    expect(briefing.hasData).toBe(false)
    expect(briefing.text).toMatch(/nothing is stored yet/i)
    expect(briefing.text).toMatch(/not available/i)
  })

  it('includes aggregated real values and named sources that are missing', () => {
    repos.upsertVideo({
      workspaceId: 'w1',
      platform: 'youtube',
      externalId: 'v1',
      title: 'Deadeye build guide',
      publishedAt: '2026-01-01T00:00:00Z',
      views: 12000,
      likes: 900,
      comments: 150,
    })
    repos.upsertKeyword({
      workspaceId: 'w1',
      term: 'poe 2 deadeye',
      opportunity: 82,
      relativeDemand: 'High',
      competitionEstimate: 'Medium',
      intent: 'build-guide',
      source: 'locally_derived',
    })
    repos.ingestComments({
      workspaceId: 'w1',
      platform: 'youtube',
      comments: [
        { externalId: 'c1', author: 'a', body: 'can you make a budget version' },
        { externalId: 'c2', author: 'b', body: 'can you make a budget version please' },
      ],
    })

    const briefing = buildCopilotBriefing(repos, 'w1')
    expect(briefing.hasData).toBe(true)
    expect(briefing.text).toContain('12,000')
    expect(briefing.text).toContain('poe 2 deadeye')
    expect(briefing.text).toContain('budget version')
    // It must name what is missing rather than leaving a silent gap.
    expect(briefing.text).toMatch(/retention curves/i)
    // Demand is relative only — never an absolute volume.
    expect(briefing.text).toMatch(/never absolute volume/i)
  })
})

describe('COPILOT_SYSTEM_PROMPT', () => {
  it('forbids inventing metrics and forbidden growth tactics', () => {
    expect(COPILOT_SYSTEM_PROMPT).toMatch(/Never invent/i)
    expect(COPILOT_SYSTEM_PROMPT).toMatch(/not available/i)
    expect(COPILOT_SYSTEM_PROMPT).toMatch(/bots|fake engagement/i)
  })
})
