import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { AiResultCache } from '../ai/result-cache'
import { buildCopilotBriefing } from '../ai/copilot'
import { planFromSavedKeywords } from '../research/ideas'
import { analyzeKeyword } from '../research/keywords'
import { csvToRecords, toCsv } from '../export/exporters'
import { buildMonthlyReview, saveTextFile } from './report-service'
import { buildSponsorReport, diagnoseStoredVideo, buildProgressReport } from './growth-service'
import { checkForUpdate } from './update-service'
import { renderPdf, markdownToPdfBlocks } from '../export/pdf'
import { writeFileSync } from 'node:fs'
import {
  buildAnalyticsOverview,
  buildContentGaps,
  buildPublishingMomentum,
  rankOpportunities,
} from '../analytics/insights'
import { buildWeeklyPlan, findHighestValueTask } from '../core/planning/weekly'
import { suggestProjectLinks } from '../core/planning/link-projects'
import { getVectorStatus, indexKnowledge, semanticSearch } from './knowledge-service'
import { listTrendTopics, syncFeeds } from './feed-service'
import { extractClip, getFfmpegStatus, probeVideo } from './ffmpeg-service'
import { getAnalyticsSnapshot, getVideoRetention, syncYouTubeAnalytics } from './analytics-sync-service'
import { runAcceptance } from './acceptance-service'
import { buildVideoTrajectory } from '../analytics/trajectory'
import { scoreSeo } from '../core/scores/seo'
import { scoreTitle } from '../core/scores/title'
import { assessStreamTitle } from '../core/writing/stream-title'
import { summarizeComments } from '../ai/comment-intelligence'
import { generateWithFallback } from '../providers/router'
import type { GenerationRequest } from '../providers/types'

/**
 * Generation payload. `promptName`/`promptVersion` opt the request into the
 * result cache; `regenerate` forces a fresh call and refreshes the entry.
 */
type GeneratePayload = GenerationRequest & {
  promptName?: string
  promptVersion?: number
  regenerate?: boolean
}
import { obsConnect, obsDisconnect, obsHealth } from './obs-service'
import { getConversionOverview } from './conversion-service'
import {
  addKnowledge,
  askKnowledge,
  clearHistory,
  deleteKnowledge,
  getHistory,
  getProfile,
  listFavorites,
  listKnowledge,
  recordSearch,
  saveProfile,
  searchKnowledge,
  toggleFavorite,
} from './memory-service'
import {
  researchTwitchCategories,
  syncTwitchStreams,
} from './stream-service'
import { addCompetitor, listCompetitors, refreshCompetitor, removeCompetitor } from './competitor-service'
import { checkDependencies } from './dependencies'
import { analyzeThumbnail } from './thumbnail-service'
import { buildDashboardSummary } from './dashboard-service'
import { databaseSizeBytes, exportBackup, importBackup, integrityCheck, vacuum } from './backup'
import {
  completeDeviceSignIn,
  configurePlatform,
  connectPlatform,
  disconnectPlatform,
  listPlatforms,
  syncPlatform,
} from './platform-service'
import { getScheduler } from './scheduler-service'
import { buildDiagnostics, getEntries, setLogLevel, type LogLevel } from './logger'
import { getUsage, recordUsage, compareProviders } from './usage-service'
import { getServices } from './services'
import type { PlatformId } from '../platforms/types'

