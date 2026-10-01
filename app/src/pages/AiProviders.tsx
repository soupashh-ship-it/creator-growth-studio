import { useState } from 'react'
import type { JSX } from 'react'
import { IPC, type ProviderHealthEntry } from '../bridge'
import { callIpc, useIpc } from '../useIpc'

interface GenerateResponse {
  text: string
  providerId: string
  modelId: string
  cached: boolean
  cachedAt: string | null
  prompt: { name: string; version: number } | null
  attempts: Array<{ providerId: string; ok: boolean; error: { code: string; message: string } | null }>
}

interface UsageRow {
  providerId: string
  requests: number
}

interface ConsensusResult {
  sides: Array<{ providerId: string; ok: boolean; text: string; error?: string }>
  shared: string[]
  onlyA: string[]
  onlyB: string[]
  note: string
}

const PROVIDER_CHOICES = ['auto', 'chatgpt', 'gemini', 'ollama', 'lmstudio'] as const

const MAPPING_TASKS = [
  'deep-research',
  'analytics-interpretation',
  'thumbnail-reasoning',
  'title-generation',
  'bulk-tagging',
  'transcript-analysis',
  'chat',
  'structured-extraction',
] as const

const TASKS = [
  'title-generation',
  'seo-analyzer',
  'analytics-interpretation',
  'thumbnail-reasoning',
  'bulk-tagging',
  'transcript-analysis',
  'deep-research',
  'chat',
] as const

const input =
  'w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-accent)]'

/**
 * AI Providers (spec §6, §81, §132, §145).
 *
 * Shows the real health of each provider and lets you run a prompt through the
 * fallback chain. Identical inputs reuse a cached answer unless you press
 * "Regenerate", and editing a prompt's version invalidates prior results
 * (spec §79, §83).
 */
