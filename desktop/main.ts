import { app, BrowserWindow, nativeImage } from 'electron'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerIpcHandlers } from './ipc'
import { startScheduler, stopScheduler } from './scheduler-service'
import { closeServices } from './services'
import { analyzeThumbnailFile } from './thumbnail-service'

const currentDir = dirname(fileURLToPath(import.meta.url))

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b0d10',
    title: 'Creator Growth Studio',
    webPreferences: {
      preload: join(currentDir, '../preload/preload.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Avoid white flash before the renderer has painted (spec §101 UX).
  window.on('ready-to-show', () => {
    window.show()
    // Enables an automated launch check (spec §153) without leaving a window open.
    if (process.argv.includes('--smoke-test')) {
      console.log('[smoke] renderer ready')
      runThumbnailSmokeCheck()
      setTimeout(() => app.quit(), 800)
    }
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    void window.loadURL(rendererUrl)
  } else {
    void window.loadFile(join(currentDir, '../renderer/index.html'))
  }
}

/**
 * Verifies the real image-decode + analysis path inside Electron: builds a
 * synthetic thumbnail, encodes it as PNG, decodes it back through `nativeImage`
 * and scores it. Prints one summary line so a packaged build can be checked.
 */
function runThumbnailSmokeCheck(): void {
  try {
    const width = 64
    const height = 64
    const buffer = Buffer.alloc(width * height * 4)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4
        const inCenter = x >= 16 && x <= 48 && y >= 13 && y <= 51
        // BGRA: yellow subject on a dark blue background.
        buffer[i] = inCenter ? 0 : 120
        buffer[i + 1] = inCenter ? 220 : 0
        buffer[i + 2] = inCenter ? 255 : 0
        buffer[i + 3] = 255
      }
    }
    const png = nativeImage.createFromBuffer(buffer, { width, height }).toPNG()
    const pngPath = join(app.getPath('temp'), 'cgs-smoke-thumbnail.png')
    writeFileSync(pngPath, png)
    const analysis = analyzeThumbnailFile(pngPath)
    if (analysis.ok && analysis.score && analysis.score.score !== null) {
      console.log(`[smoke] thumbnail decode+score ok (score=${analysis.score.score})`)
    } else {
      console.log(`[smoke] thumbnail check failed: ${analysis.error ?? 'no score computed'}`)
    }
  } catch (error) {
    console.log(`[smoke] thumbnail check error: ${error instanceof Error ? error.message : String(error)}`)
  }
}

void app.whenReady().then(() => {
  registerIpcHandlers()
  // Background refresh only touches platforms the user has connected; it is
  // harmless (and idle) on a fresh install.
  startScheduler()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopScheduler()
  closeServices()
})
