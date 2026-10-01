/**
 * Small JSON fetch helper with timeouts and typed errors.
 *
 * Kept dependency-free so both the main process and tests can use it.
 */
import { ProviderError, type ProviderId } from './types'

export interface FetchJsonOptions {
  timeoutMs?: number
  signal?: AbortSignal
  headers?: Record<string, string>
  method?: string
  body?: unknown
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

/** Combines an optional external signal with a timeout signal. */
function withTimeout(timeoutMs: number, signal?: AbortSignal): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs)
  const onAbort = (): void => controller.abort(signal?.reason)
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason)
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  return {
    signal: controller.signal,
    cancel: () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    },
  }
}

export async function fetchJson<T>(
  url: string,
  providerId: ProviderId,
  options: FetchJsonOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 30_000
  const { signal, cancel } = withTimeout(timeoutMs, options.signal)
  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        ...(options.headers ?? {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      if (response.status === 429) {
        throw new ProviderError('rate_limited', providerId, `${providerId} rate limited the request.`, detail)
      }
      if (response.status === 401 || response.status === 403) {
        throw new ProviderError('auth_expired', providerId, `${providerId} rejected the credentials.`, detail)
      }
      throw new ProviderError('unavailable', providerId, `${providerId} returned HTTP ${response.status}.`, detail)
    }

    return (await response.json()) as T
  } catch (error) {
    if (error instanceof ProviderError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ProviderError('cancelled', providerId, 'The request was cancelled or timed out.')
    }
    throw new ProviderError(
      'offline',
      providerId,
      `Could not reach ${providerId}. It may not be running or the network is unavailable.`,
      error instanceof Error ? error.message : String(error),
    )
  } finally {
    cancel()
  }
}

/** Pings a URL to detect a local service without throwing. */
export async function probe(url: string, timeoutMs = 1500): Promise<boolean> {
  const { signal, cancel } = withTimeout(timeoutMs)
  try {
    const response = await fetch(url, { signal })
    return response.ok
  } catch {
    return false
  } finally {
    cancel()
  }
}
