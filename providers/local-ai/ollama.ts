import { fetchJson, probe } from '../http'
import {
  ProviderError,
  type AIProvider,
  type AuthResult,
  type GenerationRequest,
  type GenerationResult,
  type ModelCapabilities,
  type ModelInfo,
  type ProviderHealth,
  type StreamCallbacks,
} from '../types'

const DEFAULT_BASE = 'http://localhost:11434'

interface TagsResponse {
  models?: Array<{ name: string; model?: string }>
}

interface ChatResponse {
  message?: { content?: string }
  prompt_eval_count?: number
  eval_count?: number
  done_reason?: string
}

const VISION_HINTS = [/llava/i, /vision/i, /qwen.*vl/i, /gemma3/i, /moondream/i, /minicpm-v/i]
const REASONING_HINTS = [/deepseek-r1/i, /reasoning/i, /qwq/i, /think/i]

export function capabilitiesFor(name: string): ModelCapabilities {
  return {
    text: true,
    vision: VISION_HINTS.some((r) => r.test(name)),
    reasoning: REASONING_HINTS.some((r) => r.test(name)),
    largeContext: /(128k|30b|32b|70b|72b)/i.test(name),
    structuredOutput: true, // Ollama supports a JSON `format` field
    streaming: true,
  }
}

/**
 * Ollama provider (spec §5). Fully local — no data leaves the machine.
 * Detects models automatically from the local server.
 */
export class OllamaProvider implements AIProvider {
  readonly id = 'ollama' as const
  readonly displayName = 'Ollama'

  constructor(private readonly baseUrl: string = DEFAULT_BASE) {}

  async authenticate(): Promise<AuthResult> {
    const available = await this.isAvailable()
    return available
      ? { ok: true, accountLabel: 'Local (no account required)' }
      : { ok: false, error: 'Ollama is not running on this machine.' }
  }

  async disconnect(): Promise<void> {
    // Nothing to revoke for a local service.
  }

  async isAvailable(): Promise<boolean> {
    return probe(`${this.baseUrl}/api/tags`)
  }

  async getModels(): Promise<ModelInfo[]> {
    const data = await fetchJson<TagsResponse>(`${this.baseUrl}/api/tags`, this.id)
    return (data.models ?? []).map((m) => {
      const id = m.model ?? m.name
      return { id, displayName: id, capabilities: capabilitiesFor(id) }
    })
  }

  private async resolveModel(requested?: string): Promise<string> {
    if (requested) return requested
    const models = await this.getModels()
    const first = models[0]
    if (!first) {
      throw new ProviderError('not_configured', this.id, 'Ollama is running but no models are installed.')
    }
    return first.id
  }

  private buildBody(request: GenerationRequest, model: string, stream: boolean): Record<string, unknown> {
    const messages: Array<Record<string, unknown>> = []
    if (request.system) messages.push({ role: 'system', content: request.system })
    const userMessage: Record<string, unknown> = { role: 'user', content: request.input }
    if (request.images && request.images.length > 0) {
      userMessage['images'] = request.images.map((bytes) => Buffer.from(bytes).toString('base64'))
    }
    messages.push(userMessage)

    return {
      model,
      messages,
      stream,
      ...(request.jsonSchema ? { format: request.jsonSchema } : {}),
      options: {
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...(request.maxTokens !== undefined ? { num_predict: request.maxTokens } : {}),
      },
    }
  }

  async generateText(request: GenerationRequest, signal?: AbortSignal): Promise<GenerationResult> {
    const model = await this.resolveModel(request.model)
    const data = await fetchJson<ChatResponse>(`${this.baseUrl}/api/chat`, this.id, {
      method: 'POST',
      body: this.buildBody(request, model, false),
      timeoutMs: 120_000,
      ...(signal ? { signal } : {}),
    })

    const text = data.message?.content ?? ''
    if (!text) {
      throw new ProviderError('invalid_output', this.id, 'Ollama returned an empty response.')
    }

    return {
      text,
      modelId: model,
      providerId: this.id,
      usage: {
        ...(data.prompt_eval_count !== undefined ? { inputTokens: data.prompt_eval_count } : {}),
        ...(data.eval_count !== undefined ? { outputTokens: data.eval_count } : {}),
      },
      finishReason: data.done_reason === 'length' ? 'length' : 'stop',
    }
  }

  async streamText(
    request: GenerationRequest,
    callbacks: StreamCallbacks,
    signal?: AbortSignal,
  ): Promise<void> {
    let model: string
    try {
      model = await this.resolveModel(request.model)
    } catch (error) {
      callbacks.onError(
        error instanceof ProviderError ? error : new ProviderError('unavailable', this.id, 'Could not select a model.'),
      )
      return
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(this.buildBody(request, model, true)),
        ...(signal ? { signal } : {}),
      })
      if (!response.ok || !response.body) {
        throw new ProviderError('unavailable', this.id, `Ollama streaming failed with HTTP ${response.status}.`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let text = ''
      let done = false

      while (!done) {
        const chunk = await reader.read()
        if (chunk.done) break
        buffer += decoder.decode(chunk.value, { stream: true })
        let newline = buffer.indexOf('\n')
        while (newline >= 0) {
          const line = buffer.slice(0, newline).trim()
          buffer = buffer.slice(newline + 1)
          newline = buffer.indexOf('\n')
          if (!line) continue
          const event = JSON.parse(line) as ChatResponse & { done?: boolean }
          const delta = event.message?.content ?? ''
          if (delta) {
            text += delta
            callbacks.onDelta(delta)
          }
          if (event.done) done = true
        }
      }

      callbacks.onDone({ text, modelId: model, providerId: this.id, finishReason: 'stop' })
    } catch (error) {
      if (error instanceof ProviderError) {
        callbacks.onError(error)
        return
      }
      const aborted = error instanceof Error && error.name === 'AbortError'
      callbacks.onError(
        new ProviderError(aborted ? 'cancelled' : 'unavailable', this.id, aborted ? 'Cancelled.' : 'Ollama stream failed.'),
      )
    }
  }

  /**
   * Local embeddings (§142). Runs entirely on this machine — the text never
   * leaves the device. Prefers an obvious embedding model when one is present.
   */
  async embedTexts(texts: string[]): Promise<{ modelId: string; embeddings: number[][] }> {
    const models = await this.getModels()
    const model =
      models.find((m) => /embed|nomic|mxbai|bge|gte/i.test(m.id))?.id ?? models[0]?.id
    if (!model) {
      throw new ProviderError('not_configured', this.id, 'Ollama is running but no models are installed to embed with.')
    }

    const embeddings: number[][] = []
    for (const text of texts) {
      const data = await fetchJson<{ embedding?: number[] }>(`${this.baseUrl}/api/embeddings`, this.id, {
        method: 'POST',
        body: { model, prompt: text },
        timeoutMs: 120_000,
      })
      if (!Array.isArray(data.embedding) || data.embedding.length === 0) {
        throw new ProviderError('invalid_output', this.id, 'Ollama returned no embedding for a chunk.')
      }
      embeddings.push(data.embedding)
    }
    return { modelId: model, embeddings }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const available = await this.isAvailable()
    let detail = 'Ollama is not detected on this machine.'
    if (available) {
      try {
        const models = await this.getModels()
        detail = models.length > 0 ? `Running · ${models.length} model(s) installed` : 'Running · no models installed'
      } catch {
        detail = 'Running · could not list models'
      }
    }
    return { available, authenticated: available, detail, checkedAt: new Date().toISOString() }
  }
}
