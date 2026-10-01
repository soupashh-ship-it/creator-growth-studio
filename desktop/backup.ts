import { app, BrowserWindow, dialog } from 'electron'
import { copyFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { closeServices, getServices } from './services'

/**
 * Local data maintenance (spec §78, §111).
 *
 * The database is a single SQLite file, so a backup is a file copy. Nothing is
 * uploaded anywhere; the user chooses the destination with the OS dialog.
 */
export function databasePath(): string {
  return join(app.getPath('userData'), 'data', 'creators.db')
}

export function databaseSizeBytes(): number {
  const path = databasePath()
  return existsSync(path) ? statSync(path).size : 0
}

export interface BackupResult {
  ok: boolean
  canceled?: boolean
  path?: string
  error?: string
}

export async function exportBackup(): Promise<BackupResult> {
  const path = databasePath()
  if (!existsSync(path)) return { ok: false, error: 'There is no database to back up yet.' }

  const window = BrowserWindow.getFocusedWindow()
  const stamp = new Date().toISOString().slice(0, 10)
  const result = window
    ? await dialog.showSaveDialog(window, {
        title: 'Back up Creator Growth Studio data',
        defaultPath: `creator-growth-studio-${stamp}.db`,
        filters: [{ name: 'SQLite database', extensions: ['db'] }],
      })
    : await dialog.showSaveDialog({
        title: 'Back up Creator Growth Studio data',
        defaultPath: `creator-growth-studio-${stamp}.db`,
        filters: [{ name: 'SQLite database', extensions: ['db'] }],
      })

  if (result.canceled || !result.filePath) return { ok: false, canceled: true }

  try {
    // Checkpoint so the copy includes everything written through the WAL.
    getServices().db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    copyFileSync(path, result.filePath)
    return { ok: true, path: result.filePath }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Backup failed.' }
  }
}

export interface RestoreResult {
  ok: boolean
  canceled?: boolean
  error?: string
}

/**
 * Restores a previously exported database. The current file is replaced and the
 * connection is reopened against the restored data.
 */
export async function importBackup(): Promise<RestoreResult> {
  const window = BrowserWindow.getFocusedWindow()
  const result = window
    ? await dialog.showOpenDialog(window, {
        title: 'Restore from a backup',
        properties: ['openFile'],
        filters: [{ name: 'SQLite database', extensions: ['db'] }],
      })
    : await dialog.showOpenDialog({
        title: 'Restore from a backup',
        properties: ['openFile'],
        filters: [{ name: 'SQLite database', extensions: ['db'] }],
      })

  if (result.canceled || result.filePaths.length === 0) return { ok: false, canceled: true }
  const source = result.filePaths[0]
  if (!source) return { ok: false, canceled: true }

  const confirm = window
    ? await dialog.showMessageBox(window, {
        type: 'warning',
        buttons: ['Replace and restore', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        message: 'Replace all local data with the selected backup?',
        detail: 'Your current local database will be overwritten. This cannot be undone.',
      })
    : await dialog.showMessageBox({
        type: 'warning',
        buttons: ['Replace and restore', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        message: 'Replace all local data with the selected backup?',
      })
  if (confirm.response !== 0) return { ok: false, canceled: true }

  try {
    closeServices()
    copyFileSync(source, databasePath())
    // Reopen against the restored file so the app keeps working without a restart.
    getServices()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Restore failed.' }
  }
}

export function integrityCheck(): { ok: boolean; results: string[] } {
  try {
    const rows = getServices().db.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check: string }>
    const results = rows.map((row) => row.integrity_check)
    return { ok: results.length === 1 && results[0] === 'ok', results }
  } catch (error) {
    return { ok: false, results: [error instanceof Error ? error.message : 'Integrity check failed.'] }
  }
}

export function vacuum(): { ok: boolean; error?: string } {
  try {
    getServices().db.exec('VACUUM')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Vacuum failed.' }
  }
}
