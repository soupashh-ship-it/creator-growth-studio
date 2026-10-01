import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { AuthError } from './errors'

export interface CallbackResult {
  code: string
  state: string | null
}

export interface LoopbackServer {
  /** Exact redirect URI to register and send to the provider. */
  redirectUri: string
  /** Resolves with the code, or rejects with a typed AuthError. */
  waitForCallback(): Promise<CallbackResult>
  close(): Promise<void>
}

export interface LoopbackOptions {
  expectedState: string
  path?: string
  timeoutMs?: number
  hostname?: string
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Starts a single-purpose loopback HTTP server on an ephemeral port.
 *
 * This is the officially recommended redirect method for desktop OAuth
 * (docs/INTEGRATION_AUDIT.md §4, §6). It validates `state`, surfaces provider
 * errors, and times out so a cancelled login never hangs the app (spec §81, §91).
 */
export function startLoopbackServer(options: LoopbackOptions): Promise<LoopbackServer> {
  const hostname = options.hostname ?? '127.0.0.1'
  const path = options.path ?? '/callback'
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  return new Promise<LoopbackServer>((resolveServer, rejectServer) => {
    let resolveCallback!: (value: CallbackResult) => void
    let rejectCallback!: (reason: unknown) => void
    let settled = false

    const result = new Promise<CallbackResult>((res, rej) => {
      resolveCallback = res
      rejectCallback = rej
    })
    // Prevent an unhandled rejection if the caller awaits later.
    void result.catch(() => undefined)

    const settleWithError = (error: AuthError): void => {
      if (settled) return
      settled = true
      rejectCallback(error)
    }

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (!req.url) {
        res.writeHead(400)
        res.end('Bad request')
        return
      }

      const url = new URL(req.url, `http://${hostname}`)
      if (url.pathname !== path) {
        res.writeHead(404, { 'content-type': 'text/plain' })
        res.end('Not found')
        return
      }

      const providerError = url.searchParams.get('error')
      if (providerError) {
        res.writeHead(200, { 'content-type': 'text/plain' })
        res.end('Authorization was not completed. You may close this window.')
        settleWithError(
          new AuthError(
            providerError === 'access_denied' ? 'cancelled' : 'provider_error',
            `The provider rejected the request (${providerError}).`,
            url.searchParams.get('error_description') ?? undefined,
          ),
        )
        return
      }

      const state = url.searchParams.get('state')
      if (state !== options.expectedState) {
        res.writeHead(400, { 'content-type': 'text/plain' })
        res.end('State mismatch. This request was rejected.')
        settleWithError(
          new AuthError('state_mismatch', 'OAuth state did not match; request rejected.'),
        )
        return
      }

      const code = url.searchParams.get('code')
      if (!code) {
        res.writeHead(400, { 'content-type': 'text/plain' })
        res.end('Missing authorization code.')
        settleWithError(new AuthError('missing_code', 'No authorization code in callback.'))
        return
      }

      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('Authorization complete. You may close this window and return to the app.')
      if (!settled) {
        settled = true
        resolveCallback({ code, state })
      }
    })

    server.on('error', rejectServer)

    server.listen(0, hostname, () => {
      const address = server.address() as AddressInfo
      const redirectUri = `http://${hostname}:${address.port}${path}`

      const timer = setTimeout(() => {
        settleWithError(new AuthError('timeout', 'Timed out waiting for the OAuth callback.'))
      }, timeoutMs)

      resolveServer({
        redirectUri,
        waitForCallback: () => result.finally(() => clearTimeout(timer)),
        close: () =>
          new Promise<void>((resolveClose) => {
            clearTimeout(timer)
            server.close(() => resolveClose())
          }),
      })
    })
  })
}
