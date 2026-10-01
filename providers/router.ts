import {
  ProviderError,
  isProviderError,
  type AIProvider,
  type GenerationRequest,
  type GenerationResult,
  type ModelCapabilities,
  type ProviderId,
  type TaskKind,
} from './types'

/** Auto routing preference per task (spec §6). Manual choice overrides this. */
export const DEFAULT_ROUTING: Record<TaskKind, ProviderId[]> = {
  'deep-research': ['chatgpt', 'gemini', 'lmstudio', 'ollama'],
  'analytics-interpretation': ['chatgpt', 'gemini', 'lmstudio', 'ollama'],
  'thumbnail-reasoning': ['chatgpt', 'gemini', 'lmstudio', 'ollama'],
  'title-generation': ['gemini', 'chatgpt', 'lmstudio', 'ollama'],
  'bulk-tagging': ['ollama', 'lmstudio', 'gemini', 'chatgpt'],
  'transcript-analysis': ['gemini', 'chatgpt', 'ollama', 'lmstudio'],
  chat: ['chatgpt', 'gemini', 'ollama', 'lmstudio'],
  'structured-extraction': ['chatgpt', 'gemini', 'lmstudio', 'ollama'],
}

/** Tasks that require a specific model capability (spec §132). */
export const REQUIRED_CAPABILITY: Partial<Record<TaskKind, keyof ModelCapabilities>> = {
  'thumbnail-reasoning': 'vision',
  'structured-extraction': 'structuredOutput',
}

export type ProviderChoice = ProviderId | 'auto'

export interface RouterConfig {
  choice: ProviderChoice
  taskOverrides?: Partial<Record<TaskKind, ProviderId[]>>
}

export function orderProviders(task: TaskKind, config: RouterConfig): ProviderId[] {
  if (config.choice !== 'auto') return [config.choice]
  return config.taskOverrides?.[task] ?? DEFAULT_ROUTING[task]
}

export interface FallbackAttempt {
  providerId: ProviderId
  ok: boolean
  error?: ProviderError
}

export interface FallbackOutcome {
  result: GenerationResult
  attempts: FallbackAttempt[]
}

/**
 * Provider fallback chain (spec §7): ChatGPT → Gemini → LM Studio → Ollama.
 * A workflow only fails when *every* provider is unavailable or unauthorised,
 * and the returned `attempts` explain exactly why each one was skipped.
 */
export async function generateWithFallback(
  registry: ReadonlyMap<ProviderId, AIProvider>,
  request: GenerationRequest,
  config: RouterConfig,
  signal?: AbortSignal,
): Promise<FallbackOutcome> {
  const order = orderProviders(request.task, config)
  const attempts: FallbackAttempt[] = []
  const required = REQUIRED_CAPABILITY[request.task]
  let lastError: ProviderError | null = null

  for (const id of order) {
    const provider = registry.get(id)
    if (!provider) {
      const error = new ProviderError('not_configured', id, `${id} is not registered.`)
      attempts.push({ providerId: id, ok: false, error })
      lastError = error
      continue
    }

    try {
      if (!(await provider.isAvailable())) {
        const error = new ProviderError('unavailable', id, `${provider.displayName} is not available.`)
        attempts.push({ providerId: id, ok: false, error })
        lastError = error
        continue
      }

      if (required) {
        const models = await provider.getModels().catch(() => [])
        const capable = models.length === 0 || models.some((m) => m.capabilities[required])
        if (!capable) {
          const error = new ProviderError(
            'permission_missing',
            id,
            `${provider.displayName} has no model supporting "${required}".`,
          )
          attempts.push({ providerId: id, ok: false, error })
          lastError = error
          continue
        }
      }

      const result = await provider.generateText(request, signal)
      attempts.push({ providerId: id, ok: true })
      return { result, attempts }
    } catch (error) {
      const providerError = isProviderError(error)
        ? error
        : new ProviderError('unavailable', id, error instanceof Error ? error.message : String(error))
      attempts.push({ providerId: id, ok: false, error: providerError })
      lastError = providerError
      // A user-initiated cancellation should stop the chain immediately.
      if (providerError.code === 'cancelled') throw providerError
    }
  }

  const fallbackId: ProviderId = config.choice === 'auto' ? 'ollama' : config.choice
  throw lastError ?? new ProviderError('unavailable', fallbackId, 'No AI provider could complete the request.')
}
