import { afterEach, describe, expect, it, vi } from 'vitest'
import { OllamaProvider } from '@providers/local-ai/ollama'

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('OllamaProvider', () => {
  it('detects the server and lists models with capabilities', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).endsWith('/api/tags')) {
          return json({ models: [{ name: 'qwen2.5:7b' }, { model: 'llava:13b' }] })
        }
        throw new Error(`unexpected url ${url}`)
      }),
    )

    const provider = new OllamaProvider()
    expect(await provider.isAvailable()).toBe(true)
    const models = await provider.getModels()
    expect(models.map((m) => m.id)).toEqual(['qwen2.5:7b', 'llava:13b'])
    expect(models[1]!.capabilities.vision).toBe(true)
  })

  it('generates text and reports token usage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).endsWith('/api/tags')) return json({ models: [{ name: 'qwen2.5:7b' }] })
        return json({ message: { content: 'hello there' }, prompt_eval_count: 5, eval_count: 2 })
      }),
    )

    const provider = new OllamaProvider()
    const result = await provider.generateText({ task: 'chat', input: 'hi' })
    expect(result.text).toBe('hello there')
    expect(result.providerId).toBe('ollama')
    expect(result.usage).toEqual({ inputTokens: 5, outputTokens: 2 })
  })

  it('reports not_configured when the server has no models', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ models: [] })),
    )
    const provider = new OllamaProvider()
    await expect(provider.generateText({ task: 'chat', input: 'hi' })).rejects.toMatchObject({
      code: 'not_configured',
    })
  })

  it('is unavailable and never fabricates output when the server is down', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed')
      }),
    )
    const provider = new OllamaProvider()
    expect(await provider.isAvailable()).toBe(false)
    const health = await provider.healthCheck()
    expect(health.available).toBe(false)
    await expect(provider.generateText({ task: 'chat', input: 'hi' })).rejects.toMatchObject({
      code: 'offline',
    })
  })
})
