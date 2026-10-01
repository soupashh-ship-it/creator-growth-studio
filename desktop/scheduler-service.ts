import { Notification } from 'electron'
import { Scheduler } from '../jobs/scheduler'
import { syncPlatform } from './platform-service'
import { getServices } from './services'

/**
 * Background work (spec §82, §137).
 *
 * Only syncs platforms the user has actually connected — an unconfigured app
 * does nothing on a timer. Results are recorded as local notifications so the
 * user can see what changed without watching the app.
 */
let scheduler: Scheduler | null = null

const REFRESH_INTERVAL_MS = 30 * 60 * 1000
const NOTIFICATION_TTL_DAYS = 30

function notify(title: string, body: string): void {
  try {
    if (Notification.isSupported()) new Notification({ title, body }).show()
  } catch {
    // A missing notification backend must never break the scheduled work.
  }
}

/**
 * §120: per-type notification preference. A type the user disabled is neither
 * recorded nor toasted. Unknown types default to enabled.
 */
function typeEnabled(_workspaceId: string, type: string): boolean {
  try {
    const disabled = getServices().repos.getSetting<string[]>('app', 'notifications.disabledTypes') ?? []
    return !Array.isArray(disabled) || !disabled.includes(type)
  } catch {
    return true
  }
}

export async function refreshConnectedChannels(): Promise<void> {
  const { repos } = getServices()
  for (const workspace of repos.listWorkspaces()) {
    for (const connection of repos.listPlatformConnections(workspace.id)) {
      if (connection.status !== 'connected') continue
      const platform = connection.platform === 'youtube' || connection.platform === 'twitch' ? connection.platform : null
      if (!platform) continue

      const result = await syncPlatform(platform, workspace.id)
      if (!result.ok) continue

      if ((result.videosUpserted ?? 0) > 0) {
        if (typeEnabled(workspace.id, 'sync')) {
          repos.createNotification({
            workspaceId: workspace.id,
            type: 'sync',
            payload: { platform, videos: result.videosUpserted, channel: result.channelTitle ?? null },
          })
          notify(
            `${platform === 'youtube' ? 'YouTube' : 'Twitch'} refreshed`,
            `${result.videosUpserted} item(s) updated for ${result.channelTitle ?? workspace.name}.`,
          )
        }
      }
    }
  }
}

export function pruneNotifications(): void {
  getServices().repos.pruneNotifications(NOTIFICATION_TTL_DAYS)
}

/** Lazily builds and registers the scheduler. It is started only after ready. */
export function getScheduler(): Scheduler {
  if (scheduler) return scheduler
  scheduler = new Scheduler()
  scheduler.register({ name: 'refresh-channels', intervalMs: REFRESH_INTERVAL_MS, run: refreshConnectedChannels })
  scheduler.register({ name: 'prune-notifications', intervalMs: 24 * 60 * 60 * 1000, run: async () => pruneNotifications() })
  // §139: honor a user-chosen background refresh interval when one is stored.
  try {
    const minutes = getServices().repos.getSetting<number>('app', 'scheduler.refreshMinutes')
    if (typeof minutes === 'number' && minutes > 0) {
      scheduler.reschedule('refresh-channels', minutes * 60_000)
    } else if (minutes === 0) {
      scheduler.unregister('refresh-channels')
    }
  } catch {
    // Settings being unreadable must not prevent the default schedule.
  }
  return scheduler
}

export function startScheduler(): void {
  getScheduler().start()
}

export function stopScheduler(): void {
  scheduler?.stop()
}
