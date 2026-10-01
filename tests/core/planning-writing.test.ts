import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DatabaseSync } from '@database/connection'
import { runMigrations } from '@database/migrate'
import { migrations } from '@database/migrations'
import { Repositories } from '@database/repositories'
import { buildWeeklyPlan, findHighestValueTask } from '@core/planning/weekly'
import { assessStreamTitle } from '@core/writing/stream-title'
import { DEFAULT_CHECKLIST, isDefaultChecklist } from '@core/writing/checklist'
import { buildRetentionPlan, RETENTION_FORMATS } from '@core/writing/retention'

let db: DatabaseSync
let repos: Repositories

beforeEach(() => {
  db = openDatabase(':memory:')
  runMigrations(db, migrations)
  repos = new Repositories(db)
  repos.createWorkspace('w1', 'WS')
})

describe('buildWeeklyPlan', () => {
  it('places scheduled calendar items on their weekday', () => {
    // 2026-09-30 is a Wednesday (local time — no Z suffix, matching how the
    // Calendar page stores user-picked datetime-local values).
    repos.createCalendarItem({ workspaceId: 'w1', kind: 'stream', title: 'League stream', scheduledAt: '2026-09-30T12:00:00' })
    const plan = buildWeeklyPlan(repos, 'w1')
    const stream = plan.tasks.find((task) => task.label.includes('League stream'))
    expect(stream).toBeTruthy()
    expect(stream?.day).toBe('Wed')
    expect(stream?.reason).toContain('calendar')
  })

  it('explains its basis and never fabricates best times', () => {
    const plan = buildWeeklyPlan(repos, 'w1')
    expect(plan.basis.join(' ')).toContain('does not invent best times')
    expect(plan.tasks.length).toBeGreaterThan(0)
  })

  it('adds a research slot for saved keywords', () => {
    repos.upsertKeyword({ workspaceId: 'w1', term: 'poe 2 deadeye', source: 'test' })
    const plan = buildWeeklyPlan(repos, 'w1')
    expect(plan.tasks.some((task) => task.label.startsWith('Research'))).toBe(true)
  })
})

describe('findHighestValueTask', () => {
  it('prioritizes a calendar item due within 72 hours', () => {
    const soon = new Date(Date.now() + 20 * 3_600_000).toISOString()
    repos.createCalendarItem({ workspaceId: 'w1', kind: 'stream', title: 'Tomorrow stream', scheduledAt: soon })
    repos.createProject({ workspaceId: 'w1', title: 'A video project', stage: 'idea' })
    const task = findHighestValueTask(repos, 'w1')
    expect(task?.headline).toContain('Tomorrow stream')
    expect(task?.why.length).toBeGreaterThan(0)
  })

  it('returns null when nothing is actionable', () => {
    expect(findHighestValueTask(repos, 'w1')).toBeNull()
  })
})

describe('assessStreamTitle', () => {
  it('scores a specific goal-oriented title higher than a bare category restatement', () => {
    const good = assessStreamTitle({ title: 'PoE 2 0.4 Deadeye testing — road to endgame', category: 'Path of Exile 2' })
    const bad = assessStreamTitle({ title: 'Path of Exile 2', category: 'Path of Exile 2' })
    expect(good.score.score!).toBeGreaterThan(bad.score.score!)
    expect(bad.improvements.some((imp) => imp.label.includes('Say more than the category'))).toBe(true)
  })

  it('suggests adding a patch marker when none exists', () => {
    const result = assessStreamTitle({ title: 'Ranked grind with friends' })
    expect(result.improvements.some((imp) => imp.label.toLowerCase().includes('patch'))).toBe(true)
  })
})

describe('checklist', () => {
  it('has a non-empty default and recognizes it', () => {
    expect(DEFAULT_CHECKLIST.length).toBeGreaterThanOrEqual(8)
    expect(isDefaultChecklist(DEFAULT_CHECKLIST)).toBe(true)
    expect(isDefaultChecklist([{ id: 'x', label: 'custom' }])).toBe(false)
  })
})

describe('buildRetentionPlan', () => {
  it('produces proportional beats covering the full duration', () => {
    const plan = buildRetentionPlan('tutorial', 10)
    const totalShare = plan.beats.reduce((sum, beat) => sum + (beat.endS - beat.startS), 0)
    expect(plan.durationS).toBe(600)
    expect(totalShare).toBeCloseTo(600, 0)
    expect(plan.beats[0]?.clock).toBe('0:00')
    expect(plan.beats[0]?.why).toBeTruthy()
  })

  it('scales with target length and offers multiple formats', () => {
    expect(RETENTION_FORMATS).toContain('storytelling')
    const short = buildRetentionPlan('gaming', 5)
    expect(short.durationS).toBe(300)
    expect(short.notes.join(' ')).toContain('not measured retention')
  })
})