export function AiProviders(): JSX.Element {
  const providers = useIpc<ProviderHealthEntry[]>(IPC.providersHealth)
  const usage = useIpc<UsageRow[]>(IPC.aiUsage)
  const overrides = useIpc<Record<string, string>>(IPC.settingsGetTaskOverrides)
  const [task, setTask] = useState<(typeof TASKS)[number]>('title-generation')
  const [prompt, setPrompt] = useState('')
  const [response, setResponse] = useState<GenerateResponse | null>(null)
  const [consensus, setConsensus] = useState<ConsensusResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // One stable prompt identity per task; bump the version to invalidate cache.
  const PROMPT_VERSION = 1

  async function generate(regenerate: boolean): Promise<void> {
    if (!prompt.trim()) return
    setBusy(true)
    setActionError(null)
    try {
      const result = await callIpc<GenerateResponse>(IPC.providersGenerate, {
        task,
        input: prompt,
        promptName: `adhoc:${task}`,
        promptVersion: PROMPT_VERSION,
        regenerate,
      })
      setResponse(result)
      usage.reload()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Generation failed.')
    } finally {
      setBusy(false)
    }
  }

  async function runConsensus(): Promise<void> {
    if (!prompt.trim()) return
    setBusy(true)
    setActionError(null)
    setConsensus(null)
    try {
      // Compare the top two providers from the default routing order.
      const result = await callIpc<ConsensusResult>(IPC.aiConsensus, {
        task,
        input: prompt,
        a: 'chatgpt',
        b: 'gemini',
      })
      setConsensus(result)
      usage.reload()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Consensus run failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">AI Providers</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
          Providers are tried in a fixed fallback chain. Account-based sign-in is preferred over API
          keys, and nothing is fabricated when no provider is available.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Provider health</h2>
        {providers.loading && <p className="text-[13px] text-[var(--color-text-secondary)]">Checking…</p>}
        {providers.error && <p className="text-[13px] text-[var(--color-danger)]">{providers.error}</p>}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {(providers.data ?? []).map((entry) => (
            <article key={entry.id} className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">{entry.displayName}</h3>
                <span
                  className="text-[11px]"
                  style={{ color: entry.health.available ? 'var(--color-positive)' : 'var(--color-warning)' }}
                >
                  {entry.health.available ? (entry.health.authenticated ? 'connected' : 'available') : 'offline'}
                </span>
              </div>
              <p className="mt-2 text-[12px] text-[var(--color-text-secondary)]">{entry.health.detail}</p>
            </article>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-[var(--color-text-muted)]">
          Requests sent by this app (local counter — providers do not expose plan quotas here):{' '}
          {(usage.data ?? []).length === 0
            ? 'none yet'
            : usage.data!.map((row) => `${row.providerId} ${row.requests}`).join(' · ')}
        </p>

        <details className="mt-3 rounded-md bg-[var(--color-surface-2)] p-3">
          <summary className="cursor-pointer text-[12px] font-medium">Task → provider mapping (advanced)</summary>
          <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
            Overrides the auto router per task. "Auto" uses the default fallback chain.
          </p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {MAPPING_TASKS.map((mappingTask) => (
              <div key={mappingTask} className="flex items-center justify-between gap-2">
                <span className="truncate text-[11px]">{mappingTask}</span>
                <select
                  value={overrides.data?.[mappingTask] ?? 'auto'}
                  onChange={(e) =>
                    void callIpc(IPC.settingsSetTaskProvider, { task: mappingTask, provider: e.target.value }).then(() =>
                      overrides.reload(),
                    )
                  }
                  aria-label={`Provider for ${mappingTask}`}
                  className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] px-2 py-1 text-[11px]"
                >
                  {PROVIDER_CHOICES.map((choice) => (
                    <option key={choice} value={choice}>
                      {choice}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </details>
      </section>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <h2 className="text-sm font-semibold">Run a prompt</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[14rem_1fr]">
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="ai-task">
              Task
            </label>
            <select id="ai-task" className={input} value={task} onChange={(e) => setTask(e.target.value as (typeof TASKS)[number])}>
              {TASKS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="ai-input">
              Input
            </label>
            <textarea
              id="ai-input"
              className={`${input} min-h-24 resize-y`}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the video or ask a question…"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void generate(false)}
            disabled={busy || !prompt.trim()}
            className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[#0b0d10] disabled:opacity-40"
          >
            {busy ? 'Working…' : 'Generate'}
          </button>
          <button
            type="button"
            onClick={() => void generate(true)}
            disabled={busy || !prompt.trim()}
            className="rounded-md border border-[var(--color-border-subtle)] px-4 py-2 text-[13px] disabled:opacity-40"
          >
            ↻ Regenerate
          </button>
          <button
            type="button"
            onClick={() => void runConsensus()}
            disabled={busy || !prompt.trim()}
            title="Sends the same prompt to two providers — uses double the plan/quota"
            className="rounded-md border border-[var(--color-border-subtle)] px-4 py-2 text-[13px] disabled:opacity-40"
          >
            Compare AI opinions
          </button>
        </div>
        {actionError && <p className="mt-2 text-[12px] text-[var(--color-danger)]">{actionError}</p>}
      </section>

      {response && (
        <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Result</h2>
            <span className="text-[11px] text-[var(--color-text-muted)]">
              {response.providerId} · {response.modelId} ·{' '}
              {response.cached ? `cached ${response.cachedAt ? new Date(response.cachedAt).toLocaleString() : ''}` : 'fresh'}
            </span>
          </div>
          <pre className="mt-2 whitespace-pre-wrap text-[13px] text-[var(--color-text-primary)]">{response.text}</pre>

          {response.attempts.some((attempt) => !attempt.ok) && (
            <details className="mt-3 text-[11px] text-[var(--color-text-muted)]">
              <summary>Providers tried</summary>
              <ul className="mt-1 space-y-1">
                {response.attempts.map((attempt) => (
                  <li key={attempt.providerId}>
                    {attempt.providerId}: {attempt.ok ? 'ok' : `${attempt.error?.code} — ${attempt.error?.message}`}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {consensus && (
        <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
          <h2 className="text-sm font-semibold">AI comparison</h2>
          <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {consensus.sides.map((side) => (
              <div key={side.providerId} className="rounded-md bg-[var(--color-surface-2)] p-3">
                <div className="flex items-center justify-between text-[12px] font-medium">
                  <span>{side.providerId}</span>
                  <span className="text-[11px] text-[var(--color-text-muted)]">{side.ok ? 'answered' : 'failed'}</span>
                </div>
                {side.ok ? (
                  <pre className="mt-1 max-h-60 overflow-y-auto whitespace-pre-wrap text-[11px] text-[var(--color-text-secondary)]">{side.text}</pre>
                ) : (
                  <p className="mt-1 text-[11px] text-[var(--color-danger)]">{side.error}</p>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-2 text-[12px]">
            <div>
              <span className="font-medium">Shared points:</span>{' '}
              {consensus.shared.length > 0 ? `${consensus.shared.length} overlapping line(s)` : 'no line-level overlap detected'}
            </div>
            <p className="text-[11px] text-[var(--color-text-muted)]">{consensus.note}</p>
          </div>
        </section>
      )}
    </div>
  )
}
