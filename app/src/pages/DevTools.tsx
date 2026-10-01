import { useState } from 'react'
import type { JSX } from 'react'
import { IPC } from '../bridge'
import { callIpc, useIpc } from '../useIpc'

interface ProviderHealthEntry {
  id: string
  displayName: string
  health: { available: boolean; authenticated: boolean; detail: string; checkedAt: string }
}

interface PlatformSummary {
  id: string
  displayName: string
  connected: boolean
  detail: string
  checkedAt: string
}

interface SchedulerTask {
  name: string
  intervalMs: number
  lastRunAt: string | null
  lastError: string | null
  running: boolean
}

interface DataInfo {
  databaseBytes: number
  integrity: { ok: boolean; results: string[] }
  counts: Record<string, number>
}

interface LogEntry {
  at: string
  level: 'error' | 'warn' | 'info' | 'debug'
  scope: string
  message: string
}

interface AcceptanceCheck {
  id: string
  label: string
  status: 'pass' | 'fail' | 'blocked'
  detail: string
}

interface AcceptanceReport {
  generatedAt: string
  checks: AcceptanceCheck[]
  passed: number
  failed: number
  blocked: number
}

const ACCEPTANCE_COLOR: Record<AcceptanceCheck['status'], string> = {
  pass: 'var(--color-positive)',
  fail: 'var(--color-danger)',
  blocked: 'var(--color-warning)',
}

const LEVEL_COLOR: Record<LogEntry['level'], string> = {
  error: 'var(--color-danger)',
  warn: 'var(--color-warning)',
  info: 'var(--color-text-secondary)',
  debug: 'var(--color-text-muted)',
}

/**
 * Developer Tools (spec §89).
 *
 * One place with provider health, platform API status, database status, job
 * queue and recent logs. Diagnostics copy is secret-redacted.
 */
