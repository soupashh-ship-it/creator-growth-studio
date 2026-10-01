import type { DatabaseSync } from 'node:sqlite'

/**
 * Repository layer (spec §77). Thin, typed accessors over the schema in
 * `docs/ARCHITECTURE.md` §6. Kept free of business logic so the query engine and
 * engines can compose them.
 */
export interface WorkspaceRow {
  id: string
  name: string
  created_at: string
  updated_at: string
}

export interface PlatformConnectionRow {
  id: string
  workspace_id: string
  platform: string
  status: string
  scopes_json: string
  expires_at: string | null
  last_checked_at: string | null
}

export interface ChannelRow {
  id: string
  workspace_id: string
  platform: string
  external_id: string
  title: string | null
  subscriber_count: number | null
  video_count: number | null
  view_count: number | null
  fetched_at: string | null
}

export interface VideoRow {
  id: string
  workspace_id: string
  platform: string
  external_id: string
  title: string | null
  published_at: string | null
  views: number | null
  likes: number | null
  comments: number | null
  /** §124: project this published video is linked to, if any. */
  project_id: string | null
}

export interface StreamRow {
  id: string
  workspace_id: string
  platform: string
  external_id: string
  title: string | null
  category: string | null
  started_at: string | null
  ended_at: string | null
  peak_viewers: number | null
  avg_viewers: number | null
}

export class Repositories {
  constructor(private readonly db: DatabaseSync) {}

  // -- workspaces -----------------------------------------------------------
  createWorkspace(id: string, name: string): WorkspaceRow {
    this.db.prepare('INSERT INTO workspaces (id, name) VALUES (?, ?)').run(id, name)
    const row = this.db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as unknown as WorkspaceRow
    return row
  }

  listWorkspaces(): WorkspaceRow[] {
    return this.db.prepare('SELECT * FROM workspaces ORDER BY created_at ASC').all() as unknown as WorkspaceRow[]
  }

  findWorkspaceByName(name: string): WorkspaceRow | null {
    const row = this.db.prepare('SELECT * FROM workspaces WHERE name = ? LIMIT 1').get(name) as
      | WorkspaceRow
      | undefined
    return row ?? null
  }

