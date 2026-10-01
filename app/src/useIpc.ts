import { useCallback, useEffect, useState } from 'react'
import { getBridge } from './bridge'

/** Invokes an IPC handler, or rejects when running outside Electron. */
export function callIpc<T>(channel: string, payload?: unknown): Promise<T> {
  const bridge = getBridge()
  if (!bridge) return Promise.reject(new Error('Desktop bridge unavailable (running outside Electron).'))
  return bridge.invoke<T>(channel, payload)
}

export interface IpcState<T> {
  data: T | null
  error: string | null
  loading: boolean
  reload: () => void
}

/**
 * Reads an IPC channel on mount and exposes a reload. Re-runs when the channel
 * or the serialized payload changes (so callers can pass stable object literals).
 */
export function useIpc<T>(channel: string, payload?: unknown): IpcState<T> {
  // Bridge availability is derived once, so no state is set inside the effect.
  const bridgeAvailable = getBridge() !== null
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(() =>
    bridgeAvailable ? null : 'Desktop bridge unavailable — this view needs the desktop app.',
  )
  const [loading, setLoading] = useState(bridgeAvailable)
  const [nonce, setNonce] = useState(0)
  const serializedPayload = JSON.stringify(payload ?? null)

  useEffect(() => {
    const bridge = getBridge()
    if (!bridge) return
    let cancelled = false
    // Loading is toggled by `reload()` and the promise handlers, not here.
    bridge
      .invoke<T>(channel, JSON.parse(serializedPayload) as unknown)
      .then((value) => {
        if (!cancelled) {
          setData(value)
          setError(null)
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Request failed')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [channel, serializedPayload, nonce])

  const reload = useCallback(() => {
    setLoading(true)
    setNonce((n) => n + 1)
  }, [])
  return { data, error, loading, reload }
}