export function DevTools(): JSX.Element {
  const providers = useIpc<ProviderHealthEntry[]>(IPC.providersHealth)
  const platforms = useIpc<PlatformSummary[]>(IPC.platformsList)
  const scheduler = useIpc<SchedulerTask[]>(IPC.schedulerStatus)
  const data = useIpc<DataInfo>(IPC.dataInfo)
  const [logs, setLogs] = useState<LogEntry[] | null>(null)
  const [level, setLevel] = useState<'all' | 'warn' | 'error'>('all')
  const [notice, setNotice] = useState<string | null>(null)
  const [acceptance, setAcceptance] = useState<AcceptanceReport | null>(null)
  const [acceptanceBusy, setAcceptanceBusy] = useState(false)

  async function runAcceptanceCheck(): Promise<void> {
    setAcceptanceBusy(true)
    try {
      setAcceptance(await callIpc<AcceptanceReport>(IPC.acceptanceRun))
    } catch {
      setAcceptance(null)
    } finally {
      setAcceptanceBusy(false)
    }
  }

  async function refreshLogs(): Promise<void> {
    try {
      const result = await callIpc<{ entries: LogEntry[] }>(IPC.logsList, { level: level === 'all' ? undefined : level })
      setLogs(result.entries)
    } catch {
      setLogs([])
    }
  }

  async function copyDiagnostics(): Promise<void> {
    try {
      const result = await callIpc<{ text: string }>(IPC.logsDiagnostics)
      await navigator.clipboard.writeText(result.text)
      setNotice('Diagnostics copied to the clipboard (secrets redacted).')
    } catch {
      setNotice('Could not copy diagnostics.')
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Developer Tools</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
          Live status of every integration boundary, the local job queue, and recent logs. Intended
          for debugging — nothing here changes settings.
        </p>
      </header>

      {notice && <p className="text-[12px] text-[var(--color-positive)]">{notice}</p>}

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Acceptance self-check (§155)</h2>
          <button
            type="button"
            onClick={() => void runAcceptanceCheck()}
            disabled={acceptanceBusy}
            className="rounded-md border border-[var(--color-border-subtle)] px-3 py-1.5 text-[12px] disabled:opacity-40"
          >
            {acceptanceBusy ? 'Running…' : 'Run acceptance checks'}
          </button>
        </div>
        <p className="mt-1 text-[12px] text-[var(--color-text-secondary)]">
          Exercises the parts of the end-to-end flow that can run on this machine. Steps needing a
          credential or data source you have not supplied are reported as <strong>blocked</strong>,
          never as a pass or a failure.
        </p>
        {acceptance && (
          <>
            <p className="mt-2 text-[12px] text-[var(--color-text-secondary)]">
              {acceptance.passed} passed · {acceptance.blocked} blocked · {acceptance.failed} failed ·{' '}
              {new Date(acceptance.generatedAt).toLocaleTimeString()}
            </p>
            <ul className="mt-2 space-y-1 text-[12px]">
              {acceptance.checks.map((check) => (
                <li key={check.id} className="rounded-md bg-[var(--color-surface-2)] px-3 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span>{check.label}</span>
                    <span style={{ color: ACCEPTANCE_COLOR[check.status] }}>{check.status}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">{check.detail}</div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <h2 className="text-sm font-semibold">AI providers</h2>
        <ul className="mt-2 space-y-1 text-[12px]">
          {(providers.data ?? []).map((provider) => (
            <li key={provider.id} className="flex items-center justify-between rounded-md bg-[var(--color-surface-2)] px-3 py-1.5">
              <span>{provider.displayName}</span>
              <span style={{ color: provider.health.available ? 'var(--color-positive)' : 'var(--color-text-muted)' }}>
                {provider.health.available ? (provider.health.authenticated ? 'available · signed in' : 'available') : 'unavailable'}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <h2 className="text-sm font-semibold">Platforms</h2>
        <ul className="mt-2 space-y-1 text-[12px]">
          {(platforms.data ?? []).map((platform) => (
            <li key={platform.id} className="flex items-center justify-between rounded-md bg-[var(--color-surface-2)] px-3 py-1.5">
              <span>{platform.displayName}</span>
              <span style={{ color: platform.connected ? 'var(--color-positive)' : 'var(--color-text-muted)' }}>
                {platform.connected ? 'connected' : platform.detail}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <UpdateSection />

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <h2 className="text-sm font-semibold">Database &amp; jobs</h2>
        {data.data && (
          <p className="mt-1 text-[12px] text-[var(--color-text-secondary)]">
            Integrity {data.data.integrity.ok ? 'ok' : 'FAILED'} ·{' '}
            {Object.entries(data.data.counts)
              .map(([table, count]) => `${table} ${count}`)
              .join(' · ')}
          </p>
        )}
        <ul className="mt-2 space-y-1 text-[12px]">
          {(scheduler.data ?? []).map((task) => (
            <li key={task.name} className="flex items-center justify-between rounded-md bg-[var(--color-surface-2)] px-3 py-1.5">
              <span>{task.name}</span>
              <span className="text-[var(--color-text-muted)]">
                {task.lastError ? `error: ${task.lastError}` : task.lastRunAt ? `ran ${new Date(task.lastRunAt).toLocaleTimeString()}` : 'not run yet'}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Logs</h2>
          <div className="flex items-center gap-2">
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as 'all' | 'warn' | 'error')}
              className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-2 py-1 text-[12px]"
              aria-label="Log level filter"
            >
              <option value="all">All levels</option>
              <option value="warn">Warn + error</option>
              <option value="error">Error only</option>
            </select>
            <button type="button" onClick={() => void refreshLogs()} className="rounded-md border border-[var(--color-border-subtle)] px-3 py-1.5 text-[12px]">
              ↻ Refresh
            </button>
            <button type="button" onClick={() => void copyDiagnostics()} className="rounded-md border border-[var(--color-border-subtle)] px-3 py-1.5 text-[12px]">
              Copy diagnostics
            </button>
          </div>
        </div>
        {logs === null ? (
          <p className="mt-2 text-[12px] text-[var(--color-text-secondary)]">Load the recent log entries with Refresh.</p>
        ) : logs.length === 0 ? (
          <p className="mt-2 text-[12px] text-[var(--color-text-secondary)]">No entries at this level.</p>
        ) : (
          <div className="mt-2 max-h-72 overflow-y-auto rounded-md bg-[var(--color-surface-2)] p-3 font-mono text-[11px] leading-relaxed">
            {logs.map((entry, index) => (
              <div key={index}>
                <span className="text-[var(--color-text-muted)]">{new Date(entry.at).toLocaleTimeString()} </span>
                <span style={{ color: LEVEL_COLOR[entry.level] }}>[{entry.level}] </span>
                <span className="text-[var(--color-text-muted)]">({entry.scope}) </span>
                {entry.message}
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
          Tokens, passwords and authorization codes are redacted before storage — see docs/PRIVACY_ARCHITECTURE.md §7.
        </p>
      </section>
    </div>
  )
}

interface UpdateCheckResult {
  ok: boolean
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
  releaseUrl: string | null
  checkedAt: string
  error?: string
}

/** §88: read-only update check. Nothing is downloaded or installed here. */
function UpdateSection(): JSX.Element {
  const [result, setResult] = useState<UpdateCheckResult | null>(null)
  const [busy, setBusy] = useState(false)

  async function check(): Promise<void> {
    setBusy(true)
    try {
      setResult(await callIpc<UpdateCheckResult>(IPC.appUpdateCheck))
    } catch {
      setResult(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Update check</h2>
        <button
          type="button"
          onClick={() => void check()}
          disabled={busy}
          className="rounded-md border border-[var(--color-border-subtle)] px-3 py-1.5 text-[12px] disabled:opacity-40"
        >
          {busy ? 'Checking…' : 'Check for updates'}
        </button>
      </div>
      {result && (
        <p className="mt-2 text-[12px] text-[var(--color-text-secondary)]">
          {result.ok
            ? result.updateAvailable
              ? `Version ${result.latestVersion} is available — `
              : `Up to date (latest release ${result.latestVersion ?? 'unknown'}) · `
            : `Check failed: ${result.error ?? 'unknown error'} · `}
          running {result.currentVersion}.
          {result.ok && result.updateAvailable && result.releaseUrl && (
            <>{' '}<button type="button" onClick={() => void callIpc(IPC.openExternal, result.releaseUrl).catch(() => undefined)} className="text-[var(--color-accent)] underline">Open the release page</button> to download it yourself.</>
          )}
          {' '}The app never downloads or installs anything by itself.
        </p>
      )}
      {!result && !busy && (
        <p className="mt-2 text-[12px] text-[var(--color-text-muted)]">
          Queries the project's GitHub releases and reports only — no auto-install.
        </p>
      )}
    </section>
  )
}
