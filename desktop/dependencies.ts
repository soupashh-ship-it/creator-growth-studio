import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import { join } from 'node:path'

/**
 * Dependency checker (spec §112).
 *
 * Reports what is actually present on this machine. Optional tools are marked
 * optional; nothing is downloaded or installed automatically.
 */
export interface DependencyStatus {
  id: string
  label: string
  required: boolean
  present: boolean
  version: string | null
  detail: string
  /** Where the user can read about installing it. */
  hint?: string
}

function probeBinary(command: string, versionArgs: string[]): { present: boolean; version: string | null } {
  try {
    const result = spawnSync(command, versionArgs, { encoding: 'utf8', timeout: 4000, shell: process.platform === 'win32' })
    if (result.error || result.status !== 0) return { present: false, version: null }
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().split('\n')[0] ?? null
    return { present: true, version: output && output.length > 0 ? output.slice(0, 80) : null }
  } catch {
    return { present: false, version: null }
  }
}

/** Checks whether an npm package is installed next to the app. */
function probeInstalledModule(name: string): { present: boolean; version: string | null } {
  try {
    const pkgPath = join(process.cwd(), 'node_modules', name, 'package.json')
    if (!existsSync(pkgPath)) return { present: false, version: null }
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string }
    return { present: true, version: pkg.version ?? null }
  } catch {
    return { present: false, version: null }
  }
}

function probePort(port: number, timeoutMs = 700): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    const finish = (value: boolean): void => {
      socket.destroy()
      resolve(value)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

export async function checkDependencies(): Promise<DependencyStatus[]> {
  const gemini = probeBinary('gemini', ['--version'])
  const ollama = probeBinary('ollama', ['--version'])
  const ffmpeg = probeBinary('ffmpeg', ['-version'])
  const siwc = probeInstalledModule('@siwc/local')
  const obsPortOpen = await probePort(4455)

  return [
    {
      id: 'node',
      label: 'Node.js runtime',
      required: true,
      present: true,
      version: process.versions.node,
      detail: 'Bundled with the desktop shell.',
    },
    {
      id: 'electron',
      label: 'Electron shell',
      required: true,
      present: Boolean(process.versions.electron),
      version: process.versions.electron ?? null,
      detail: 'Desktop runtime for the app.',
    },
    {
      id: 'gemini-cli',
      label: 'Gemini CLI',
      required: false,
      present: gemini.present,
      version: gemini.version,
      detail: gemini.present
        ? 'Found on PATH. Sign in once with your Google account to use the Gemini provider.'
        : 'Not found on PATH. Install it and sign in with Google to use Gemini (no API key needed).',
      hint: 'npm install -g @google/gemini-cli',
    },
    {
      id: 'ollama',
      label: 'Ollama (local models)',
      required: false,
      present: ollama.present,
      version: ollama.version,
      detail: ollama.present
        ? 'Found on PATH. Local models run entirely on this machine.'
        : 'Not found on PATH. Optional — install it to run models fully offline.',
      hint: 'https://ollama.com/download',
    },
    {
      id: 'ffmpeg',
      label: 'FFmpeg (local clip export)',
      required: false,
      present: ffmpeg.present,
      version: ffmpeg.version,
      detail: ffmpeg.present
        ? 'Found on PATH. Shorts and clip plans can be exported to local video files.'
        : 'Not found on PATH. Optional — install it to export clips locally (nothing is uploaded).',
      hint: 'https://ffmpeg.org/download.html',
    },
    {
      id: 'siwc-local',
      label: 'ChatGPT sign-in SDK (@siwc/local)',
      required: false,
      present: siwc.present,
      version: siwc.version,
      detail: siwc.present
        ? 'Installed. The ChatGPT provider can sign in with your plan (no API key).'
        : 'Not installed. Optional — this is OpenAI’s official open-source sign-in SDK. Install it to use ChatGPT plan usage; the app never falls back to a paid API key.',
      hint: 'npm install @siwc/local',
    },
    {
      id: 'obs-websocket',
      label: 'OBS WebSocket (port 4455)',
      required: false,
      present: obsPortOpen,
      version: null,
      detail: obsPortOpen
        ? 'A WebSocket listener is reachable on 127.0.0.1:4455.'
        : 'No listener on 127.0.0.1:4455. Enable the WebSocket server in OBS Studio 28+ to use Stream Health.',
    },
  ]
}
