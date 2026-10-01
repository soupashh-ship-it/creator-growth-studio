/**
 * AI provider abstraction (spec §6, §132).
 *
 * The UI and engines depend only on this interface, never on a concrete
 * provider. Adding a provider means implementing this and registering it.
 */
export type ProviderId = 'chatgpt' | 'gemini' | 'ollama' | 'lmstudio'

export type TaskKind =
  | 'deep-research'
  | 'analytics-interpretation'
  | 'thumbnail-reasoning'
  | 'title-generation'
  | 'bulk-tagging'
  | 'transcript-analysis'
  | 'chat'
  | 'structured-extraction'

export interface ModelCapabilities {
  text: boolean
  vision: boolean
  reasoning: boolean
  largeContext: boolean
  structuredOutput: boolean
  streaming: boolean
}

export interface ModelInfo {
  id: string
  displayName: string
  capabilities: ModelCapabilities
}

export interface GenerationRequest {
  task: TaskKind
  /** Specific model to use; when omitted the provider picks a default. */
  model?: string
  system?: string
  input: string
  /** JSON Schema for structured output, when the task needs it. */
  jsonSchema?: unknown
  /** Inline images for multimodal tasks (kept on-device for local providers). */
  images?: Uint8Array[]
  temperature?: number
  maxTokens?: number
}

export type FinishReason = 'stop' | 'length' | 'cancelled' | 'error'

export interface GenerationResult {
  text: string
  json?: unknown
  modelId: string
  providerId: ProviderId
  usage?: { inputTokens?: number; outputTokens?: number }
  finishReason: FinishReason
}

export interface StreamCallbacks {
  onDelta(chunk: string): void
  onDone(result: GenerationResult): void
  onError(error: ProviderError): void
}

export interface ProviderHealth {
  available: boolean
  authenticated: boolean
  detail: string
  checkedAt: string
}

export interface AuthResult {
  ok: boolean
  accountLabel?: string
  error?: string
}

/** Failure states shared with the UI (spec §81). */
export type ProviderErrorCode =
  | 'not_configured'
  | 'auth_expired'
  | 'rate_limited'
  | 'offline'
  | 'unavailable'
  | 'permission_missing'
  | 'quota_reached'
  | 'api_changed'
  | 'cancelled'
  | 'invalid_output'

export class ProviderError extends Error {
  readonly code: ProviderErrorCode
  readonly providerId: ProviderId
  readonly detail?: string

  constructor(code: ProviderErrorCode, providerId: ProviderId, message: string, detail?: string) {
    super(message)
    this.name = 'ProviderError'
    this.code = code
    this.providerId = providerId
    if (detail !== undefined) this.detail = detail
  }
}

export function isProviderError(value: unknown): value is ProviderError {
  return value instanceof ProviderError
}

export interface AIProvider {
  readonly id: ProviderId
  readonly displayName: string
  /** Runs the provider's own account sign-in flow where supported. */
  authenticate(): Promise<AuthResult>
  disconnect(): Promise<void>
  isAvailable(): Promise<boolean>
  getModels(): Promise<ModelInfo[]>
  generateText(request: GenerationRequest, signal?: AbortSignal): Promise<GenerationResult>
  streamText(
    request: GenerationRequest,
    callbacks: StreamCallbacks,
    signal?: AbortSignal,
  ): Promise<void>
  healthCheck(): Promise<ProviderHealth>
  /** Whether this provider can use the user's subscription plan (§145). */
  supportsPlanUsage?(): Promise<boolean>
  /**
   * Optional: produce local embeddings for semantic knowledge search (§142).
   * Only providers that run on-device (e.g. Ollama) implement this. Providers
   * that would ship stored text to a remote API must NOT implement it.
   */
  embedTexts?(texts: string[]): Promise<{ modelId: string; embeddings: number[][] }>
}