/** IPC channel names, mirrored in the renderer bridge. */
export const IPC = {
  appInfo: 'app:info',
  providersHealth: 'providers:health',
  providersGenerate: 'providers:generate',
  aiCacheClear: 'ai:cache:clear',
  seoAnalyze: 'seo:analyze',
  titleScore: 'title:score',
  workspacesList: 'workspaces:list',
  workspacesCreate: 'workspaces:create',
  workspacesSetActive: 'workspaces:setActive',
  projectsList: 'projects:list',
  projectsCreate: 'projects:create',
  projectsUpdateStage: 'projects:updateStage',
  projectsLinkSuggestions: 'projects:linkSuggestions',
  projectsLink: 'projects:link',
  projectsAutoLink: 'projects:autoLink',
  calendarList: 'calendar:list',
  calendarCreate: 'calendar:create',
  calendarReschedule: 'calendar:reschedule',
  commentsIngest: 'comments:ingest',
  commentsSummarize: 'comments:summarize',
  keywordsList: 'keywords:list',
  keywordsAnalyze: 'keywords:analyze',
  obsConnect: 'obs:connect',
  obsHealth: 'obs:health',
  obsDisconnect: 'obs:disconnect',
  openExternal: 'app:openExternal',
  platformsList: 'platforms:list',
  platformsConfigure: 'platforms:configure',
  platformsConnect: 'platforms:connect',
  platformsComplete: 'platforms:complete',
  platformsDisconnect: 'platforms:disconnect',
  platformsSync: 'platforms:sync',
  dashboardSummary: 'dashboard:summary',
  dataInfo: 'data:info',
  dataExport: 'data:export',
  dataImport: 'data:import',
  dataVacuum: 'data:vacuum',
  dependenciesList: 'dependencies:list',
  notificationsList: 'notifications:list',
  notificationsMarkRead: 'notifications:markRead',
  schedulerStatus: 'scheduler:status',
  schedulerRun: 'scheduler:run',
  thumbnailsAnalyze: 'thumbnails:analyze',
  analyticsOverview: 'analytics:overview',
  analyticsSync: 'analytics:sync',
  analyticsSnapshot: 'analytics:snapshot',
  videoTrajectory: 'videos:trajectory',
  videoRetention: 'videos:retention',
  videosList: 'videos:list',
  researchMomentum: 'research:momentum',
  researchGaps: 'research:gaps',
  researchOpportunities: 'research:opportunities',
  experimentsList: 'experiments:list',
  experimentsCreate: 'experiments:create',
  experimentsDelete: 'experiments:delete',
  competitorsList: 'competitors:list',
  competitorsAdd: 'competitors:add',
  competitorsRefresh: 'competitors:refresh',
  competitorsRemove: 'competitors:remove',
  copilotBriefing: 'copilot:briefing',
  dataSaveText: 'data:saveText',
  reportsMonthlyReview: 'reports:monthlyReview',
  reportsVideosCsv: 'reports:videosCsv',
  ideasList: 'ideas:list',
  ideasCreate: 'ideas:create',
  ideasDelete: 'ideas:delete',
  ideasPlan: 'ideas:plan',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  streamSync: 'stream:sync',
  streamCategories: 'stream:categories',
  streamsList: 'streams:list',
  streamTitleScore: 'stream-title:score',
  conversionFunnel: 'conversion:funnel',
  profileGet: 'profile:get',
  profileSave: 'profile:save',
  knowledgeList: 'knowledge:list',
  knowledgeAdd: 'knowledge:add',
  knowledgeDelete: 'knowledge:delete',
  knowledgeSearch: 'knowledge:search',
  knowledgeAsk: 'knowledge:ask',
  knowledgeVectorStatus: 'knowledge:vectorStatus',
  knowledgeIndexEmbeddings: 'knowledge:indexEmbeddings',
  feedsSync: 'feeds:sync',
  feedsList: 'feeds:list',
  mediaFfmpegStatus: 'media:ffmpegStatus',
  mediaPickVideo: 'media:pickVideo',
  mediaExtractClip: 'media:extractClip',
  profileDelete: 'profile:delete',
  dataReset: 'data:reset',
  historyList: 'history:list',
  historyRecord: 'history:record',
  historyClear: 'history:clear',
  favoritesList: 'favorites:list',
  favoritesToggle: 'favorites:toggle',
  planWeekly: 'plan:weekly',
  planNextTask: 'plan:nextTask',
  acceptanceRun: 'acceptance:run',
  logsList: 'logs:list',
  logsDiagnostics: 'logs:diagnostics',
  logsSetLevel: 'logs:setLevel',
  settingsSetRefreshInterval: 'settings:setRefreshInterval',
  growthSponsor: 'growth:sponsor',
  growthDiagnose: 'growth:diagnose',
  growthProgress: 'growth:progress',
  dataSavePdf: 'data:savePdf',
  appUpdateCheck: 'app:updateCheck',
  settingsSetTaskProvider: 'settings:setTaskProvider',
  settingsGetTaskOverrides: 'settings:getTaskOverrides',
  dataImportCsv: 'data:importCsv',
  aiUsage: 'ai:usage',
  aiConsensus: 'ai:consensus',
} as const

/**
 * Returns the active workspace id, creating a default one on first use so the
 * app is immediately usable (spec §74 allows skipping setup). The active
 * workspace is a per-app setting (§109) so multiple creator profiles stay
 * independent; it falls back to the first workspace when unset.
 */
function ensureWorkspace(): string {
  const { repos } = getServices()
  const all = repos.listWorkspaces()
  if (all.length === 0) return repos.createWorkspace(crypto.randomUUID(), 'My Channel').id
  const activeId = repos.getSetting<string>('app', 'workspace.active')
  if (activeId && all.some((workspace) => workspace.id === activeId)) return activeId
  return all[0]!.id
}

/**
 * IPC surface. Read handlers (safe for the AI copilot, §107) and write handlers
 * (always user-initiated, §108) are kept together but clearly separated below.
 */
