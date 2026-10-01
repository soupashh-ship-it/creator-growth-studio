import { contextBridge, ipcRenderer } from 'electron'

/**
 * Typed, minimal bridge (spec §2, §108).
 *
 * The renderer never receives raw tokens or the database handle — only
 * serialized, non-secret view models. Real commands are registered in
 * `desktop/ipc.ts` as each feature slice lands.
 */
export interface CgsBridge {
  readonly platform: NodeJS.Platform
  readonly versions: { electron: string; chrome: string; node: string }
  invoke<T = unknown>(channel: string, payload?: unknown): Promise<T>
}

const bridge: CgsBridge = {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  invoke: <T>(channel: string, payload?: unknown): Promise<T> =>
    ipcRenderer.invoke(channel, payload) as Promise<T>,
}

contextBridge.exposeInMainWorld('cgs', bridge)
