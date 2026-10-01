import { useState } from 'react'
import type { JSX } from 'react'
import { getBridge, IPC, type ProviderHealthEntry } from '../bridge'
import { callIpc, useIpc } from '../useIpc'

interface PlatformSummary {
  id: 'youtube' | 'twitch'
  displayName: string
  capabilities: { platform: string; capabilities: string[]; requiresConnection: string[] }
  configured: boolean
  connected: boolean
  authenticated: boolean
  detail: string
  checkedAt: string
  requiredConfig: Array<{ key: string; label: string; secret: boolean }>
  authKind: 'loopback-browser' | 'device-code' | 'unsupported'
}

interface ConnectResult {
  ok: boolean
  pending?: boolean
  userCode?: string
  verificationUri?: string
  deviceCode?: string
  accountLabel?: string
  error?: string
}

const input =
  'w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-accent)]'

function Badge({ ok, text }: { ok: boolean; text: string }) {
  const color = ok ? 'var(--color-positive)' : 'var(--color-warning)'
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color }}>
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {text}
    </span>
  )
}

/**
 * Connection Center (spec §8, §9, §73, §145).
 *
 * Surfaces real account state that each provider's own API exposes — never an
 * inferred subscription tier. Platform credentials are stored in OS-encrypted
 * storage; the UI never receives them back.
 */
