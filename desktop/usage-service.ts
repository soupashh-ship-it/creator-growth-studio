import { generateWithFallback, orderProviders } from '../providers/router'
import type { GenerationRequest, ProviderId } from '../providers/types'
import { getServices } from './services'

/**
 * AI usage visibility & consensus (spec §86, §134).
 *
 * Usage counters are LOCAL request counts (what this app sent), not provider
 * quota numbers — those are not exposed by the account-based flows, and the UI
 * must not invent them. Consensus mode sends one prompt to two providers and
 * reports agreement/differences; it is only run on explicit user action because
 * it doubles plan/quota consumption.
 */

const USAGE_KEY = 'ai.usage.counters'

type Counters = Partial<Record<ProviderId, number>>

function readCounters(): Counters {
  const stored = getServices().repos.getSetting<Counters>('app', USAGE_KEY)
  return stored ?? {}
}

function writeCounters(counters: Counters): void {
  getServices().repos.setSetting('app', USAGE_KEY, counters)
}

export function recordUsage(providerId: string): void {
  const counters = readCounters()
  const current = counters[providerId as ProviderId] ?? 0
  counters[providerId as ProviderId] = current + 1
  writeCounters(counters)
}

export function getUsage(): Array<{ providerId: string; requests: number }> {
  return Object.entries(readCounters())
    .map(([providerId, requests]) => ({ providerId, requests: requests ?? 0 }))
    .sort((a, b) => b.requests - a.requests)
}

export interface ConsensusSide {
  providerId: string
  ok: boolean
  text: string
  error?: string
}

export interface ConsensusResult {
  sides: ConsensusSide[]
  shared: string[]
  onlyA: string[]
  onlyB: string[]
  note: string
}

/** Crude line-level overlap: lines (≥4 words) appearing in both answers. */
function splitLines(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.split(/\s+/).length >= 4)
}

export function summarizeConsensus(a: ConsensusSide, b: ConsensusSide): Omit<ConsensusResult, 'sides' | 'note'> {
  const linesA = a.ok ? splitLines(a.text.toLowerCase()) : []
  const linesB = b.ok ? splitLines(b.text.toLowerCase()) : []
  const setB = new Set(linesB)
  const shared: string[] = []
  const onlyA: string[] = []
  for (const line of linesA) {
    if (setB.has(line)) shared.push(line)
    else onlyA.push(line)
  }
  const setShared = new Set(shared)
  const onlyB = linesB.filter((line) => !setShared.has(line))
  return { shared, onlyA, onlyB }
}

export async function compareProviders(
  registry: ReadonlyMap<ProviderId, AIProviderLike>,
  request: GenerationRequest,
  choices: [ProviderId, ProviderId],
): Promise<ConsensusResult> {
  const sides: ConsensusSide[] = []

  for (const id of choices) {
    const provider = registry.get(id)
    if (!provider) {
      sides.push({ providerId: id, ok: false, text: '', error: `${id} is not registered.` })
      continue
    }
    try {
      if (!(await provider.isAvailable())) {
        sides.push({ providerId: id, ok: false, text: '', error: `${provider.displayName} is not available.` })
        continue
      }
      const result = await provider.generateText(request)
      sides.push({ providerId: id, ok: true, text: result.text })
      recordUsage(id)
    } catch (error) {
      sides.push({ providerId: id, ok: false, text: '', error: error instanceof Error ? error.message : String(error) })
    }
  }

  const [a, b] = sides
  const overlap = a && b ? summarizeConsensus(a, b) : { shared: [], onlyA: [], onlyB: [] }
  return {
    sides,
    ...overlap,
    note: 'Consensus runs the same prompt twice — it consumes double the plan/quota. Line overlap is a rough mechanical comparison, not a quality verdict.',
  }
}

// Minimal structural type to avoid importing the full AIProvider into tests.
export interface AIProviderLike {
  readonly id: ProviderId
  readonly displayName: string
  isAvailable(): Promise<boolean>
  generateText(request: GenerationRequest): Promise<{ text: string }>
}

export { orderProviders, generateWithFallback }
