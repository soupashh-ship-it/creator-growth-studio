import { useState } from 'react'
import type { JSX } from 'react'
import { IPC } from '../bridge'
import { EmptyState } from '../components/EmptyState'
import { callIpc, useIpc } from '../useIpc'

interface PlatformSummary {
  id: string
  displayName: string
  connected: boolean
  capabilities: { platform: string; capabilities: string[]; requiresConnection: string[] }
  detail: string
}

interface ConversionStage {
  key: string
  label: string
  numerator: number | null
  denominator: number | null
  rate: number | null
  source: string
  whyUnavailable?: string
}

interface ConversionFunnel {
  stages: ConversionStage[]
  availableCount: number
  notes: string[]
}

interface GenerateResponse {
  text: string
  providerId: string
  modelId: string
  cached: boolean
}

interface GeneratedCta {
  text: string
  kind: 'subscribe' | 'member' | 'follow' | 'generic'
}

const input =
  'w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-accent)]'

const fmt = (n: number | null): string => (n === null ? '—' : n.toLocaleString())

const MEMBER_NOTE: Record<string, string> = {
  'youtube:members':
    'YouTube member lists and revenue require special API approval and scopes outside this app\'s request. Only your connected channel\'s public counts are synced.',
  'youtube:revenue':
    'Estimated revenue lives in YouTube Studio (Analytics API, approval-gated). This app will not estimate earnings.',
  'twitch:members':
    'Twitch does not expose subscriber identities or counts to third-party applications through the public API.',
  'twitch:revenue':
    'Payout data is private to the creator dashboard; no public API exists.',
}

/**
 * Members / Conversion Studio (spec §45–47).
 *
 * The funnel is computed from real stored numbers and shows each stage's
 * availability honestly. CTA drafting uses the configured AI with a prompt that
 * forbids generic hype and invented cadence. Membership/revenue data stays
 * "Not available" by design because official APIs do not expose it.
 */