export function Connections(): JSX.Element {
  const platforms = useIpc<PlatformSummary[]>(IPC.platformsList)
  const providers = useIpc<ProviderHealthEntry[]>(IPC.providersHealth)

  const [configs, setConfigs] = useState<Record<string, { clientId: string; clientSecret: string }>>({})
  const [device, setDevice] = useState<Record<string, ConnectResult>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  function configFor(id: string): { clientId: string; clientSecret: string } {
    return configs[id] ?? { clientId: '', clientSecret: '' }
  }

  async function saveConfig(id: string): Promise<void> {
    const config = configFor(id)
    if (!config.clientId.trim()) return
    setBusy(`config:${id}`)
    setActionError(null)
    try {
      const result = await callIpc<{ ok: boolean; error?: string }>(IPC.platformsConfigure, {
        platform: id,
        clientId: config.clientId.trim(),
        clientSecret: config.clientSecret.trim() || undefined,
      })
      if (!result.ok) setActionError(result.error ?? 'Could not save the client id.')
      else {
        setNotice(`${id === 'youtube' ? 'YouTube' : 'Twitch'} client id saved to encrypted storage.`)
        platforms.reload()
      }
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not save the client id.')
    } finally {
      setBusy(null)
    }
  }

  async function connect(id: 'youtube' | 'twitch'): Promise<void> {
    setBusy(`connect:${id}`)
    setActionError(null)
    setNotice(null)
    try {
      const result = await callIpc<ConnectResult>(IPC.platformsConnect, { platform: id })
      if (result.pending && result.deviceCode) {
        setDevice((prev) => ({ ...prev, [id]: result }))
        setNotice(`Enter code ${result.userCode ?? ''} at ${result.verificationUri ?? ''}, then confirm below.`)
      } else if (result.ok) {
        setNotice(result.accountLabel ?? 'Connected.')
        platforms.reload()
      } else if (result.error) {
        setActionError(result.error)
      }
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Sign-in failed.')
    } finally {
      setBusy(null)
    }
  }

  async function complete(id: 'youtube' | 'twitch'): Promise<void> {
    const pending = device[id]
    if (!pending?.deviceCode) return
    setBusy(`complete:${id}`)
    setActionError(null)
    try {
      const result = await callIpc<ConnectResult>(IPC.platformsComplete, {
        platform: id,
        deviceCode: pending.deviceCode,
      })
      if (result.ok) {
        setDevice((prev) => {
          const next = { ...prev }
          delete next[id]
          return next
        })
        setNotice(result.accountLabel ?? 'Connected.')
        platforms.reload()
      } else {
        setActionError(result.error ?? 'Authorization was not completed.')
      }
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Authorization failed.')
    } finally {
      setBusy(null)
    }
  }

  async function disconnect(id: 'youtube' | 'twitch'): Promise<void> {
    setBusy(`disconnect:${id}`)
    try {
      await callIpc(IPC.platformsDisconnect, { platform: id })
      setNotice('Disconnected. Stored analytics remain on this computer.')
      platforms.reload()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not disconnect.')
    } finally {
      setBusy(null)
    }
  }

  async function sync(id: 'youtube' | 'twitch'): Promise<void> {
    setBusy(`sync:${id}`)
    setActionError(null)
    try {
      const result = await callIpc<{ ok: boolean; channelTitle?: string; videosUpserted?: number; error?: string }>(
        IPC.platformsSync,
        { platform: id },
      )
      if (result.ok) setNotice(`Synced ${result.videosUpserted ?? 0} item(s) from ${result.channelTitle ?? id}.`)
      else setActionError(result.error ?? 'Sync failed.')
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Sync failed.')
    } finally {
      setBusy(null)
    }
  }

  const noBridge = getBridge() === null

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Connections</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
          Your local analytics database stays on this computer. Account credentials are stored in
          OS-encrypted storage and are never written to logs.
        </p>
      </header>

      {noBridge && (
        <section className="rounded-lg border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-6 text-[13px] text-[var(--color-text-secondary)]">
          The desktop bridge is not available (you are viewing the renderer outside Electron). Run
          the app with <code className="text-[var(--color-text-primary)]">npm run dev</code> to sign
          in and check live status.
        </section>
      )}

      {notice && <p className="text-[12px] text-[var(--color-positive)]">{notice}</p>}
      {actionError && <p className="text-[12px] text-[var(--color-danger)]">{actionError}</p>}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Platforms</h2>
        {platforms.loading && <p className="text-[13px] text-[var(--color-text-secondary)]">Checking platforms…</p>}
        {platforms.error && <p className="text-[13px] text-[var(--color-danger)]">{platforms.error}</p>}

        {(platforms.data ?? []).map((platform) => (
          <article
            key={platform.id}
            className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold">{platform.displayName}</h3>
                <p className="mt-1 text-[12px] text-[var(--color-text-secondary)]">{platform.detail}</p>
              </div>
              <Badge
                ok={platform.connected}
                text={platform.connected ? 'Connected' : platform.configured ? 'Ready to sign in' : 'Not configured'}
              />
            </div>

            <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
              Capabilities: {platform.capabilities.capabilities.join(', ') || 'none yet'}
            </p>

            {!platform.configured && (
              <div className="mt-3 space-y-2">
                {platform.requiredConfig.map((field) => (
                  <div key={field.key}>
                    <label
                      className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]"
                      htmlFor={`${platform.id}-${field.key}`}
                    >
                      {field.label}
                    </label>
                    <input
                      id={`${platform.id}-${field.key}`}
                      type={field.secret ? 'password' : 'text'}
                      className={`${input} mt-1`}
                      value={field.key === 'clientSecret' ? configFor(platform.id).clientSecret : configFor(platform.id).clientId}
                      onChange={(e) =>
                        setConfigs((prev) => ({
                          ...prev,
                          [platform.id]: {
                            ...configFor(platform.id),
                            [field.key === 'clientSecret' ? 'clientSecret' : 'clientId']: e.target.value,
                          },
                        }))
                      }
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => void saveConfig(platform.id)}
                  disabled={busy !== null || !configFor(platform.id).clientId.trim()}
                  className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[#0b0d10] disabled:opacity-40"
                >
                  Save client
                </button>
                <p className="text-[11px] text-[var(--color-text-muted)]">
                  Sign-in uses {platform.authKind === 'device-code' ? 'Twitch’s Device Code grant (no client secret stored)' : 'Google’s loopback + PKCE flow'}.
                </p>
              </div>
            )}

            {platform.configured && (
              <div className="mt-3 flex flex-wrap gap-2">
                {!platform.connected && (
                  <button
                    type="button"
                    onClick={() => void connect(platform.id)}
                    disabled={busy !== null}
                    className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[#0b0d10] disabled:opacity-40"
                  >
                    {busy === `connect:${platform.id}` ? 'Waiting…' : 'Sign in'}
                  </button>
                )}
                {platform.connected && (
                  <>
                    <button
                      type="button"
                      onClick={() => void sync(platform.id)}
                      disabled={busy !== null}
                      className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[#0b0d10] disabled:opacity-40"
                    >
                      {busy === `sync:${platform.id}` ? 'Syncing…' : 'Sync channel data'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void disconnect(platform.id)}
                      disabled={busy !== null}
                      className="rounded-md border border-[var(--color-border-subtle)] px-4 py-2 text-[13px] disabled:opacity-40"
                    >
                      Disconnect
                    </button>
                  </>
                )}
              </div>
            )}

            {device[platform.id] && (
              <div className="mt-3 rounded-md bg-[var(--color-surface-2)] p-3 text-[12px]">
                <p>
                  Enter code{' '}
                  <code className="text-[var(--color-text-primary)]">{device[platform.id]?.userCode}</code> at{' '}
                  <button
                    type="button"
                    className="text-[var(--color-accent)] underline-offset-2 hover:underline"
                    onClick={() => void callIpc(IPC.openExternal, device[platform.id]?.verificationUri)}
                  >
                    {device[platform.id]?.verificationUri}
                  </button>
                  .
                </p>
                <button
                  type="button"
                  onClick={() => void complete(platform.id)}
                  disabled={busy !== null}
                  className="mt-2 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-medium text-[#0b0d10] disabled:opacity-40"
                >
                  {busy === `complete:${platform.id}` ? 'Checking…' : 'I have authorized'}
                </button>
              </div>
            )}
          </article>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">AI providers</h2>
        {providers.error && <p className="text-[13px] text-[var(--color-danger)]">{providers.error}</p>}
        {providers.data && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {providers.data.map((entry) => (
              <article key={entry.id} className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
                <div className="flex items-start justify-between">
                  <h3 className="text-sm font-semibold">{entry.displayName}</h3>
                  <Badge
                    ok={entry.health.authenticated}
                    text={entry.health.authenticated ? 'Connected' : entry.health.available ? 'Available' : 'Not detected'}
                  />
                </div>
                <p className="mt-2 text-[12px] text-[var(--color-text-secondary)]">{entry.health.detail}</p>
                <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
                  checked {new Date(entry.health.checkedAt).toLocaleTimeString()}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
