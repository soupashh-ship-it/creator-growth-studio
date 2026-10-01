import { useState } from 'react'
import type { JSX } from 'react'
import { IPC } from '../bridge'
import { callIpc, useIpc } from '../useIpc'

interface NotificationItem {
  id: string
  type: string
  payload: Record<string, unknown>
  readAt: string | null
  createdAt: string
}

interface NotificationList {
  unread: number
  items: NotificationItem[]
}

function describe(item: NotificationItem): string {
  const platform = typeof item.payload['platform'] === 'string' ? (item.payload['platform'] as string) : null
  const videos = typeof item.payload['videos'] === 'number' ? (item.payload['videos'] as number) : null
  if (item.type === 'sync' && platform && videos !== null) {
    return `${platform} refreshed — ${videos} item(s) updated.`
  }
  return item.type
}

/**
 * Notification bell (spec §82). Reads real notifications written by the
 * background scheduler; there are no placeholder alerts.
 */
export function NotificationBell(): JSX.Element {
  const { data, reload } = useIpc<NotificationList>(IPC.notificationsList)
  const [open, setOpen] = useState(false)

  const unread = data?.unread ?? 0

  async function markRead(id: string): Promise<void> {
    await callIpc(IPC.notificationsMarkRead, { id })
    reload()
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[13px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"
        aria-expanded={open}
      >
        <span>🔔 Notifications</span>
        {unread > 0 && (
          <span className="rounded-full bg-[var(--color-accent)] px-1.5 text-[10px] font-semibold text-[#0b0d10]">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="mt-1 max-h-72 overflow-y-auto rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] p-2">
          {(data?.items.length ?? 0) === 0 && (
            <p className="px-2 py-1 text-[12px] text-[var(--color-text-muted)]">No notifications yet.</p>
          )}
          {(data?.items ?? []).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => void markRead(item.id)}
              className="block w-full rounded px-2 py-1.5 text-left text-[12px] hover:bg-[var(--color-surface-1)]"
            >
              <span className={item.readAt ? 'text-[var(--color-text-muted)]' : ''}>{describe(item)}</span>
              <span className="block text-[10px] text-[var(--color-text-muted)]">
                {new Date(item.createdAt).toLocaleString()}
                {item.readAt ? ' · read' : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