export function registerIpcHandlers(): void {
  // ---- app / connections -------------------------------------------------
  ipcMain.handle(IPC.appInfo, () => ({
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron,
    node: process.versions.node,
  }))

  ipcMain.handle(IPC.providersHealth, async () => {
    const { providers } = getServices()
    return Promise.all(
      [...providers.values()].map(async (provider) => ({
        id: provider.id,
        displayName: provider.displayName,
        health: await provider.healthCheck().catch((error: unknown) => ({
          available: false,
          authenticated: false,
          detail: error instanceof Error ? error.message : 'Health check failed',
          checkedAt: new Date().toISOString(),
        })),
      })),
    )
  })

  ipcMain.handle(IPC.openExternal, async (_event, url: string) => {
    if (!/^https?:\/\//i.test(url)) return false
    await shell.openExternal(url)
    return true
  })

  // ---- read tools / engines ----------------------------------------------
  ipcMain.handle(IPC.seoAnalyze, (_event, input: Parameters<typeof scoreSeo>[0]) => scoreSeo(input))
  ipcMain.handle(IPC.titleScore, (_event, input: Parameters<typeof scoreTitle>[0]) => scoreTitle(input))
  ipcMain.handle(IPC.workspacesList, () => getServices().repos.listWorkspaces())

  ipcMain.handle(IPC.projectsList, () => getServices().repos.listProjects(ensureWorkspace()))

  ipcMain.handle(IPC.projectsLinkSuggestions, () => {
    const { repos } = getServices()
    const workspaceId = ensureWorkspace()
    return suggestProjectLinks(
      repos.listProjects(workspaceId),
      repos.listVideos(workspaceId, 500),
    )
  })
  ipcMain.handle(IPC.calendarList, () => getServices().repos.listCalendarItems(ensureWorkspace()))
  ipcMain.handle(IPC.keywordsList, () => getServices().repos.listKeywords(ensureWorkspace()))
  ipcMain.handle(IPC.dashboardSummary, () =>
    buildDashboardSummary(getServices().repos, ensureWorkspace()),
  )

  ipcMain.handle(IPC.analyticsOverview, () =>
    buildAnalyticsOverview(getServices().repos, ensureWorkspace()),
  )

  ipcMain.handle(IPC.videosList, () => getServices().repos.listVideos(ensureWorkspace(), 500))

  ipcMain.handle(IPC.analyticsSync, (_event, payload: { days?: number }) =>
    syncYouTubeAnalytics(ensureWorkspace(), payload?.days ?? 90),
  )

  ipcMain.handle(IPC.analyticsSnapshot, () => getAnalyticsSnapshot(ensureWorkspace()))

  ipcMain.handle(IPC.videoRetention, (_event, payload: { videoId: string }) =>
    getVideoRetention(payload?.videoId ?? ''),
  )

  ipcMain.handle(IPC.videoTrajectory, (_event, payload: { videoId: string }) => {
    const { repos } = getServices()
    const workspaceId = ensureWorkspace()
    const video = repos.listVideos(workspaceId, 1000).find((row) => row.id === payload?.videoId)
    if (!video) throw new Error('Video not found.')
    return buildVideoTrajectory(repos, video)
  })

  ipcMain.handle(IPC.researchMomentum, () =>
    buildPublishingMomentum(getServices().repos, ensureWorkspace()),
  )

  ipcMain.handle(
    IPC.researchGaps,
    (_event, payload: { competitorTopics: Array<{ topic: string; count: number }> }) =>
      buildContentGaps(getServices().repos, ensureWorkspace(), payload?.competitorTopics ?? []),
  )

  ipcMain.handle(IPC.researchOpportunities, () =>
    rankOpportunities(getServices().repos, ensureWorkspace()),
  )

  ipcMain.handle(IPC.experimentsList, () => getServices().repos.listExperiments(ensureWorkspace()))

  ipcMain.handle(
    IPC.experimentsCreate,
    (_event, payload: { kind: string; subject?: string; changedAt?: string | null; before?: string; after?: string }) =>
      getServices().repos.createExperiment({
        workspaceId: ensureWorkspace(),
        kind: payload.kind,
        changedAt: payload.changedAt ?? null,
        before: { subject: payload.subject ?? '', value: payload.before ?? '' },
        after: { subject: payload.subject ?? '', value: payload.after ?? '' },
      }),
  )

  ipcMain.handle(IPC.experimentsDelete, (_event, payload: { id: string }) => {
    getServices().repos.deleteExperiment(payload.id)
    return true
  })

  // ---- competitor research (§25–26, §32) ---------------------------------
  ipcMain.handle(
    IPC.copilotBriefing,
    (_event, payload: { context?: Record<string, boolean>; knowledge?: boolean } = {}) => {
      const workspaceId = ensureWorkspace()
      const wantKnowledge = payload?.knowledge ?? false
      const snippets = wantKnowledge
        ? getServices()
            .repos.listKnowledgeDocs(workspaceId)
            .slice(0, 3)
            .map((doc) => `${doc.title ?? '(untitled)'}: ${(getServices().repos.getKnowledgeDocBody(doc.id) ?? '').slice(0, 300)}`)
            .filter((snippet) => snippet.length > 15)
        : []
      return buildCopilotBriefing(getServices().repos, workspaceId, {
        knowledgeSnippets: snippets,
        context: payload?.context,
      })
    },
  )

  // ---- reports & exports (§69, §128) -------------------------------------
  ipcMain.handle(IPC.reportsMonthlyReview, () =>
    buildMonthlyReview(getServices().repos, ensureWorkspace()),
  )

  ipcMain.handle(IPC.reportsVideosCsv, () => {
    const videos = getServices().repos.listVideos(ensureWorkspace(), 500)
    const csv = toCsv(
      videos.map((video) => ({
        title: video.title ?? '',
        platform: video.platform,
        external_id: video.external_id,
        published_at: video.published_at ?? '',
        views: video.views ?? '',
        likes: video.likes ?? '',
        comments: video.comments ?? '',
      })),
    )
    return { csv, fileName: `videos-${new Date().toISOString().slice(0, 10)}.csv` }
  })

  ipcMain.handle(
    IPC.dataSaveText,
    (_event, payload: { defaultName: string; content: string }) =>
      saveTextFile({ defaultName: payload.defaultName, content: payload.content }),
  )

  // ---- §68 sponsor readiness / §53 diagnosis / §119 goal progress ----------
  ipcMain.handle(IPC.growthSponsor, () => buildSponsorReport(ensureWorkspace()))
  ipcMain.handle(IPC.growthDiagnose, (_event, payload: { videoId: string }) =>
    diagnoseStoredVideo(ensureWorkspace(), payload?.videoId ?? ''),
  )
  ipcMain.handle(IPC.growthProgress, () => buildProgressReport(ensureWorkspace()))

  // ---- §69 PDF export (plain-text PDF, written via OS save dialog) ----------
  ipcMain.handle(IPC.dataSavePdf, async (_event, payload: { defaultName: string; title: string; markdown: string }) => {
    const { dialog, BrowserWindow } = await import('electron')
    const parent = BrowserWindow.getFocusedWindow()
    const options = {
      title: 'Save PDF export',
      defaultPath: payload.defaultName.endsWith('.pdf') ? payload.defaultName : `${payload.defaultName}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    }
    const result = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return { ok: false, canceled: true }
    try {
      const bytes = renderPdf(markdownToPdfBlocks(payload.title, payload.markdown))
      writeFileSync(result.filePath, Buffer.from(bytes))
      return { ok: true, path: result.filePath }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Could not write the PDF.' }
    }
  })

  // ---- §88 update check (read-only; user opens the release page) -----------
  ipcMain.handle(IPC.appUpdateCheck, async () => {
    const result = await checkForUpdate(app.getVersion())
    if (result.ok && result.updateAvailable && result.releaseUrl) {
      // Only records a notification; nothing is downloaded or installed.
      getServices().repos.createNotification({
        workspaceId: ensureWorkspace(),
        type: 'update',
        payload: { version: result.latestVersion, url: result.releaseUrl },
      })
    }
    return result
  })

  // ---- content ideas (§21, §31) ------------------------------------------
  ipcMain.handle(IPC.ideasList, () => getServices().repos.listContentIdeas(ensureWorkspace()))

  ipcMain.handle(
    IPC.ideasCreate,
    (_event, payload: { title: string; angle?: string; format?: string }) =>
      getServices().repos.createContentIdea({
        workspaceId: ensureWorkspace(),
        title: payload.title,
        angle: payload.angle,
        format: payload.format,
      }),
  )

  ipcMain.handle(IPC.ideasDelete, (_event, payload: { id: string }) => {
    getServices().repos.deleteContentIdea(payload.id)
    return true
  })

  ipcMain.handle(IPC.ideasPlan, () => {
    const { repos } = getServices()
    return planFromSavedKeywords(repos.listKeywords(ensureWorkspace()))
  })

  // ---- settings (§71) — workspaces:list is registered with the read tools ----
  ipcMain.handle(IPC.workspacesSetActive, (_event, payload: { id: string }) => {
    const { repos } = getServices()
    const exists = repos.listWorkspaces().some((workspace) => workspace.id === payload?.id)
    if (!exists) return { ok: false, error: 'Workspace not found.' }
    repos.setSetting('app', 'workspace.active', payload.id)
    return { ok: true }
  })

  ipcMain.handle(IPC.settingsGet, (_event, payload: { key: string }) =>
    getServices().repos.getSetting<unknown>('app', payload.key),
  )

  ipcMain.handle(IPC.settingsSet, (_event, payload: { key: string; value: unknown }) => {
    getServices().repos.setSetting('app', payload.key, payload.value)
    return true
  })

  ipcMain.handle(IPC.competitorsList, () => listCompetitors(ensureWorkspace()))
  ipcMain.handle(IPC.competitorsAdd, (_event, payload: { handle: string }) =>
    addCompetitor(ensureWorkspace(), { handle: payload?.handle ?? '' }),
  )
  ipcMain.handle(IPC.competitorsRefresh, (_event, payload: { id: string }) =>
    refreshCompetitor(ensureWorkspace(), payload.id),
  )
  ipcMain.handle(IPC.competitorsRemove, (_event, payload: { id: string }) => {
    removeCompetitor(payload.id)
    return true
  })

  // ---- live streaming research (§40–41, §45) ------------------------------
  ipcMain.handle(IPC.streamSync, () => syncTwitchStreams(ensureWorkspace()))

  ipcMain.handle(
    IPC.streamCategories,
    (_event, payload: { categories: string[] }) =>
      researchTwitchCategories(ensureWorkspace(), { categories: payload?.categories ?? [] }),
  )

  ipcMain.handle(IPC.streamsList, () => {
    const { repos } = getServices()
    return { sessions: repos.listStreams(ensureWorkspace()) }
  })

  ipcMain.handle(IPC.conversionFunnel, () => getConversionOverview(ensureWorkspace()))

  // ---- creator memory & knowledge (§56–57, §121–122) -----------------------
  ipcMain.handle(IPC.profileGet, () => getProfile(ensureWorkspace()))

  ipcMain.handle(
    IPC.profileSave,
    (_event, payload: { niche?: string; topicsText?: string; language?: string; audience?: string; goalsText?: string }) =>
      saveProfile(ensureWorkspace(), payload ?? {}),
  )

  ipcMain.handle(IPC.knowledgeList, () => listKnowledge(ensureWorkspace()))

  ipcMain.handle(IPC.knowledgeAdd, (_event, payload: { title: string; body: string }) =>
    addKnowledge(ensureWorkspace(), { title: payload?.title ?? '', body: payload?.body ?? '' }),
  )

  ipcMain.handle(IPC.knowledgeDelete, (_event, payload: { id: string }) => {
    deleteKnowledge(payload.id)
    return true
  })

  ipcMain.handle(IPC.knowledgeSearch, async (_event, payload: { query: string }) => {
    const workspaceId = ensureWorkspace()
    const query = payload?.query ?? ''
    // Prefer local semantic search when the knowledge base has been embedded;
    // otherwise fall back to the FTS index so search always returns something.
    const semantic = await semanticSearch(workspaceId, query).catch(() => null)
    if (semantic && semantic.used && semantic.hits.length > 0) return semantic.hits
    return searchKnowledge(workspaceId, query)
  })

  ipcMain.handle(IPC.knowledgeVectorStatus, () => getVectorStatus(ensureWorkspace()))

  ipcMain.handle(IPC.knowledgeIndexEmbeddings, () => indexKnowledge(ensureWorkspace()))

  ipcMain.handle(IPC.feedsList, () => listTrendTopics(ensureWorkspace()))

  ipcMain.handle(IPC.feedsSync, (_event, payload: { urls: string[] }) =>
    syncFeeds(ensureWorkspace(), payload?.urls ?? []),
  )

  ipcMain.handle(IPC.mediaFfmpegStatus, () => getFfmpegStatus())

  ipcMain.handle(IPC.mediaPickVideo, async () => {
    const window = BrowserWindow.getFocusedWindow()
    const options = {
      title: 'Choose a video to clip',
      properties: ['openFile' as const],
      filters: [
        { name: 'Video', extensions: ['mp4', 'mkv', 'mov', 'webm', 'avi', 'ts', 'flv', 'm4v'] },
        { name: 'All files', extensions: ['*'] },
      ],
    }
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return { canceled: true as const }
    const filePath = result.filePaths[0] as string
    return { canceled: false as const, ...probeVideo(filePath) }
  })

  ipcMain.handle(
    IPC.mediaExtractClip,
    async (
      event,
      payload: { inputPath: string; startSeconds: number; endSeconds: number; reencode?: boolean },
    ) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      const options = {
        title: 'Save clip',
        defaultPath: 'clip.mp4',
        filters: [{ name: 'MP4 video', extensions: ['mp4'] }],
      }
      const save = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options)
      if (save.canceled || !save.filePath) return { ok: false as const, canceled: true as const, outputPath: '', error: null }
      const result = extractClip({
        inputPath: payload?.inputPath ?? '',
        outputPath: save.filePath,
        startSeconds: payload?.startSeconds ?? 0,
        endSeconds: payload?.endSeconds ?? 0,
        ...(payload?.reencode ? { reencode: true } : {}),
      })
      return { ...result, canceled: false as const }
    },
  )

  ipcMain.handle(IPC.knowledgeAsk, async (_event, payload: { question: string }) => {
    const { providers } = getServices()
    return askKnowledge(ensureWorkspace(), payload?.question ?? '', async (system, input) => {
      const outcome = await generateWithFallback(providers, { task: 'chat', system, input }, { choice: 'auto' })
      return outcome.result.text
    })
  })

  ipcMain.handle(IPC.historyList, () => getHistory(ensureWorkspace()))

  ipcMain.handle(IPC.historyRecord, (_event, payload: { query: string; scope: string }) => {
    recordSearch(ensureWorkspace(), payload?.query ?? '', payload?.scope ?? 'keyword')
    return true
  })

  ipcMain.handle(IPC.historyClear, () => clearHistory(ensureWorkspace()))

  // ---- §75 user controls: delete profile / reset app -------------------------
  ipcMain.handle(IPC.profileDelete, () => {
    getServices().repos.deleteCreatorProfile(ensureWorkspace())
    return true
  })

  ipcMain.handle(IPC.dataReset, async () => {
    const { db, repos, secretStore } = getServices()
    // Local, explicit, and total: analytics, research, AI cache, logs of
    // activity, and stored platform/AI credentials. The app restarts after.
    for (const workspace of repos.listWorkspaces()) {
      repos.clearSearchHistory(workspace.id)
      repos.deleteCreatorProfile(workspace.id)
    }
    new AiResultCache(repos).clear()
    for (const table of [
      'notifications',
      'experiments',
      'calendar_items',
      'video_projects',
      'content_ideas',
      'keywords',
      'stream_snapshots',
      'streams',
      'comments',
      'video_snapshots',
      'videos',
      'channels',
      'competitors',
      'platform_connections',
      'ai_connections',
      'search_videos',
      'search_projects',
      'search_comments',
      'search_reports',
      'search_ideas',
      'search_transcripts',
    ]) {
      db.prepare(`DELETE FROM ${table}`).run()
    }
    // Credentials require reconnecting afterwards (§129: prefer reauth).
    for (const key of ['platform/youtube', 'platform/twitch', 'integration/google', 'integration/twitch', 'ai/chatgpt', 'obs/password']) {
      await secretStore.delete(key).catch(() => undefined)
    }
    return { ok: true }
  })

  ipcMain.handle(IPC.favoritesList, () => listFavorites(ensureWorkspace()))

  ipcMain.handle(IPC.favoritesToggle, (_event, payload: { entityType: string; entityId: string }) =>
    toggleFavorite(ensureWorkspace(), payload?.entityType ?? '', payload?.entityId ?? ''),
  )

  // ---- planning (§149–150) ---------------------------------------------------
  ipcMain.handle(IPC.planWeekly, () => buildWeeklyPlan(getServices().repos, ensureWorkspace()))

  ipcMain.handle(IPC.planNextTask, () => findHighestValueTask(getServices().repos, ensureWorkspace()))

  // ---- acceptance self-check (§155) -------------------------------------------
  ipcMain.handle(IPC.acceptanceRun, () => runAcceptance(ensureWorkspace()))

  // ---- logs (§87) -------------------------------------------------------------
  ipcMain.handle(IPC.logsList, (_event, payload: { level?: 'all' | 'warn' | 'error' }) => {
    if (payload?.level === 'error') return { entries: getEntries('error') }
    if (payload?.level === 'warn') return { entries: getEntries('warn') }
    return { entries: getEntries() }
  })

  ipcMain.handle(IPC.logsDiagnostics, () => ({ text: buildDiagnostics() }))

  ipcMain.handle(IPC.settingsGetTaskOverrides, () =>
    getServices().repos.getSetting<Record<string, string>>('app', 'router.taskOverrides') ?? {},
  )

  ipcMain.handle(IPC.logsSetLevel, (_event, payload: { level: LogLevel }) => {
    setLogLevel(payload.level)
    return true
  })

  ipcMain.handle(
    IPC.streamTitleScore,
    (_event, payload: { title: string; category?: string; game?: string }) =>
      assessStreamTitle({ title: payload?.title ?? '', category: payload?.category ?? null, game: payload?.game ?? null }),
  )

  ipcMain.handle(IPC.obsHealth, () => obsHealth())
  ipcMain.handle(IPC.obsConnect, async (_event, payload: { password?: string }) => {
    const result = await obsConnect(payload?.password)
    return { ...result, health: await obsHealth() }
  })
  ipcMain.handle(IPC.obsDisconnect, async () => {
    await obsDisconnect()
    return true
  })

  ipcMain.handle(IPC.commentsSummarize, () => {
    const { repos } = getServices()
    return summarizeComments(repos.listCommentBodies(ensureWorkspace()))
  })

  // ---- platform connections (§8, §9, §73) --------------------------------
  ipcMain.handle(IPC.platformsList, () => listPlatforms())

  ipcMain.handle(
    IPC.platformsConfigure,
    (_event, payload: { platform: PlatformId; clientId: string; clientSecret?: string }) =>
      configurePlatform(payload.platform, {
        clientId: payload.clientId,
        ...(payload.clientSecret ? { clientSecret: payload.clientSecret } : {}),
      }),
  )

  ipcMain.handle(IPC.platformsConnect, (_event, payload: { platform: PlatformId }) =>
    connectPlatform(payload.platform, ensureWorkspace()),
  )

  ipcMain.handle(
    IPC.platformsComplete,
    (_event, payload: { platform: PlatformId; deviceCode: string }) =>
      completeDeviceSignIn(payload.platform, payload.deviceCode, ensureWorkspace()),
  )

  ipcMain.handle(IPC.platformsDisconnect, async (_event, payload: { platform: PlatformId }) => {
    await disconnectPlatform(payload.platform, ensureWorkspace())
    return true
  })

  ipcMain.handle(IPC.platformsSync, (_event, payload: { platform: PlatformId }) =>
    syncPlatform(payload.platform, ensureWorkspace()),
  )

  // ---- data maintenance / diagnostics (§78, §111, §112) -------------------
  ipcMain.handle(IPC.dataInfo, () => {
    const { db } = getServices()
    const count = (table: string): number => {
      const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }
      return row.n
    }
    return {
      databaseBytes: databaseSizeBytes(),
      integrity: integrityCheck(),
      counts: {
        channels: count('channels'),
        videos: count('videos'),
        keywords: count('keywords'),
        projects: count('video_projects'),
        comments: count('comments'),
        aiCacheEntries: count('ai_result_cache'),
      },
    }
  })

  ipcMain.handle(IPC.dataExport, () => exportBackup())
  ipcMain.handle(IPC.dataImport, () => importBackup())
  ipcMain.handle(IPC.dataVacuum, () => vacuum())

  // ---- CSV import (§128): keywords or video rows, via an OS open dialog ------
  ipcMain.handle(IPC.dataImportCsv, async () => {
    const dialogResult = await dialog.showOpenDialog({
      title: 'Import CSV',
      filters: [{ name: 'CSV', extensions: ['csv', 'txt'] }],
      properties: ['openFile'],
    })
    const filePath = dialogResult.filePaths[0]
    if (!filePath) return { ok: false, canceled: true }

    const { readFileSync } = await import('node:fs')
    let content: string
    try {
      content = readFileSync(filePath, 'utf8')
    } catch {
      return { ok: false, error: 'Could not read the selected file.' }
    }

    const records = csvToRecords(content)
    if (records.length === 0) return { ok: false, error: 'The file has no data rows.' }

    const { repos } = getServices()
    const workspaceId = ensureWorkspace()
    const columns = Object.keys(records[0] ?? {}).map((key) => key.toLowerCase())

    // Keyword CSV: term + optional demand/competition indices.
    if (columns.includes('term') || columns.includes('keyword')) {
      let imported = 0
      for (const record of records) {
        const term = (record['term'] ?? record['keyword'] ?? '').trim()
        if (!term) continue
        const demandRaw = record['demand'] ?? record['demand index'] ?? record['trend index'] ?? ''
        const competitionRaw = record['competition'] ?? record['competition index'] ?? ''
        const demand = demandRaw === '' ? null : Number(demandRaw)
        const competition = competitionRaw === '' ? null : Number(competitionRaw)
        const insight = analyzeKeyword({
          term,
          demandIndex: demand !== null && Number.isFinite(demand) ? demand : null,
          competitionIndex: competition !== null && Number.isFinite(competition) ? competition : null,
          source: 'imported_csv',
        })
        repos.upsertKeyword({
          workspaceId,
          term,
          intent: insight.intent,
          relativeDemand: insight.relativeDemand,
          trendIndex: demand !== null && Number.isFinite(demand) ? demand : null,
          competitionEstimate: insight.competitionEstimate,
          opportunity: insight.opportunity,
          source: 'imported_csv',
        })
        imported += 1
      }
      return { ok: true, kind: 'keywords', imported }
    }

    // Video CSV: title/external id/views — stored as plain rows + snapshots.
    if (columns.includes('title') || columns.includes('video')) {
      let imported = 0
      for (const record of records) {
        const title = (record['title'] ?? record['video'] ?? '').trim()
        if (!title) continue
        const viewsRaw = record['views'] ?? ''
        const views = viewsRaw === '' ? null : Number(viewsRaw)
        repos.upsertVideo({
          workspaceId,
          platform: record['platform']?.trim() || 'youtube',
          externalId: record['external_id']?.trim() || `csv-${crypto.randomUUID()}`,
          title,
          publishedAt: record['published_at']?.trim() || new Date().toISOString(),
          views: views !== null && Number.isFinite(views) ? views : null,
        })
        imported += 1
      }
      return { ok: true, kind: 'videos', imported }
    }

    return {
      ok: false,
      error: 'Unrecognized columns. Keywords need a "term"/"keyword" column; videos need "title".',
    }
  })
  ipcMain.handle(IPC.dependenciesList, () => checkDependencies())

  ipcMain.handle(
    IPC.thumbnailsAnalyze,
    (_event, payload: { path?: string; title?: string; thumbnailText?: string }) => analyzeThumbnail(payload ?? {}),
  )

  // ---- notifications & scheduler (§82) -----------------------------------
  ipcMain.handle(IPC.notificationsList, () => {
    const workspaceId = ensureWorkspace()
    const rows = getServices().repos.listNotifications(workspaceId)
    return {
      unread: getServices().repos.unreadNotificationCount(workspaceId),
      items: rows.map((row) => ({
        id: row.id,
        type: row.type,
        payload: JSON.parse(row.payload_json) as Record<string, unknown>,
        readAt: row.read_at,
        createdAt: row.created_at,
      })),
    }
  })

  ipcMain.handle(IPC.notificationsMarkRead, (_event, payload: { id: string }) => {
    getServices().repos.markNotificationRead(payload.id)
    return true
  })

  ipcMain.handle(IPC.schedulerStatus, () => getScheduler().list())
  ipcMain.handle(IPC.schedulerRun, (_event, payload: { name: string }) => getScheduler().runNow(payload.name))

  // ---- §139 background refresh interval (respected on next scheduler tick) ---
  ipcMain.handle(IPC.settingsSetRefreshInterval, (_event, payload: { ms: number }) => {
    const allowed = [0, 60, 360, 720, 1440] // manual, 1h, 6h, 12h, daily (minutes)
    if (!allowed.includes(payload?.ms ?? -1)) return { ok: false, error: 'Unsupported interval.' }
    getServices().repos.setSetting('app', 'scheduler.refreshMinutes', payload.ms)
    getScheduler().reschedule('refresh-channels', payload.ms * 60_000)
    return { ok: true }
  })

  // ---- §133 per-task provider overrides (read by the generate handler) -------
  ipcMain.handle(IPC.settingsSetTaskProvider, (_event, payload: { task: string; provider: string }) => {
    if (!payload?.task || !payload?.provider) return { ok: false, error: 'task and provider are required.' }
    const { repos } = getServices()
    const current = repos.getSetting<Record<string, string>>('app', 'router.taskOverrides') ?? {}
    if (payload.provider === 'auto') delete current[payload.task]
    else current[payload.task] = payload.provider
    repos.setSetting('app', 'router.taskOverrides', current)
    return { ok: true }
  })

  // ---- write actions (require explicit user action, §108) -----------------
  ipcMain.handle(IPC.workspacesCreate, (_event, payload: { name: string }) =>
    getServices().repos.createWorkspace(crypto.randomUUID(), payload.name),
  )

  ipcMain.handle(IPC.projectsCreate, (_event, payload: { title: string; stage?: string }) =>
    getServices().repos.createProject({
      workspaceId: ensureWorkspace(),
      title: payload.title,
      ...(payload.stage ? { stage: payload.stage } : {}),
    }),
  )

  ipcMain.handle(IPC.projectsUpdateStage, (_event, payload: { id: string; stage: string }) => {
    getServices().repos.updateProjectStage(payload.id, payload.stage)
    return true
  })

  ipcMain.handle(IPC.projectsLink, (_event, payload: { videoId: string; projectId: string | null }) => {
    getServices().repos.linkVideoToProject(payload.videoId, payload.projectId ?? null)
    return true
  })

  ipcMain.handle(IPC.projectsAutoLink, () => {
    const { repos } = getServices()
    const workspaceId = ensureWorkspace()
    const links = suggestProjectLinks(repos.listProjects(workspaceId), repos.listVideos(workspaceId, 500)).filter(
      (candidate) => candidate.confident,
    )
    for (const link of links) repos.linkVideoToProject(link.videoId, link.projectId)
    return { linked: links.length }
  })

  ipcMain.handle(IPC.calendarReschedule, (_event, payload: { id: string; scheduledAt: string | null }) => {
    getServices().repos.rescheduleCalendarItem(payload.id, payload.scheduledAt)
    return true
  })

  ipcMain.handle(
    IPC.calendarCreate,
    (_event, payload: { kind: string; title: string; scheduledAt: string | null }) =>
      getServices().repos.createCalendarItem({
        workspaceId: ensureWorkspace(),
        kind: payload.kind,
        title: payload.title,
        scheduledAt: payload.scheduledAt,
      }),
  )

  ipcMain.handle(
    IPC.commentsIngest,
    (_event, payload: { platform: string; texts: string[] }) => {
      const { repos } = getServices()
      const comments = payload.texts
        .map((body) => body.trim())
        .filter(Boolean)
        .map((body, index) => ({
          externalId: `manual-${Date.now()}-${index}`,
          author: 'imported',
          body,
          publishedAt: null,
        }))
      return repos.ingestComments({ workspaceId: ensureWorkspace(), platform: payload.platform, comments })
    },
  )

  ipcMain.handle(
    IPC.keywordsAnalyze,
    (_event, payload: { terms: string[]; demandIndex?: number | null; competitionIndex?: number | null }) => {
      const { repos } = getServices()
      const workspaceId = ensureWorkspace()
      return payload.terms.map((term) => {
        const insight = analyzeKeyword({
          term,
          demandIndex: payload.demandIndex ?? null,
          competitionIndex: payload.competitionIndex ?? null,
          source: 'locally_derived',
        })
        repos.upsertKeyword({
          workspaceId,
          term,
          intent: insight.intent,
          relativeDemand: insight.relativeDemand,
          trendIndex: payload.demandIndex ?? null,
          competitionEstimate: insight.competitionEstimate,
          opportunity: insight.opportunity,
          source: insight.source,
        })
        return insight
      })
    },
  )

  // ---- AI generation (long-running, cancellable via the job queue) --------
  ipcMain.handle(IPC.providersGenerate, async (_event, payload: GeneratePayload) => {
    const { providers, repos } = getServices()
    const { promptName, promptVersion, regenerate, ...request } = payload
    const prompt =
      promptName && typeof promptVersion === 'number'
        ? { name: promptName, version: promptVersion }
        : null
    const cache = prompt ? new AiResultCache(repos) : null

    // Serve a cached answer unless the caller explicitly asked to regenerate.
    if (cache && prompt && !regenerate) {
      const hit = cache.lookup(request, prompt)
      if (hit) {
        return {
          text: hit.text,
          providerId: hit.providerId,
          modelId: hit.modelId,
          cached: true,
          cachedAt: hit.cachedAt,
          prompt: { name: hit.promptName, version: hit.promptVersion },
          attempts: [],
        }
      }
    }

    // §133: user-configured per-task provider override wins over auto routing.
    const overrides = getServices().repos.getSetting<Record<string, string>>('app', 'router.taskOverrides') ?? {}
    const override = overrides[request.task]
    const outcome = await generateWithFallback(providers, request, {
      choice: override && providers.has(override as never) ? (override as never) : 'auto',
    })
    if (cache && prompt) cache.store(request, prompt, outcome.result)
    // Local usage counter (§86): what THIS app sent, not a provider quota.
    if (!cache || !prompt || !regenerate) recordUsage(outcome.result.providerId)
    else recordUsage(outcome.result.providerId)

    return {
      text: outcome.result.text,
      providerId: outcome.result.providerId,
      modelId: outcome.result.modelId,
      cached: false,
      cachedAt: null,
      prompt: prompt ? { name: prompt.name, version: prompt.version } : null,
      attempts: outcome.attempts.map((attempt) => ({
        providerId: attempt.providerId,
        ok: attempt.ok,
        error: attempt.error ? { code: attempt.error.code, message: attempt.error.message } : null,
      })),
    }
  })

  ipcMain.handle(IPC.aiCacheClear, () => {
    const cleared = new AiResultCache(getServices().repos).clear()
    return { cleared }
  })

  ipcMain.handle(IPC.aiUsage, () => getUsage())

  ipcMain.handle(
    IPC.aiConsensus,
    async (_event, payload: { task: string; input: string; a: string; b: string }) => {
      const { providers } = getServices()
      const request: GenerationRequest = { task: 'chat', input: payload.input ?? '' }
      return compareProviders(providers, request, [
        payload.a as Parameters<typeof compareProviders>[2][0],
        payload.b as Parameters<typeof compareProviders>[2][0],
      ])
    },
  )
}
