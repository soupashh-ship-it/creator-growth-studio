import { describe, expect, it } from 'vitest'
import { generateWithFallback, orderProviders } from '@providers/router'
import {
  ProviderError,
  type AIProvider,
  type ModelInfo,
  type ProviderId,
} from '@providers/types'

const capable = (vision: boolean, structuredOutput = true): ModelInfo => ({
  id: 'm',
  displayName: 'm',
  capabilities: {
    text: true,
    vision,
    reasoning: true,
    largeContext: true,
    structuredOutput,
    streaming: true,
  },
})

function fake(
  id: ProviderId,
  opts: { available?: boolean; fail?: boolean; models?: ModelInfo[]; cancel?: boolean } = {},
): AIProvider {
  return {
    id,
    displayName: id,
    authenticate: async () => ({ ok: true }),
    disconnect: async () => undefined,
    isAvailable: async () => opts.available ?? true,
    getModels: async () => opts.models ?? [],
    generateText: async () => {
      if (opts.cancel) throw new ProviderError('cancelled', id, 'cancelled')
      if (opts.fail) throw new ProviderError('unavailable', id, 'boom')
      return { text: `from ${id}`, modelId: 'm', providerId: id, finishReason: 'stop' as const }
    },
    streamText: async () => undefined,
    healthCheck: async () => ({ available: true, authenticated: true, detail: '', checkedAt: '' }),
  }
}

const req = { task: 'chat' as const, input: 'hello' }

describe('router ordering', () => {
  it('uses task defaults in auto mode', () => {
    expect(orderProviders('bulk-tagging', { choice: 'auto' })[0]).toBe('ollama')
    expect(orderProviders('deep-research', { choice: 'auto' })[0]).toBe('chatgpt')
  })

  it('honours a manual override over the defaults', () => {
    expect(orderProviders('deep-research', { choice: 'ollama' })).toEqual(['ollama'])
  })
})

describe('fallback chain', () => {
  it('falls through to the next provider when the first fails', async () => {
    const registry = new Map<ProviderId, AIProvider>([
      ['chatgpt', fake('chatgpt', { fail: true })],
      ['gemini', fake('gemini')],
    ])
    const outcome = await generateWithFallback(registry, req, { choice: 'auto' })
    expect(outcome.result.providerId).toBe('gemini')
    expect(outcome.attempts).toHaveLength(2)
    expect(outcome.attempts[0]).toMatchObject({ providerId: 'chatgpt', ok: false })
  })

  it('skips unavailable providers', async () => {
    const registry = new Map<ProviderId, AIProvider>([
      ['chatgpt', fake('chatgpt', { available: false })],
      ['gemini', fake('gemini')],
    ])
    const outcome = await generateWithFallback(registry, req, { choice: 'auto' })
    expect(outcome.result.providerId).toBe('gemini')
    expect(outcome.attempts[0]!.error?.code).toBe('unavailable')
  })

  it('requires a vision model for thumbnail reasoning', async () => {
    const registry = new Map<ProviderId, AIProvider>([
      ['chatgpt', fake('chatgpt', { models: [capable(false)] })],
      ['gemini', fake('gemini', { models: [capable(true)] })],
    ])
    const outcome = await generateWithFallback(
      registry,
      { task: 'thumbnail-reasoning', input: 'x' },
      { choice: 'auto' },
    )
    expect(outcome.result.providerId).toBe('gemini')
    expect(outcome.attempts[0]!.error?.code).toBe('permission_missing')
  })

  it('fails only when every provider fails, with reasons recorded', async () => {
    const registry = new Map<ProviderId, AIProvider>([
      ['chatgpt', fake('chatgpt', { fail: true })],
      ['gemini', fake('gemini', { fail: true })],
      ['lmstudio', fake('lmstudio', { available: false })],
      ['ollama', fake('ollama', { available: false })],
    ])
    await expect(generateWithFallback(registry, req, { choice: 'auto' })).rejects.toBeInstanceOf(
      ProviderError,
    )
  })

  it('stops immediately on user cancellation', async () => {
    const registry = new Map<ProviderId, AIProvider>([
      ['chatgpt', fake('chatgpt', { cancel: true })],
      ['gemini', fake('gemini')],
    ])
    await expect(generateWithFallback(registry, req, { choice: 'auto' })).rejects.toMatchObject({
      code: 'cancelled',
    })
  })
})
