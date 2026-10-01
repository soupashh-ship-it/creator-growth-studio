import { fetchJson, probe } from '../http'
import {
  ProviderError,
  type AIProvider,
  type AuthResult,
  type GenerationRequest,
  type GenerationResult,
  type ModelInfo,
  type ProviderHealth,
  type StreamCallbacks,
} from '../types'
import { capabilitiesFor } from './ollama'

const DEFAULT_BASE = 'http://localhost:1234/v1'

interface ModelsResponse {
  data?: Array<{ id: string }>
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

/**
 * LM Studio provider (spec §5). LM Studio exposes an OpenAI-compatible server on
 * `http://localhost:1234/v1`; this adapter speaks that contract.
 */
export class LmStudioProvider implements AIProvider {
  readonly id = 'lmstudio' as const
  readonly displayName = 'LM Studio'

  constructor(private readonly baseUrl: string = DEFAULT_BASE) {}

  async authenticate(): Promise<AuthResult> {
    const available = await this.isAvailable()
    return available
      ? { ok: true, accountLabel: 'Local (no account required)' }
      : { ok: false, error: 'LM Studio local server is not running.' }
  }

  async disconnect(): Promise<void> {
    // Local service — nothing to revoke.
  }

  async isAvailable(): Promise<boolean> {
    return probe(`${this.baseUrl}/models`)
  }

  async getModels(): Promise<ModelInfo[]> {
    const data = await fetchJson<ModelsResponse>(`${this.baseUrl}/models`, this.id)
    return (data.data ?? []).map((m) => ({
      id: m.id,
      displayName: m.id,
      capabilities: capabilitiesFor(m.id),
    }))
  }

  private async resolveModel(requested?: string): Promise<string> {
    if (requested) return requested
    const models = await this.getModels()
    const first = models[0]
    if (!first) throw new ProviderError('not_configured', this.id, 'LM Studio is running but no model is loaded.')
    return first.id
  }

  private buildMessages(request: GenerationRequest): Array<Record<string, unknown>> {
    const messages: Array<Record<string, unknown>> = []
    if (request.system) messages.push({ role: 'system', content: request.system })
    messages.push({ role: 'user', content: request.input })
    return messages
  }

  async generateText(request: GenerationRequest, signal?: AbortSignal): Promise<GenerationResult> {
    const model = await this.resolveModel(request.model)
    const data = await fetchJson<ChatCompletionResponse>(`${this.baseUrl}/chat/completions`, this.id, {
      method: 'POST',
      body: {
        model,
        messages: this.buildMessages(request),
        stream: false,
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
        ...(request.jsonSchema
          ? { response_format: { type: 'json_schema', json_schema: { name: 'result', schema: request.jsonSchema } } }
          : {}),
      },
      timeoutMs: 120_000,
      ...(signal ? { signal } : {}),
    })

    const choice = data.choices?.[0]
    const text = choice?.message?.content ?? ''
    if (!text) throw new ProviderError('invalid_output', this.id, 'LM Studio returned an empty response.')

    return {
      text,
      modelId: model,
      providerId: this.id,
      usage: {
        ...(data.usage?.prompt_tokens !== undefined ? { inputTokens: data.usage.prompt_tokens } : {}),
        ...(data.usage?.completion_tokens !== undefined ? { outputTokens: data.usage.completion_tokens } : {}),
      },
      finishReason: choice?.finish_reason === 'length' ? 'length' : 'stop',
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
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, messages: this.buildMessages(request), stream: true }),
        ...(signal ? { signal } : {}),
      })
      if (!response.ok || !response.body) {
        throw new ProviderError('unavailable', this.id, `LM Studio streaming failed with HTTP ${response.status}.`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let text = ''

      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        buffer += decoder.decode(chunk.value, { stream: true })
        let newline = buffer.indexOf('\n')
        while (newline >= 0) {
          const line = buffer.slice(0, newline).trim()
          buffer = buffer.slice(newline + 1)
          newline = buffer.indexOf('\n')
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (payload === '[DONE]') break
          const event = JSON.parse(payload) as ChatCompletionResponse
          const delta = event.choices?.[0]?.message?.content ?? ''
          if (delta) {
            text += delta
            callbacks.onDelta(delta)
          }
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
        new ProviderError(aborted ? 'cancelled' : 'unavailable', this.id, aborted ? 'Cancelled.' : 'LM Studio stream failed.'),
      )
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const available = await this.isAvailable()
    let detail = 'LM Studio local server is not detected.'
    if (available) {
      try {
        const models = await this.getModels()
        detail = models.length > 0 ? `Running · ${models.length} model(s) available` : 'Running · no model loaded'
      } catch {
        detail = 'Running · could not list models'
      }
    }
    return { available, authenticated: available, detail, checkedAt: new Date().toISOString() }
  }
}