export function Members(): JSX.Element {
  const platforms = useIpc<PlatformSummary[]>(IPC.platformsList)
  const funnel = useIpc<ConversionFunnel>(IPC.conversionFunnel)
  const [topic, setTopic] = useState('')
  const [cadence, setCadence] = useState('')
  const [ctas, setCtas] = useState<GeneratedCta[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function draftCtas(): Promise<void> {
    if (!topic.trim()) return
    setBusy(true)
    setActionError(null)
    try {
      const result = await callIpc<GenerateResponse>(IPC.providersGenerate, {
        task: 'cta-writing',
        system:
          'You write content-aware calls-to-action for videos and streams. Reference the specific content and ' +
          'the update cadence the creator states. NEVER write generic hype ("smash like", "hit subscribe"), ' +
          'and NEVER promise a cadence the creator did not give. Return ONLY JSON: {"ctas": ' +
          '[{"text": string, "kind": "subscribe"|"member"|"follow"|"generic"}]} with 4-6 CTAs.',
        input: `Content: ${topic.trim()}\nStated cadence: ${cadence.trim() || 'not stated - do not invent one'}\nReturn the JSON object.`,
        promptName: 'cta-writer',
        promptVersion: 1,
      })
      const parsed = JSON.parse(result.text) as { ctas?: GeneratedCta[] }
      setCtas(Array.isArray(parsed.ctas) ? parsed.ctas : [])
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'CTA drafting failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Members</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[var(--color-text-secondary)]">
          Conversion from views to subscribers, computed from your own synced numbers — plus honest
          reporting of what official APIs do not expose. No revenue or member counts are estimated.
        </p>
      </header>

      {funnel.data && (
        <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Conversion funnel</h2>
            <button type="button" onClick={funnel.reload} className="text-[12px] text-[var(--color-accent)] underline-offset-2 hover:underline">
              ↻ Refresh
            </button>
          </div>
          <div className="mt-2 space-y-2">
            {funnel.data.stages.map((stage) => (
              <div key={stage.key} className="rounded-md bg-[var(--color-surface-2)] p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-medium">{stage.label}</span>
                  <span className="shrink-0 text-[15px] font-semibold tabular-nums">
                    {stage.rate === null ? 'Not available' : `${stage.rate}%`}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
                  {fmt(stage.numerator)} / {fmt(stage.denominator)} · {stage.source}
                </div>
                {stage.whyUnavailable && stage.rate === null && (
                  <p className="mt-1 text-[11px] text-[var(--color-text-secondary)]">{stage.whyUnavailable}</p>
                )}
              </div>
            ))}
          </div>
          {funnel.data.availableCount === 0 && (
            <p className="mt-2 text-[12px] text-[var(--color-text-secondary)]">
              Nothing computable yet — connect and sync a channel on the Connections page.
            </p>
          )}
          <ul className="mt-3 space-y-1 text-[11px] text-[var(--color-text-muted)]">
            {funnel.data.notes.map((note) => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
        </section>
      )}
      {funnel.error && <p className="text-[13px] text-[var(--color-danger)]">{funnel.error}</p>}

      {funnel.data && funnel.data.availableCount > 0 && (
        <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
          <h2 className="text-sm font-semibold">Suggestions</h2>
          <ul className="mt-2 space-y-2">
            {funnel.data.stages
              .filter((stage) => stage.rate !== null)
              .map((stage) => (
                <li key={stage.key} className="rounded-md bg-[var(--color-surface-2)] p-3 text-[12px]">
                  <div className="font-medium">{stage.label}: {stage.rate}%</div>
                  <div className="mt-0.5 text-[var(--color-text-secondary)]">{stage.source}</div>
                </li>
              ))}
          </ul>
        </section>
      )}

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <h2 className="text-sm font-semibold">CTA generator</h2>
        <p className="mt-1 text-[12px] text-[var(--color-text-secondary)]">
          Content-aware CTAs. The prompt forbids "smash like" hype and invented upload promises.
        </p>
        <label className="mt-2 block text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="cta-topic">
          What are viewers watching?
        </label>
        <input
          id="cta-topic"
          className={`${input} mt-1`}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="a PoE 2 league-starter build series"
        />
        <label className="mt-2 block text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="cta-cadence">
          Update cadence (leave blank if you don't want one promised)
        </label>
        <input
          id="cta-cadence"
          className={`${input} mt-1`}
          value={cadence}
          onChange={(e) => setCadence(e.target.value)}
          placeholder="updated every league"
        />
        <button
          type="button"
          onClick={() => void draftCtas()}
          disabled={busy || !topic.trim()}
          className="mt-2 rounded-md bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[#0b0d10] disabled:opacity-40"
        >
          {busy ? 'Drafting…' : 'Draft CTAs'}
        </button>
        {actionError && <p className="mt-2 text-[12px] text-[var(--color-danger)]">{actionError}</p>}
        {ctas && (
          <ul className="mt-3 space-y-2">
            {ctas.map((cta, index) => (
              <li key={index} className="rounded-md bg-[var(--color-surface-2)] p-3 text-[12px]">
                <div>{cta.text}</div>
                <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">{cta.kind}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4">
        <h2 className="text-sm font-semibold">Membership &amp; revenue availability</h2>
        <div className="mt-2 space-y-2">
          {(platforms.data ?? []).flatMap((platform) =>
            (['members', 'revenue'] as const).map((capability) => {
              const known = MEMBER_NOTE[`${platform.id}:${capability}`]
              return (
                <div key={`${platform.id}:${capability}`} className="rounded-md bg-[var(--color-surface-2)] p-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[13px] font-medium">
                      {platform.displayName} · {capability}
                    </span>
                    <span className="text-[11px] font-medium text-[var(--color-text-muted)]">Not available</span>
                  </div>
                  <p className="mt-1 text-[12px] text-[var(--color-text-secondary)]">
                    {known ?? 'Not offered by this platform\'s public API.'}
                  </p>
                </div>
              )
            }),
          )}
          {!platforms.loading && (platforms.data ?? []).length === 0 && (
            <EmptyState title="Platform status unavailable" body="Connect a platform on the Connections page to see capability details." />
          )}
        </div>
      </section>
    </div>
  )
}
