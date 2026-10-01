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

/**
 * ChatGPT provider (spec §3) using OpenAI's **official open-source sign-in
 * SDK** (`@siwc/local`).
 *
 * IMPORTANT (docs/INTEGRATION_AUDIT.md §1, spec §144):
 *  - We use the official SDK. We never scrape chat.openai.com, steal cookies,
 *    or extract session tokens.
 *  - The provider is `not_configured` when the SDK is not installed, and
 *    `permission_missing` when the signed-in account has not granted plan usage.
 *  - We never silently fall back to a paid API key.
 *
 * The SDK is loaded dynamically so the app still builds and runs when it is
 * absent, and so this module never hard-depends on it.
 */

interface SiwcSession {
  sharing?: boolean
}

interface SiwcClient {
  signIn(options?: { newProfile?: boolean; profileId?: string }): Promise<SiwcSession>
  listProfiles(): Promise<Array<{ id: string; label?: string; email?: string }>>
  selectProfile(profileId: string): Promise<SiwcSession>
  getSession(): Promise<SiwcSession>
  listModels(): Promise<Array<{ slug: string; displayName?: string }>>
  streamResponse(args: { model: string; input: string; instructions?: string }): Promise<{ text: string }>
}

const SDK_PACKAGE = '@siwc/local'

export class ChatGPTProvider implements AIProvider {
  readonly id = 'chatgpt' as const
  readonly displayName = 'ChatGPT'

  private client: SiwcClient | null = null

  /** Attempts to load the official SDK; returns null when it is not installed. */
  private async loadSdk(): Promise<SiwcClient | null> {
    try {
      const moduleName = SDK_PACKAGE
      const mod = (await import(/* @vite-ignore */ moduleName)) as Record<string, unknown>
      const factory = (mod['createChatGPT'] ?? mod['createClient']) as
        | ((config: Record<string, unknown>) => SiwcClient)
        | undefined
      if (typeof factory !== 'function') return null
      this.client = factory({
        appName: 'Creator Growth Studio',
        appId: 'creator-growth-studio',
        sendHostId: true,
      })
      return this.client
    } catch {
      return null
    }
  }

  async isAvailable(): Promise<boolean> {
    return (await this.loadSdk()) !== null
  }

  async authenticate(): Promise<AuthResult> {
    const client = await this.loadSdk()
    if (!client) {
      return {
        ok: false,
        error:
          'The official OpenAI sign-in SDK is not installed. ChatGPT plan usage requires it; no API key fallback is used.',
      }
    }
    try {
      const session = await client.signIn()
      return {
        ok: session.sharing === true,
        accountLabel: 'ChatGPT account',
        error: session.sharing ? undefined : 'Signed in, but ChatGPT plan usage was not granted for this account.',
      }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Sign-in failed.' }
    }
  }

  async disconnect(): Promise<void> {
    this.client = null
  }

  private async requireClient(): Promise<SiwcClient> {
    const client = this.client ?? (await this.loadSdk())
    if (!client) {
      throw new ProviderError(
        'not_configured',
        this.id,
        'The official OpenAI sign-in SDK is not installed, so ChatGPT plan usage is unavailable.',
      )
    }
    const session = await client.getSession()
    if (session.sharing !== true) {
      throw new ProviderError(
        'permission_missing',
        this.id,
        'This ChatGPT account has not granted plan usage for the app. Enable it in ChatGPT settings, or use another provider.',
      )
    }
    return client
  }

  async getModels(): Promise<ModelInfo[]> {
    const client = await this.requireClient()
    const models = await client.listModels()
    return models.map((m) => ({
      id: m.slug,
      displayName: m.displayName ?? m.slug,
      capabilities: {
        text: true,
        vision: true,
        reasoning: true,
        largeContext: true,
        structuredOutput: true,
        streaming: true,
      },
    }))
  }

  async generateText(request: GenerationRequest, _signal?: AbortSignal): Promise<GenerationResult> {
    const client = await this.requireClient()
    const model = request.model ?? (await this.getModels())[0]?.id
    if (!model) throw new ProviderError('not_configured', this.id, 'No ChatGPT models are available for this account.')

    const result = await client.streamResponse({
      model,
      input: request.input,
      ...(request.system ? { instructions: request.system } : {}),
    })

    if (!result.text?.trim()) {
      throw new ProviderError('invalid_output', this.id, 'ChatGPT returned an empty completion.')
    }
    return { text: result.text, modelId: model, providerId: this.id, finishReason: 'stop' }
  }

  async streamText(
    request: GenerationRequest,
    callbacks: StreamCallbacks,
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      // The SDK collects the stream and resolves on response.completed; we
      // forward the completed text. (Incremental deltas require the SDK's
      // streaming hook, which is added when the SDK is present.)
      const result = await this.generateText(request, signal)
      callbacks.onDelta(result.text)
      callbacks.onDone(result)
    } catch (error) {
      callbacks.onError(
        error instanceof ProviderError
          ? error
          : new ProviderError('unavailable', this.id, 'ChatGPT request failed.'),
      )
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const client = await this.loadSdk()
    if (!client) {
      return {
        available: false,
        authenticated: false,
        detail: 'Official OpenAI sign-in SDK not installed. ChatGPT plan usage is unavailable.',
        checkedAt: new Date().toISOString(),
      }
    }
    try {
      const session = await client.getSession()
      return {
        available: true,
        authenticated: session.sharing === true,
        detail: session.sharing
          ? 'Connected · using your ChatGPT plan'
          : 'Signed in · plan usage not enabled',
        checkedAt: new Date().toISOString(),
      }
    } catch {
      return {
        available: true,
        authenticated: false,
        detail: 'SDK present · not signed in',
        checkedAt: new Date().toISOString(),
      }
    }
  }

  async supportsPlanUsage(): Promise<boolean> {
    return true
  }
}
