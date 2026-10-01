export interface ProviderHealthView {
  available: boolean
  authenticated: boolean
  detail: string
  checkedAt: string
}

export interface ProviderHealthEntry {
  id: string
  displayName: string
  health: ProviderHealthView
}

export interface AppInfo {
  version: string
  platform: string
  electron: string
  node: string
}

export interface CgsBridge {
  readonly platform: string
  readonly versions: { electron: string; chrome: string; node: string }
  invoke<T>(channel: string, payload?: unknown): Promise<T>
}

declare global {
  interface Window {
    cgs?: CgsBridge
  }
}

/**
 * Returns the Electron IPC bridge, or null when the renderer runs in a plain
 * browser (e.g. `vite dev` without Electron). Callers must handle null and fall
 * back to local-only behaviour rather than failing.
 */
export function getBridge(): CgsBridge | null {
  return typeof window === 'undefined' ? null : (window.cgs ?? null)
}

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
  logsList: 'logs:list',
  logsDiagnostics: 'logs:diagnostics',
  acceptanceRun: 'acceptance:run',
  logsSetLevel: 'logs:setLevel',
  settingsSetRefreshInterval: 'settings:setRefreshInterval',
  settingsSetTaskProvider: 'settings:setTaskProvider',
  settingsGetTaskOverrides: 'settings:getTaskOverrides',
  dataImportCsv: 'data:importCsv',
  aiUsage: 'ai:usage',
  aiConsensus: 'ai:consensus',
} as const