  // -- settings -------------------------------------------------------------
  setSetting(scope: string, key: string, value: unknown): void {
    const existing = this.db
      .prepare('SELECT id FROM settings WHERE scope = ? AND key = ?')
      .get(scope, key) as { id: string } | undefined
    const json = JSON.stringify(value)
    if (existing) {
      this.db.prepare("UPDATE settings SET value_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(json, existing.id)
    } else {
      this.db.prepare('INSERT INTO settings (id, scope, key, value_json) VALUES (?, ?, ?, ?)').run(
        crypto.randomUUID(),
        scope,
        key,
        json,
      )
    }
  }

  getSetting<T>(scope: string, key: string): T | null {
    const row = this.db
      .prepare('SELECT value_json FROM settings WHERE scope = ? AND key = ?')
      .get(scope, key) as { value_json: string } | undefined
    if (!row) return null
    try {
      return JSON.parse(row.value_json) as T
    } catch {
      return null
    }
  }

  // -- connections ----------------------------------------------------------
  upsertPlatformConnection(input: {
    workspaceId: string
    platform: string
    status: string
    scopes?: string[]
  }): void {
    const existing = this.db
      .prepare('SELECT id FROM platform_connections WHERE workspace_id = ? AND platform = ?')
      .get(input.workspaceId, input.platform) as { id: string } | undefined
    const scopes = JSON.stringify(input.scopes ?? [])
    if (existing) {
      this.db
        .prepare(
          "UPDATE platform_connections SET status = ?, scopes_json = ?, last_checked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
        )
        .run(input.status, scopes, existing.id)
    } else {
      this.db
        .prepare('INSERT INTO platform_connections (id, workspace_id, platform, status, scopes_json) VALUES (?, ?, ?, ?, ?)')
        .run(crypto.randomUUID(), input.workspaceId, input.platform, input.status, scopes)
    }
  }

  listPlatformConnections(workspaceId: string): PlatformConnectionRow[] {
    return this.db
      .prepare('SELECT * FROM platform_connections WHERE workspace_id = ?')
      .all(workspaceId) as unknown as PlatformConnectionRow[]
  }

  upsertAiConnection(input: { workspaceId: string; provider: string; status: string; planUsage: boolean }): void {
    const existing = this.db
      .prepare('SELECT id FROM ai_connections WHERE workspace_id = ? AND provider = ?')
      .get(input.workspaceId, input.provider) as { id: string } | undefined
    if (existing) {
      this.db
        .prepare("UPDATE ai_connections SET status = ?, plan_usage_enabled = ?, last_checked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
        .run(input.status, input.planUsage ? 1 : 0, existing.id)
    } else {
      this.db
        .prepare('INSERT INTO ai_connections (id, workspace_id, provider, status, plan_usage_enabled) VALUES (?, ?, ?, ?, ?)')
        .run(crypto.randomUUID(), input.workspaceId, input.provider, input.status, input.planUsage ? 1 : 0)
    }
  }

  // -- channels & videos ----------------------------------------------------
  upsertChannel(input: {
    workspaceId: string
    platform: string
    externalId: string
    title: string
    subscriberCount: number | null
    videoCount: number | null
    viewCount: number | null
  }): void {
    const existing = this.db
      .prepare('SELECT id FROM channels WHERE workspace_id = ? AND platform = ? AND external_id = ?')
      .get(input.workspaceId, input.platform, input.externalId) as { id: string } | undefined
    const stats = JSON.stringify({
      subscriberCount: input.subscriberCount,
      videoCount: input.videoCount,
      viewCount: input.viewCount,
    })
    if (existing) {
      this.db
        .prepare("UPDATE channels SET title = ?, stats_json = ?, fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
        .run(input.title, stats, existing.id)
    } else {
      this.db
        .prepare('INSERT INTO channels (id, workspace_id, platform, external_id, title, stats_json, fetched_at) VALUES (?, ?, ?, ?, ?, ?, strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\'))')
        .run(crypto.randomUUID(), input.workspaceId, input.platform, input.externalId, input.title, stats)
    }
  }

  listChannels(workspaceId: string): ChannelRow[] {
    const rows = this.db
      .prepare('SELECT id, workspace_id, platform, external_id, title, stats_json, fetched_at FROM channels WHERE workspace_id = ?')
      .all(workspaceId) as Array<Omit<ChannelRow, 'subscriber_count' | 'video_count' | 'view_count'> & { stats_json: string }>
    return rows.map((row) => {
      const stats = JSON.parse(row.stats_json) as {
        subscriberCount: number | null
        videoCount: number | null
        viewCount: number | null
      }
      return {
        id: row.id,
        workspace_id: row.workspace_id,
        platform: row.platform,
        external_id: row.external_id,
        title: row.title,
        subscriber_count: stats.subscriberCount,
        video_count: stats.videoCount,
        view_count: stats.viewCount,
        fetched_at: row.fetched_at,
      }
    })
  }

  upsertVideo(input: {
    workspaceId: string
    platform: string
    externalId: string
    title: string
    publishedAt: string
    description?: string
    tags?: string[]
    thumbUrl?: string | null
    views?: number | null
    likes?: number | null
    comments?: number | null
  }): void {
    const existing = this.db
      .prepare('SELECT id FROM videos WHERE workspace_id = ? AND platform = ? AND external_id = ?')
      .get(input.workspaceId, input.platform, input.externalId) as { id: string } | undefined
    const tags = JSON.stringify(input.tags ?? [])
    if (existing) {
      this.db
        .prepare("UPDATE videos SET title = ?, description = ?, tags_json = ?, thumb_url = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
        .run(input.title, input.description ?? '', tags, input.thumbUrl ?? null, existing.id)
    } else {
      this.db
        .prepare(
          'INSERT INTO videos (id, workspace_id, platform, external_id, title, description, published_at, tags_json, thumb_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          crypto.randomUUID(),
          input.workspaceId,
          input.platform,
          input.externalId,
          input.title,
          input.description ?? '',
          input.publishedAt,
          tags,
          input.thumbUrl ?? null,
        )
    }

    if (input.views !== undefined || input.likes !== undefined || input.comments !== undefined) {
      const video = this.db
        .prepare('SELECT id FROM videos WHERE workspace_id = ? AND platform = ? AND external_id = ?')
        .get(input.workspaceId, input.platform, input.externalId) as { id: string }
      this.db
        .prepare('INSERT INTO video_snapshots (id, video_id, captured_at, views, likes, comments, source) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(
          crypto.randomUUID(),
          video.id,
          new Date().toISOString(),
          input.views ?? null,
          input.likes ?? null,
          input.comments ?? null,
          'official',
        )
    }
  }

  listVideos(workspaceId: string, limit = 100): VideoRow[] {
    return this.db
      .prepare(
        `SELECT v.id, v.workspace_id, v.platform, v.external_id, v.title, v.published_at, v.project_id,
                (SELECT s.views FROM video_snapshots s WHERE s.video_id = v.id ORDER BY s.captured_at DESC LIMIT 1) AS views,
                (SELECT s.likes FROM video_snapshots s WHERE s.video_id = v.id ORDER BY s.captured_at DESC LIMIT 1) AS likes,
                (SELECT s.comments FROM video_snapshots s WHERE s.video_id = v.id ORDER BY s.captured_at DESC LIMIT 1) AS comments
         FROM videos v WHERE v.workspace_id = ? ORDER BY v.published_at DESC LIMIT ?`,
      )
      .all(workspaceId, limit) as unknown as VideoRow[]
  }

  /** §124: links a published video to a project (or clears the link with null). */
  linkVideoToProject(videoId: string, projectId: string | null): void {
    this.db
      .prepare("UPDATE videos SET project_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
      .run(projectId, videoId)
  }

  /** §52: capture history for one video, ascending by time. */
  listVideoTrajectory(videoId: string): Array<{ captured_at: string; views: number | null; likes: number | null }> {
    return this.db
      .prepare(
        'SELECT captured_at, views, likes FROM video_snapshots WHERE video_id = ? ORDER BY captured_at ASC',
      )
      .all(videoId) as unknown as Array<{ captured_at: string; views: number | null; likes: number | null }>
  }

  // -- YouTube Analytics (§36, §67) ------------------------------------------
  findVideoByExternalId(workspaceId: string, externalId: string): { id: string } | null {
    const row = this.db
      .prepare('SELECT id FROM videos WHERE workspace_id = ? AND external_id = ?')
      .get(workspaceId, externalId) as { id: string } | undefined
    return row ?? null
  }

  /** Stores an official per-video analytics snapshot (impressions/CTR/retention/revenue). */
  recordVideoAnalyticsSnapshot(input: {
    videoId: string
    views?: number | null
    impressions?: number | null
    ctr?: number | null
    avgViewDurationS?: number | null
    avgViewPct?: number | null
    subsGained?: number | null
    revenueMicros?: number | null
  }): void {
    this.db
      .prepare(
        `INSERT INTO video_snapshots
           (id, video_id, captured_at, views, impressions, ctr, avg_view_duration_s, avg_view_pct, subs_gained, revenue_micros, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'official')`,
      )
      .run(
        crypto.randomUUID(),
        input.videoId,
        new Date().toISOString(),
        input.views ?? null,
        input.impressions ?? null,
        input.ctr ?? null,
        input.avgViewDurationS ?? null,
        input.avgViewPct ?? null,
        input.subsGained ?? null,
        input.revenueMicros ?? null,
      )
  }

  /** Latest analytics snapshot per video, workspace-scoped. */
  listLatestVideoAnalytics(workspaceId: string): Array<{
    video_id: string
    external_id: string
    title: string | null
    impressions: number | null
    ctr: number | null
    avg_view_pct: number | null
    avg_view_duration_s: number | null
    subs_gained: number | null
    revenue_micros: number | null
  }> {
    return this.db
      .prepare(
        `SELECT v.id AS video_id, v.external_id, v.title,
                s.impressions, s.ctr, s.avg_view_pct, s.avg_view_duration_s, s.subs_gained, s.revenue_micros
         FROM videos v
         JOIN video_snapshots s ON s.id = (
           SELECT id FROM video_snapshots WHERE video_id = v.id ORDER BY captured_at DESC LIMIT 1
         )
         WHERE v.workspace_id = ?`,
      )
      .all(workspaceId) as unknown as Array<{
      video_id: string
      external_id: string
      title: string | null
      impressions: number | null
      ctr: number | null
      avg_view_pct: number | null
      avg_view_duration_s: number | null
      subs_gained: number | null
      revenue_micros: number | null
    }>
  }

  // -- channel snapshots (§119 goal progress) -------------------------------
  /** Records a channel-level stats observation from an official sync. */
  recordChannelSnapshot(input: {
    workspaceId: string
    platform: string
    externalId: string
    subscriberCount: number | null
    viewCount: number | null
    capturedAt?: string
  }): void {
    this.db
      .prepare(
        'INSERT INTO channel_snapshots (id, workspace_id, platform, external_id, subscriber_count, view_count, captured_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        crypto.randomUUID(),
        input.workspaceId,
        input.platform,
        input.externalId,
        input.subscriberCount,
        input.viewCount,
        input.capturedAt ?? new Date().toISOString(),
      )
  }

  /** Channel snapshot history, ascending by time (used for goal progress). */
  listChannelSnapshots(workspaceId: string, platform?: string): Array<{
    at: string
    platform: string
    subscriber_count: number | null
    view_count: number | null
  }> {
    const rows = (
      platform
        ? this.db
            .prepare(
              'SELECT captured_at, platform, subscriber_count, view_count FROM channel_snapshots WHERE workspace_id = ? AND platform = ? ORDER BY captured_at ASC',
            )
            .all(workspaceId, platform)
        : this.db
            .prepare(
              'SELECT captured_at, platform, subscriber_count, view_count FROM channel_snapshots WHERE workspace_id = ? ORDER BY captured_at ASC',
            )
            .all(workspaceId)
    ) as unknown as Array<{ captured_at: string; platform: string; subscriber_count: number | null; view_count: number | null }>
    return rows.map((r) => ({ at: r.captured_at, platform: r.platform, subscriber_count: r.subscriber_count, view_count: r.view_count }))
  }

  replaceAudienceDemographics(
    workspaceId: string,
    buckets: Array<{ dimension: string; bucket: string; viewerPercentage: number }>,
  ): void {
    this.db.prepare('DELETE FROM audience_demographics WHERE workspace_id = ?').run(workspaceId)
    const insert = this.db.prepare(
      'INSERT INTO audience_demographics (id, workspace_id, dimension, bucket, viewer_percentage, captured_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    for (const item of buckets) {
      insert.run(crypto.randomUUID(), workspaceId, item.dimension, item.bucket, item.viewerPercentage, new Date().toISOString())
    }
  }

  listAudienceDemographics(
    workspaceId: string,
  ): Array<{ dimension: string; bucket: string; viewer_percentage: number | null }> {
    return this.db
      .prepare(
        'SELECT dimension, bucket, viewer_percentage FROM audience_demographics WHERE workspace_id = ? ORDER BY dimension ASC, viewer_percentage DESC',
      )
      .all(workspaceId) as unknown as Array<{
      dimension: string
      bucket: string
      viewer_percentage: number | null
    }>
  }

  replaceVideoRetention(videoId: string, points: Array<{ elapsedRatio: number; watchRatio: number | null }>): void {
    this.db.prepare('DELETE FROM video_retention WHERE video_id = ?').run(videoId)
    const insert = this.db.prepare(
      'INSERT INTO video_retention (id, video_id, elapsed_ratio, watch_ratio, captured_at) VALUES (?, ?, ?, ?, ?)',
    )
    const now = new Date().toISOString()
    for (const point of points) {
      insert.run(crypto.randomUUID(), videoId, point.elapsedRatio, point.watchRatio, now)
    }
  }

  listVideoRetention(videoId: string): Array<{ elapsed_ratio: number; watch_ratio: number | null }> {
    return this.db
      .prepare('SELECT elapsed_ratio, watch_ratio FROM video_retention WHERE video_id = ? ORDER BY elapsed_ratio ASC')
      .all(videoId) as unknown as Array<{ elapsed_ratio: number; watch_ratio: number | null }>
  }

  // -- full-text search (§141) ---------------------------------------------
  indexEntity(table: string, entityId: string, title: string, body: string): void {
    const allowed = new Set([
      'search_videos',
      'search_projects',
      'search_comments',
      'search_reports',
      'search_ideas',
      'search_transcripts',
    ])
    if (!allowed.has(table)) throw new Error(`Unknown search table: ${table}`)
    this.db.prepare(`DELETE FROM ${table} WHERE entity_id = ?`).run(entityId)
    this.db.prepare(`INSERT INTO ${table} (entity_id, title, body) VALUES (?, ?, ?)`).run(entityId, title, body)
  }

  search(table: string, query: string, limit = 20): string[] {
    const allowed = new Set([
      'search_videos',
      'search_projects',
      'search_comments',
      'search_reports',
      'search_ideas',
      'search_transcripts',
    ])
    if (!allowed.has(table)) throw new Error(`Unknown search table: ${table}`)
    const rows = this.db
      .prepare(`SELECT entity_id FROM ${table} WHERE ${table} MATCH ? LIMIT ?`)
      .all(query, limit) as Array<{ entity_id: string }>
    return rows.map((r) => r.entity_id)
  }

  // -- projects & calendar (§50, §123) -------------------------------------
  createProject(input: { workspaceId: string; title: string; stage?: string }): string {
    const id = crypto.randomUUID()
    this.db
      .prepare('INSERT INTO video_projects (id, workspace_id, title, stage) VALUES (?, ?, ?, ?)')
      .run(id, input.workspaceId, input.title, input.stage ?? 'idea')
    return id
  }

  listProjects(workspaceId: string): Array<{ id: string; title: string; stage: string; updated_at: string }> {
    return this.db
      .prepare('SELECT id, title, stage, updated_at FROM video_projects WHERE workspace_id = ? ORDER BY updated_at DESC')
      .all(workspaceId) as unknown as Array<{ id: string; title: string; stage: string; updated_at: string }>
  }

  updateProjectStage(id: string, stage: string): void {
    this.db
      .prepare("UPDATE video_projects SET stage = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
      .run(stage, id)
  }

  createCalendarItem(input: {
    workspaceId: string
    kind: string
    title: string
    scheduledAt: string | null
    projectId?: string | null
  }): string {
    const id = crypto.randomUUID()
    this.db
      .prepare('INSERT INTO calendar_items (id, workspace_id, project_id, kind, title, scheduled_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, input.workspaceId, input.projectId ?? null, input.kind, input.title, input.scheduledAt)
    return id
  }

  listCalendarItems(workspaceId: string): Array<{
    id: string
    kind: string
    title: string | null
    scheduled_at: string | null
    status: string
  }> {
    return this.db
      .prepare('SELECT id, kind, title, scheduled_at, status FROM calendar_items WHERE workspace_id = ? ORDER BY scheduled_at ASC')
      .all(workspaceId) as unknown as Array<{
      id: string
      kind: string
      title: string | null
      scheduled_at: string | null
      status: string
    }>
  }

  /** §50 drag-reschedule: moves an item's scheduled date, keeping the time. */
  rescheduleCalendarItem(id: string, scheduledAt: string | null): void {
    this.db
      .prepare("UPDATE calendar_items SET scheduled_at = ?, status = CASE WHEN status = 'idea' THEN 'scheduled' ELSE status END WHERE id = ?")
      .run(scheduledAt, id)
  }

  // -- comments (§49) -------------------------------------------------------
  ingestComments(input: {
    workspaceId: string
    platform: string
    videoExternalId?: string | null
    comments: Array<{ externalId: string; author: string; body: string; publishedAt?: string | null }>
  }): number {
    let inserted = 0
    const videoRow = input.videoExternalId
      ? (this.db
          .prepare('SELECT id FROM videos WHERE workspace_id = ? AND platform = ? AND external_id = ?')
          .get(input.workspaceId, input.platform, input.videoExternalId) as { id: string } | undefined)
      : undefined

    const statement = this.db.prepare(
      'INSERT OR IGNORE INTO comments (id, workspace_id, platform, video_id, external_id, author, body, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    for (const comment of input.comments) {
      statement.run(
        crypto.randomUUID(),
        input.workspaceId,
        input.platform,
        videoRow?.id ?? null,
        comment.externalId,
        comment.author,
        comment.body,
        comment.publishedAt ?? null,
      )
      inserted += 1
    }
    return inserted
  }

  listCommentBodies(workspaceId: string, limit = 500): string[] {
    const rows = this.db
      .prepare('SELECT body FROM comments WHERE workspace_id = ? LIMIT ?')
      .all(workspaceId, limit) as unknown as Array<{ body: string }>
    return rows.map((r) => r.body)
  }

  // -- content ideas (§31) --------------------------------------------------
  createContentIdea(input: { workspaceId: string; title: string; angle?: string; format?: string }): string {
    const id = crypto.randomUUID()
    this.db
      .prepare('INSERT INTO content_ideas (id, workspace_id, title, angle, format) VALUES (?, ?, ?, ?, ?)')
      .run(id, input.workspaceId, input.title, input.angle ?? null, input.format ?? null)
    return id
  }

  listContentIdeas(
    workspaceId: string,
  ): Array<{ id: string; title: string; angle: string | null; format: string | null; status: string; created_at: string }> {
    return this.db
      .prepare(
        'SELECT id, title, angle, format, status, created_at FROM content_ideas WHERE workspace_id = ? ORDER BY created_at DESC',
      )
      .all(workspaceId) as unknown as Array<{
      id: string
      title: string
      angle: string | null
      format: string | null
      status: string
      created_at: string
    }>
  }

  updateContentIdeaStatus(id: string, status: string): void {
    this.db
      .prepare("UPDATE content_ideas SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
      .run(status, id)
  }

  deleteContentIdea(id: string): void {
    this.db.prepare('DELETE FROM content_ideas WHERE id = ?').run(id)
  }

  // -- AI result cache (§79, §83) ------------------------------------------
  /**
   * Cache lookups are keyed by input hash + prompt name/version so editing a
   * prompt (or its version) invalidates old results automatically. Provider and
   * model are recorded but not required for a hit, because the router may have
   * answered with a fallback provider.
   */
  findAiCacheEntry(input: {
    inputHash: string
    promptName: string
    promptVersion: number
  }): { provider: string; model: string; result_json: string; created_at: string } | null {
    const row = this.db
      .prepare(
        `SELECT provider, model, result_json, created_at FROM ai_result_cache
         WHERE input_hash = ? AND prompt_name = ? AND prompt_version = ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(input.inputHash, input.promptName, input.promptVersion) as
      | { provider: string; model: string; result_json: string; created_at: string }
      | undefined
    return row ?? null
  }

  upsertAiCacheEntry(input: {
    inputHash: string
    promptName: string
    promptVersion: number
    provider: string
    model: string
    resultJson: string
  }): void {
    this.db
      .prepare(
        `INSERT INTO ai_result_cache (id, input_hash, prompt_name, prompt_version, provider, model, result_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(input_hash, prompt_name, prompt_version, provider, model)
         DO UPDATE SET result_json = excluded.result_json,
                       created_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
      )
      .run(
        crypto.randomUUID(),
        input.inputHash,
        input.promptName,
        input.promptVersion,
        input.provider,
        input.model,
        input.resultJson,
      )
  }

  clearAiCache(): number {
    const result = this.db.prepare('DELETE FROM ai_result_cache').run() as unknown as { changes: number }
    return result.changes
  }

  // -- notifications (§82) --------------------------------------------------
  createNotification(input: { workspaceId: string; type: string; payload?: unknown }): string {
    const id = crypto.randomUUID()
    this.db
      .prepare('INSERT INTO notifications (id, workspace_id, type, payload_json) VALUES (?, ?, ?, ?)')
      .run(id, input.workspaceId, input.type, JSON.stringify(input.payload ?? {}))
    return id
  }

  listNotifications(
    workspaceId: string,
    limit = 50,
  ): Array<{ id: string; type: string; payload_json: string; read_at: string | null; created_at: string }> {
    return this.db
      .prepare(
        'SELECT id, type, payload_json, read_at, created_at FROM notifications WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?',
      )
      .all(workspaceId, limit) as unknown as Array<{
      id: string
      type: string
      payload_json: string
      read_at: string | null
      created_at: string
    }>
  }

  markNotificationRead(id: string): void {
    this.db
      .prepare("UPDATE notifications SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND read_at IS NULL")
      .run(id)
  }

  pruneNotifications(olderThanDays: number): number {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString()
    const result = this.db
      .prepare('DELETE FROM notifications WHERE created_at < ?')
      .run(cutoff) as unknown as { changes: number }
    return result.changes
  }

  unreadNotificationCount(workspaceId: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM notifications WHERE workspace_id = ? AND read_at IS NULL')
      .get(workspaceId) as { n: number }
    return row.n
  }

  // -- competitors (§25–26, §32) -------------------------------------------
  upsertCompetitor(input: {
    workspaceId: string
    platform: string
    channelExternalId: string
    label: string
    handle?: string | null
  }): string {
    const existing = this.db
      .prepare('SELECT id FROM competitors WHERE workspace_id = ? AND platform = ? AND channel_external_id = ?')
      .get(input.workspaceId, input.platform, input.channelExternalId) as { id: string } | undefined
    if (existing) {
      this.db
        .prepare('UPDATE competitors SET label = ?, handle = ? WHERE id = ?')
        .run(input.label, input.handle ?? null, existing.id)
      return existing.id
    }
    const id = crypto.randomUUID()
    this.db
      .prepare(
        'INSERT INTO competitors (id, workspace_id, platform, channel_external_id, label, handle) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(id, input.workspaceId, input.platform, input.channelExternalId, input.label, input.handle ?? null)
    return id
  }

  listCompetitors(workspaceId: string): Array<{
    id: string
    platform: string
    channel_external_id: string
    label: string | null
    handle: string | null
    snapshot_json: string
    last_refreshed_at: string | null
  }> {
    return this.db
      .prepare(
        'SELECT id, platform, channel_external_id, label, handle, snapshot_json, last_refreshed_at FROM competitors WHERE workspace_id = ? ORDER BY COALESCE(label, channel_external_id) ASC',
      )
      .all(workspaceId) as unknown as Array<{
      id: string
      platform: string
      channel_external_id: string
      label: string | null
      handle: string | null
      snapshot_json: string
      last_refreshed_at: string | null
    }>
  }

  updateCompetitorSnapshot(id: string, snapshot: unknown): void {
    this.db
      .prepare(
        "UPDATE competitors SET snapshot_json = ?, last_refreshed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
      )
      .run(JSON.stringify(snapshot), id)
  }

  deleteCompetitor(id: string): void {
    this.db.prepare('DELETE FROM competitors WHERE id = ?').run(id)
  }

  // -- experiments (§46) ----------------------------------------------------
  createExperiment(input: {
    workspaceId: string
    videoId?: string | null
    kind: string
    changedAt?: string | null
    before?: unknown
    after?: unknown
  }): string {
    const id = crypto.randomUUID()
    this.db
      .prepare(
        'INSERT INTO experiments (id, workspace_id, video_id, kind, changed_at, before_json, after_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        id,
        input.workspaceId,
        input.videoId ?? null,
        input.kind,
        input.changedAt ?? null,
        JSON.stringify(input.before ?? {}),
        JSON.stringify(input.after ?? {}),
      )
    return id
  }

  listExperiments(workspaceId: string): Array<{
    id: string
    kind: string
    video_id: string | null
    changed_at: string | null
    before_json: string
    after_json: string
    created_at: string
  }> {
    return this.db
      .prepare(
        'SELECT id, kind, video_id, changed_at, before_json, after_json, created_at FROM experiments WHERE workspace_id = ? ORDER BY COALESCE(changed_at, created_at) DESC',
      )
      .all(workspaceId) as unknown as Array<{
      id: string
      kind: string
      video_id: string | null
      changed_at: string | null
      before_json: string
      after_json: string
      created_at: string
    }>
  }

  deleteExperiment(id: string): void {
    this.db.prepare('DELETE FROM experiments WHERE id = ?').run(id)
  }

  // -- streams (§41–42, §45) -------------------------------------------------
  /**
   * Upserts a live session by (workspace, platform, external id). When the
   * session ends (ended_at) its peak concurrent viewers are recorded with a
   * source string. Uniqueness makes repeated syncs idempotent.
   */
  upsertStream(input: {
    workspaceId: string
    platform: string
    externalId: string
    title?: string | null
    category?: string | null
    startedAt?: string | null
    endedAt?: string | null
    peakViewers?: number | null
  }): void {
    const existing = this.db
      .prepare('SELECT id FROM streams WHERE workspace_id = ? AND platform = ? AND external_id = ?')
      .get(input.workspaceId, input.platform, input.externalId) as { id: string } | undefined

    if (existing) {
      this.db
        .prepare(
          "UPDATE streams SET title = COALESCE(?, title), category = COALESCE(?, category), started_at = COALESCE(?, started_at), ended_at = COALESCE(?, ended_at), peak_viewers = COALESCE(?, peak_viewers) WHERE id = ?",
        )
        .run(
          input.title ?? null,
          input.category ?? null,
          input.startedAt ?? null,
          input.endedAt ?? null,
          input.peakViewers ?? null,
          existing.id,
        )
      return
    }

    this.db
      .prepare(
        'INSERT INTO streams (id, workspace_id, platform, external_id, title, category, started_at, ended_at, peak_viewers) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        crypto.randomUUID(),
        input.workspaceId,
        input.platform,
        input.externalId,
        input.title ?? null,
        input.category ?? null,
        input.startedAt ?? null,
        input.endedAt ?? null,
        input.peakViewers ?? null,
      )
  }

  listStreams(workspaceId: string, limit = 200): StreamRow[] {
    return this.db
      .prepare(
        'SELECT id, workspace_id, platform, external_id, title, category, started_at, ended_at, peak_viewers, avg_viewers FROM streams WHERE workspace_id = ? ORDER BY started_at DESC LIMIT ?',
      )
      .all(workspaceId, limit) as unknown as StreamRow[]
  }

  // -- creator profile / memory (§56) ---------------------------------------
  upsertCreatorProfile(input: { workspaceId: string; niche?: string | null; topics?: string[]; language?: string | null; audience?: string | null; goals?: string[] }): void {
    const current = this.getCreatorProfile(input.workspaceId)
    if (current) {
      this.db
        .prepare(
          "UPDATE creator_profile SET niche = ?, topics_json = ?, language = ?, audience = ?, goals_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE workspace_id = ?",
        )
        .run(
          input.niche !== undefined ? input.niche : current.niche,
          JSON.stringify(input.topics ?? current.topics),
          input.language !== undefined ? input.language : current.language,
          input.audience !== undefined ? input.audience : current.audience,
          JSON.stringify(input.goals ?? current.goals),
          input.workspaceId,
        )
    } else {
      this.db
        .prepare('INSERT INTO creator_profile (id, workspace_id, niche, topics_json, language, audience, goals_json, data_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(
          crypto.randomUUID(),
          input.workspaceId,
          input.niche ?? null,
          JSON.stringify(input.topics ?? []),
          input.language ?? null,
          input.audience ?? null,
          JSON.stringify(input.goals ?? []),
          JSON.stringify({}),
        )
    }
  }

  /** §75 user control: removes the creator profile for this workspace. */
  deleteCreatorProfile(workspaceId: string): void {
    this.db.prepare('DELETE FROM creator_profile WHERE workspace_id = ?').run(workspaceId)
  }

  getCreatorProfile(workspaceId: string): {
    workspace_id: string
    niche: string | null
    topics: string[]
    language: string | null
    audience: string | null
    goals: string[]
    updated_at: string | null
  } | null {
    const row = this.db
      .prepare('SELECT workspace_id, niche, topics_json, language, audience, goals_json, data_json, updated_at FROM creator_profile WHERE workspace_id = ?')
      .get(workspaceId) as
      | { workspace_id: string; niche: string | null; topics_json: string; language: string | null; audience: string | null; goals_json: string; data_json: string; updated_at: string | null }
      | undefined
    if (!row) return null
    const parseList = (json: string): string[] => {
      try {
        const parsed = JSON.parse(json) as unknown
        return Array.isArray(parsed) ? (parsed as string[]) : []
      } catch {
        return []
      }
    }
    const topics = parseList(row.topics_json)
    const goals = parseList(row.goals_json)
    return {
      workspace_id: row.workspace_id,
      niche: row.niche,
      topics,
      language: row.language,
      audience: row.audience,
      goals,
      updated_at: row.updated_at,
    }
  }

  // -- knowledge base (§57) ---------------------------------------------------
  createKnowledgeDoc(input: { workspaceId: string; title: string; body: string }): string {
    const id = crypto.randomUUID()
    this.db
      .prepare('INSERT INTO knowledge_docs (id, workspace_id, title, hash) VALUES (?, ?, ?, ?)')
      .run(id, input.workspaceId, input.title, crypto.randomUUID())
    // Body text lives in the chunk + FTS tables, matching the schema design.
    this.db
      .prepare('INSERT INTO knowledge_chunks (id, doc_id, chunk) VALUES (?, ?, ?)')
      .run(crypto.randomUUID(), id, input.body)
    this.indexEntity('search_transcripts', id, input.title, input.body)
    return id
  }

  listKnowledgeDocs(workspaceId: string): Array<{ id: string; title: string | null; created_at: string }> {
    return this.db
      .prepare('SELECT id, title, created_at FROM knowledge_docs WHERE workspace_id = ? ORDER BY created_at DESC')
      .all(workspaceId) as unknown as Array<{ id: string; title: string | null; created_at: string }>
  }

  getKnowledgeDocBody(id: string): string | null {
    const row = this.db
      .prepare('SELECT chunk FROM knowledge_chunks WHERE doc_id = ? LIMIT 1')
      .get(id) as { chunk: string } | undefined
    return row?.chunk ?? null
  }

  deleteKnowledgeDoc(id: string): void {
    this.db.prepare('DELETE FROM knowledge_docs WHERE id = ?').run(id)
  }

  searchKnowledge(workspaceId: string, query: string, limit = 20): Array<{ id: string; title: string; snippet: string }> {
    const ids = this.search('search_transcripts', query, limit)
    const results: Array<{ id: string; title: string; snippet: string }> = []
    for (const id of ids) {
      const row = this.db
        .prepare('SELECT id, title FROM knowledge_docs WHERE id = ? AND workspace_id = ?')
        .get(id, workspaceId) as { id: string; title: string | null } | undefined
      if (row) {
        const body = this.getKnowledgeDocBody(row.id) ?? ''
        const pos = body.toLowerCase().indexOf(query.split(/\s+/)[0]?.toLowerCase() ?? '')
        const start = Math.max(0, pos - 60)
        results.push({ id: row.id, title: row.title ?? '(untitled)', snippet: (start > 0 ? '…' : '') + body.slice(start, start + 320) })
      }
    }
    return results
  }

  /** §142: every knowledge chunk with its (optional) embedding, workspace-scoped. */
  listKnowledgeChunks(workspaceId: string): Array<{
    id: string
    doc_id: string
    title: string | null
    chunk: string
    embedding: Uint8Array | null
  }> {
    return this.db
      .prepare(
        `SELECT c.id, c.doc_id, d.title, c.chunk, c.embedding
         FROM knowledge_chunks c
         JOIN knowledge_docs d ON d.id = c.doc_id
         WHERE d.workspace_id = ?`,
      )
      .all(workspaceId) as unknown as Array<{
      id: string
      doc_id: string
      title: string | null
      chunk: string
      embedding: Uint8Array | null
    }>
  }

  setKnowledgeChunkEmbedding(chunkId: string, embedding: Uint8Array): void {
    this.db.prepare('UPDATE knowledge_chunks SET embedding = ? WHERE id = ?').run(embedding, chunkId)
  }

  // -- external trends (§23) --------------------------------------------------
  /**
   * Records an observed external trend topic. `freshness` is the number of feed
   * titles the topic appeared in — an observed count, never a platform metric.
   */
  upsertTrend(input: {
    workspaceId: string
    topic: string
    source: string
    freshness?: number | null
    rawJson?: string
  }): void {
    const existing = this.db
      .prepare('SELECT id FROM trends WHERE workspace_id = ? AND topic = ? AND source = ?')
      .get(input.workspaceId, input.topic, input.source) as { id: string } | undefined
    if (existing) {
      this.db
        .prepare(
          "UPDATE trends SET last_seen = strftime('%Y-%m-%dT%H:%M:%fZ','now'), freshness = ?, raw_json = ? WHERE id = ?",
        )
        .run(input.freshness ?? null, input.rawJson ?? '{}', existing.id)
      return
    }
    this.db
      .prepare(
        `INSERT INTO trends (id, workspace_id, topic, source, freshness, first_seen, last_seen, raw_json)
         VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), ?)`,
      )
      .run(
        crypto.randomUUID(),
        input.workspaceId,
        input.topic,
        input.source,
        input.freshness ?? null,
        input.rawJson ?? '{}',
      )
  }

  listTrends(
    workspaceId: string,
    limit = 100,
  ): Array<{
    topic: string
    source: string
    freshness: number | null
    last_seen: string | null
    raw_json: string
  }> {
    return this.db
      .prepare(
        'SELECT topic, source, freshness, last_seen, raw_json FROM trends WHERE workspace_id = ? ORDER BY freshness DESC, last_seen DESC LIMIT ?',
      )
      .all(workspaceId, limit) as unknown as Array<{
      topic: string
      source: string
      freshness: number | null
      last_seen: string | null
      raw_json: string
    }>
  }

  clearTrends(workspaceId: string): number {
    const result = this.db.prepare('DELETE FROM trends WHERE workspace_id = ?').run(workspaceId)
    return Number(result.changes ?? 0)
  }

  // -- search history & favorites (§121, §122) --------------------------------
  addSearchHistory(workspaceId: string, query: string, scope: string): void {
    const trimmed = query.trim()
    if (!trimmed) return
    this.db
      .prepare('INSERT INTO search_history (id, workspace_id, query, scope) VALUES (?, ?, ?, ?)')
      .run(crypto.randomUUID(), workspaceId, trimmed, scope)
  }

  listSearchHistory(workspaceId: string, limit = 30): Array<{ id: string; query: string; scope: string | null; created_at: string }> {
    return this.db
      .prepare('SELECT id, query, scope, created_at FROM search_history WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(workspaceId, limit) as unknown as Array<{ id: string; query: string; scope: string | null; created_at: string }>
  }

  clearSearchHistory(workspaceId: string): number {
    const result = this.db.prepare('DELETE FROM search_history WHERE workspace_id = ?').run(workspaceId) as unknown as {
      changes: number
    }
    return result.changes
  }

  addFavorite(input: { workspaceId: string; entityType: string; entityId: string; label: string }): void {
    // `label` is rendered from the live entity at read time in the UI; the
    // schema stores only the reference, so label is kept in memory of the call
    // site — we re-look-up at render. To stay schema-faithful, ignore label
    // beyond the unique lookup.
    this.db
      .prepare('INSERT OR IGNORE INTO favorites (id, workspace_id, entity_type, entity_id) VALUES (?, ?, ?, ?)')
      .run(crypto.randomUUID(), input.workspaceId, input.entityType, input.entityId)
  }

  removeFavorite(workspaceId: string, entityType: string, entityId: string): void {
    this.db
      .prepare('DELETE FROM favorites WHERE workspace_id = ? AND entity_type = ? AND entity_id = ?')
      .run(workspaceId, entityType, entityId)
  }

  listFavorites(workspaceId: string, entityType?: string): Array<{ id: string; entity_type: string; entity_id: string; created_at: string }> {
    if (entityType) {
      return this.db
        .prepare('SELECT id, entity_type, entity_id, created_at FROM favorites WHERE workspace_id = ? AND entity_type = ? ORDER BY created_at DESC')
        .all(workspaceId, entityType) as unknown as Array<{ id: string; entity_type: string; entity_id: string; created_at: string }>
    }
    return this.db
      .prepare('SELECT id, entity_type, entity_id, created_at FROM favorites WHERE workspace_id = ? ORDER BY created_at DESC')
      .all(workspaceId) as unknown as Array<{ id: string; entity_type: string; entity_id: string; created_at: string }>
  }

  // -- keywords (§20) -------------------------------------------------------
  upsertKeyword(input: {
    workspaceId: string
    term: string
    intent?: string | null
    relativeDemand?: string | null
    trendIndex?: number | null
    competitionEstimate?: string | null
    opportunity?: number | null
    source: string
  }): void {
    const existing = this.db
      .prepare('SELECT id FROM keywords WHERE workspace_id = ? AND term = ?')
      .get(input.workspaceId, input.term) as { id: string } | undefined
    if (existing) {
      this.db
        .prepare(
          "UPDATE keywords SET intent = ?, relative_demand = ?, trend_index = ?, competition_estimate = ?, opportunity = ?, source = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
        )
        .run(
          input.intent ?? null,
          input.relativeDemand ?? null,
          input.trendIndex ?? null,
          input.competitionEstimate ?? null,
          input.opportunity ?? null,
          input.source,
          existing.id,
        )
    } else {
      this.db
        .prepare(
          'INSERT INTO keywords (id, workspace_id, term, intent, relative_demand, trend_index, competition_estimate, opportunity, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          crypto.randomUUID(),
          input.workspaceId,
          input.term,
          input.intent ?? null,
          input.relativeDemand ?? null,
          input.trendIndex ?? null,
          input.competitionEstimate ?? null,
          input.opportunity ?? null,
          input.source,
        )
    }
  }

  listKeywords(workspaceId: string): Array<{
    term: string
    intent: string | null
    relative_demand: string | null
    competition_estimate: string | null
    opportunity: number | null
    source: string
  }> {
    return this.db
      .prepare(
        'SELECT term, intent, relative_demand, competition_estimate, opportunity, source FROM keywords WHERE workspace_id = ? ORDER BY opportunity DESC NULLS LAST, term ASC',
      )
      .all(workspaceId) as unknown as Array<{
      term: string
      intent: string | null
      relative_demand: string | null
      competition_estimate: string | null
      opportunity: number | null
      source: string
    }>
  }
}
