import { beforeEach, describe, expect, it } from 'vitest'
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
})

describe('workspaces', () => {
  it('creates and lists workspaces', () => {
    repos.createWorkspace('w1', 'SupAshh')
    repos.createWorkspace('w2', 'AnonLore Stories')
    const list = repos.listWorkspaces()
    expect(list.map((w) => w.name)).toEqual(['SupAshh', 'AnonLore Stories'])
  })

  it('finds a workspace by name', () => {
    repos.createWorkspace('w1', 'SupAshh')
    expect(repos.findWorkspaceByName('SupAshh')?.id).toBe('w1')
    expect(repos.findWorkspaceByName('nope')).toBeNull()
  })
})

describe('settings', () => {
  it('round-trips values and updates in place', () => {
    repos.setSetting('app', 'appearance', { theme: 'dark' })
    expect(repos.getSetting('app', 'appearance')).toEqual({ theme: 'dark' })
    repos.setSetting('app', 'appearance', { theme: 'light' })
    expect(repos.getSetting('app', 'appearance')).toEqual({ theme: 'light' })
    expect(repos.getSetting('app', 'missing')).toBeNull()
  })
})

describe('connections', () => {
  it('upserts platform and AI connections without duplicating rows', () => {
    repos.createWorkspace('w1', 'WS')
    repos.upsertPlatformConnection({ workspaceId: 'w1', platform: 'youtube', status: 'connected' })
    repos.upsertPlatformConnection({ workspaceId: 'w1', platform: 'youtube', status: 'auth_expired' })
    const rows = repos.listPlatformConnections('w1')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('auth_expired')

    repos.upsertAiConnection({ workspaceId: 'w1', provider: 'ollama', status: 'connected', planUsage: false })
    repos.upsertAiConnection({ workspaceId: 'w1', provider: 'ollama', status: 'connected', planUsage: true })
    const count = db.prepare('SELECT COUNT(*) AS n FROM ai_connections').get() as { n: number }
    expect(count.n).toBe(1)
  })
})

describe('channels and videos', () => {
  it('stores channel stats and parsed video metrics', () => {
    repos.createWorkspace('w1', 'WS')
    repos.upsertChannel({
      workspaceId: 'w1',
      platform: 'youtube',
      externalId: 'UC1',
      title: 'SupAshh',
      subscriberCount: 8741,
      videoCount: 120,
      viewCount: 500000,
    })
    const channels = repos.listChannels('w1')
    expect(channels[0]!.subscriber_count).toBe(8741)

    repos.upsertVideo({
      workspaceId: 'w1',
      platform: 'youtube',
      externalId: 'vid1',
      title: 'PoE 2 Build',
      publishedAt: '2026-09-01T00:00:00Z',
      views: 14282,
      likes: 900,
      comments: 120,
    })
    const videos = repos.listVideos('w1')
    expect(videos).toHaveLength(1)
    expect(videos[0]!.views).toBe(14282)
  })
})

describe('competitors', () => {
  it('upserts by platform + channel id and stores a snapshot', () => {
    repos.createWorkspace('w1', 'WS')
    const id = repos.upsertCompetitor({
      workspaceId: 'w1',
      platform: 'youtube',
      channelExternalId: 'UCrival',
      label: 'Rival',
      handle: '@rival',
    })
    // Re-adding the same channel updates rather than duplicates.
    repos.upsertCompetitor({
      workspaceId: 'w1',
      platform: 'youtube',
      channelExternalId: 'UCrival',
      label: 'Rival Renamed',
      handle: '@rival',
    })
    const list = repos.listCompetitors('w1')
    expect(list).toHaveLength(1)
    expect(list[0]?.label).toBe('Rival Renamed')

    repos.updateCompetitorSnapshot(id, { capturedAt: 'now', videos: [{ title: 'x', views: 1 }] })
    const refreshed = repos.listCompetitors('w1')[0]
    expect(refreshed?.snapshot_json).toContain('videos')
    expect(refreshed?.last_refreshed_at).toBeTruthy()

    repos.deleteCompetitor(id)
    expect(repos.listCompetitors('w1')).toHaveLength(0)
  })
})

describe('experiments', () => {
  it('stores and deletes packaging-change experiments', () => {
    repos.createWorkspace('w1', 'WS')
    const id = repos.createExperiment({
      workspaceId: 'w1',
      kind: 'title',
      changedAt: '2026-01-01T00:00:00Z',
      before: { subject: 'Video A', value: 'Old title' },
      after: { subject: 'Video A', value: 'New title' },
    })
    const rows = repos.listExperiments('w1')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.kind).toBe('title')
    repos.deleteExperiment(id)
    expect(repos.listExperiments('w1')).toHaveLength(0)
  })
})

describe('notifications', () => {
  it('tracks unread counts and prunes old rows', () => {
    repos.createWorkspace('w1', 'WS')
    const id = repos.createNotification({ workspaceId: 'w1', type: 'sync', payload: { videos: 2 } })
    expect(repos.unreadNotificationCount('w1')).toBe(1)
    repos.markNotificationRead(id)
    expect(repos.unreadNotificationCount('w1')).toBe(0)
    expect(repos.pruneNotifications(30)).toBe(0)
  })
})

describe('streams', () => {
  it('upserts sessions idempotently with last-write-wins fields', () => {
    repos.createWorkspace('w1', 'WS')
    const base = {
      workspaceId: 'w1',
      platform: 'twitch',
      externalId: 'stream-1',
    }
    repos.upsertStream({ ...base, title: 'Live', category: 'PoE 2', startedAt: '2026-09-30T10:00:00Z', peakViewers: 30 })
    // Repeated syncs update the same row; peak merge policy belongs to the caller.
    repos.upsertStream({ ...base, peakViewers: 55 })

    const rows = repos.listStreams('w1')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.peak_viewers).toBe(55)
    expect(rows[0]!.category).toBe('PoE 2')
  })

  it('records ended_at once a session has ended', () => {
    repos.createWorkspace('w1', 'WS')
    const base = { workspaceId: 'w1', platform: 'twitch', externalId: 's2' }
    repos.upsertStream({ ...base, startedAt: '2026-09-29T10:00:00Z' })
    repos.upsertStream({ ...base, endedAt: '2026-09-29T14:00:00Z' })
    expect(repos.listStreams('w1')[0]!.ended_at).toBe('2026-09-29T14:00:00Z')
  })
})

describe('full-text search', () => {
  it('indexes and finds entities, replacing stale rows', () => {
    repos.indexEntity('search_videos', 'v1', 'PoE 2 Lightning Arrow', 'budget build')
    expect(repos.search('search_videos', 'lightning')).toEqual(['v1'])

    repos.indexEntity('search_videos', 'v1', 'PoE 2 Updated', 'endgame build')
    expect(repos.search('search_videos', 'lightning')).toEqual([])
    expect(repos.search('search_videos', 'endgame')).toEqual(['v1'])
  })

  it('rejects unknown search tables', () => {
    expect(() => repos.search('users; DROP TABLE workspaces', 'x')).toThrow()
    expect(() => repos.indexEntity('evil', '1', 'a', 'b')).toThrow()
  })
})
