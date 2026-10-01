import { BrowserWindow, dialog } from 'electron'
import { writeFileSync } from 'node:fs'

/**
 * Saving exports (spec §69, §128).
 *
 * The report *content* is built by the pure `export/reports.ts` module; this
 * wrapper only owns the OS save dialog and the write. Nothing leaves the machine
 * unless the user picks a destination.
 */
export { buildMonthlyReview } from '../export/reports'

export interface SaveTextResult {
  ok: boolean
  canceled?: boolean
  path?: string
  error?: string
}

export async function saveTextFile(input: { defaultName: string; content: string }): Promise<SaveTextResult> {
  const filters = input.defaultName.endsWith('.csv')
    ? [{ name: 'CSV', extensions: ['csv'] }]
    : [{ name: 'Markdown', extensions: ['md'] }]

  const window = BrowserWindow.getFocusedWindow()
  const options = { title: 'Save export', defaultPath: input.defaultName, filters }
  const result = window
    ? await dialog.showSaveDialog(window, options)
    : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return { ok: false, canceled: true }

  try {
    writeFileSync(result.filePath, input.content, 'utf8')
    return { ok: true, path: result.filePath }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not write the file.' }
  }
}

