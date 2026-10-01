import { useState } from 'react'
import type { JSX } from 'react'
import { IPC } from '../bridge'
import { callIpc, useIpc } from '../useIpc'

interface DataInfo {
  databaseBytes: number
  integrity: { ok: boolean; results: string[] }
  counts: {
    channels: number
    videos: number
    keywords: number
    projects: number
    comments: number
    aiCacheEntries: number
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Data page (spec §78, §111).
 *
 * Everything here operates on the single local SQLite file. Backups never leave
 * the machine unless the user saves one somewhere.
 */
export function Data(): JSX.Element {
  const info = useIpc<DataInfo>(IPC.dataInfo)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function run(label: string, fn: () => Promise<void>): Promise<void> {
    setBusy(label)
    setNotice(null)
    setActionError(null)
    try {
      await fn()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : `${label} failed.`)
    } finally {
      setBusy(null)
    }
  }

  const counts = info.data?.counts

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Data</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
          Your analytics, research and reports live in one local database file. This page is the only
          place data is moved in or out, and it always asks first.
        </p>
      </header>

      {notice && <p className="text-[12px] text-[var(--color-positive)]">{notice}</p>}
      {actionError && <p className="text-[12px] text-[var(--color-danger)]">{actionError}</p>}

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Local database</h2>
          <button
            type="button"
            onClick={info.reload}
            className="text-[12px] text-[var(--color-accent)] underline-offset-2 hover:underline"
          >
            ↻ Refresh
          </button>
        </div>
        {info.loading && <p className="mt-2 text-[13px] text-[var(--color-text-secondary)]">Reading…</p>}
        {info.error && <p className="mt-2 text-[13px] text-[var(--color-danger)]">{info.error}</p>}
        {info.data && (
          <>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-md bg-[var(--color-surface-2)] p-3">
                <div className="text-[16px] font-semibold tabular-nums">{formatBytes(info.data.databaseBytes)}</div>
                <div className="text-[11px] text-[var(--color-text-muted)]">file size</div>
              </div>
              <div className="rounded-md bg-[var(--color-surface-2)] p-3">
                <div className="text-[16px] font-semibold tabular-nums">{counts?.videos ?? 0}</div>
                <div className="text-[11px] text-[var(--color-text-muted)]">videos</div>
              </div>
              <div className="rounded-md bg-[var(--color-surface-2)] p-3">
                <div className="text-[16px] font-semibold tabular-nums">{counts?.channels ?? 0}</div>
                <div className="text-[11px] text-[var(--color-text-muted)]">channels</div>
              </div>
              <div className="rounded-md bg-[var(--color-surface-2)] p-3">
                <div className="text-[16px] font-semibold tabular-nums">{counts?.keywords ?? 0}</div>
                <div className="text-[11px] text-[var(--color-text-muted)]">keywords</div>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
              Integrity check: {info.data.integrity.ok ? 'ok' : info.data.integrity.results.join(', ')} · projects{' '}
              {counts?.projects ?? 0} · comments {counts?.comments ?? 0} · AI cache entries{' '}
              {counts?.aiCacheEntries ?? 0}
            </p>
          </>
        )}
      </section>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <h2 className="text-sm font-semibold">Backup &amp; restore</h2>
        <p className="mt-1 text-[12px] text-[var(--color-text-secondary)]">
          A backup is a copy of the local database file. Restoring replaces your current data.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              void run('Backup', async () => {
                const result = await callIpc<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>(
                  IPC.dataExport,
                )
                if (result.ok) setNotice(`Backup saved to ${result.path}.`)
                else if (!result.canceled) setActionError(result.error ?? 'Backup failed.')
              })
            }
            disabled={busy !== null}
            className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[#0b0d10] disabled:opacity-40"
          >
            {busy === 'Backup' ? 'Backing up…' : 'Back up now'}
          </button>
          <button
            type="button"
            onClick={() =>
              void run('Restore', async () => {
                const result = await callIpc<{ ok: boolean; canceled?: boolean; error?: string }>(IPC.dataImport)
                if (result.ok) {
                  setNotice('Restored. The app is now using the restored database.')
                  info.reload()
                } else if (!result.canceled) setActionError(result.error ?? 'Restore failed.')
              })
            }
            disabled={busy !== null}
            className="rounded-md border border-[var(--color-border-subtle)] px-4 py-2 text-[13px] disabled:opacity-40"
          >
            Restore from backup…
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <h2 className="text-sm font-semibold">Import CSV</h2>
        <p className="mt-1 text-[12px] text-[var(--color-text-secondary)]">
          Keywords: needs a <code>term</code> (or <code>keyword</code>) column, optional{' '}
          <code>demand</code>/<code>competition</code> indices. Videos: needs <code>title</code>,
          optional <code>views</code>, <code>published_at</code>, <code>platform</code>. Rows are
          merged by term/title — importing twice will not duplicate.
        </p>
        <button
          type="button"
          onClick={() =>
            void run('Import CSV', async () => {
              const result = await callIpc<{ ok: boolean; canceled?: boolean; kind?: string; imported?: number; error?: string }>(
                IPC.dataImportCsv,
              )
              if (result.ok) {
                setNotice(`Imported ${result.imported ?? 0} ${result.kind ?? 'row(s)'} from CSV.`)
                info.reload()
              } else if (!result.canceled) {
                setActionError(result.error ?? 'Import failed.')
              }
            })
          }
          disabled={busy !== null}
          className="mt-2 rounded-md border border-[var(--color-border-subtle)] px-4 py-2 text-[13px] disabled:opacity-40"
        >
          {busy === 'Import CSV' ? 'Importing…' : 'Import CSV…'}
        </button>
      </section>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <h2 className="text-sm font-semibold">Maintenance</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              void run('Vacuum', async () => {
                const result = await callIpc<{ ok: boolean; error?: string }>(IPC.dataVacuum)
                if (result.ok) {
                  setNotice('Database compacted.')
                  info.reload()
                } else setActionError(result.error ?? 'Vacuum failed.')
              })
            }
            disabled={busy !== null}
            className="rounded-md border border-[var(--color-border-subtle)] px-4 py-2 text-[13px] disabled:opacity-40"
          >
            {busy === 'Vacuum' ? 'Compacting…' : 'Compact database'}
          </button>
          <button
            type="button"
            onClick={() =>
              void run('Clear AI cache', async () => {
                const result = await callIpc<{ cleared: number }>(IPC.aiCacheClear)
                setNotice(`Cleared ${result.cleared} cached AI result(s).`)
                info.reload()
              })
            }
            disabled={busy !== null}
            className="rounded-md border border-[var(--color-border-subtle)] px-4 py-2 text-[13px] disabled:opacity-40"
          >
            {busy === 'Clear AI cache' ? 'Clearing…' : 'Clear AI result cache'}
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <h2 className="text-sm font-semibold">Your data, your control</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              void run('Delete profile', async () => {
                await callIpc(IPC.profileDelete)
                setNotice('Creator profile deleted.')
              })
            }
            disabled={busy !== null}
            className="rounded-md border border-[var(--color-border-subtle)] px-4 py-2 text-[13px] disabled:opacity-40"
          >
            {busy === 'Delete profile' ? 'Deleting…' : 'Delete creator profile'}
          </button>
          <button
            type="button"
            onClick={() => {
              // A real reset is destructive and must never be a single click.
              const confirmed = window.confirm(
                'Reset the application? This deletes ALL local analytics, research, projects and stored credentials. Platforms will need reconnecting. This cannot be undone.',
              )
              if (!confirmed) return
              void run('Reset app', async () => {
                const result = await callIpc<{ ok: boolean }>(IPC.dataReset)
                if (result.ok) {
                  setNotice('Application data reset. Restart the app to start fresh.')
                  info.reload()
                }
              })
            }}
            disabled={busy !== null}
            className="rounded-md border border-[var(--color-danger)] px-4 py-2 text-[13px] text-[var(--color-danger)] disabled:opacity-40"
          >
            {busy === 'Reset app' ? 'Resetting…' : 'Reset application…'}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
          Deleting the profile removes your niche/topics/goals from AI briefings. Resetting removes
          all local data and stored sign-ins — back up first if you might want them.
        </p>
      </section>
    </div>
  )
}
