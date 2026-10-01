import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { extractJson, generateStructured } from '@ai/structured'
import type { AIProvider, ProviderId } from '@providers/types'

const schema = z.object({ score: z.number(), strengths: z.array(z.string()) })

function sequenceProvider(texts: string[]): { provider: AIProvider; calls: () => number } {
  let index = 0
  const provider: AIProvider = {
    id: 'ollama' as ProviderId,
    displayName: 'fake',
    authenticate: async () => ({ ok: true }),
    disconnect: async () => undefined,
    isAvailable: async () => true,
    getModels: async () => [],
    generateText: async () => {
      const text = texts[Math.min(index, texts.length - 1)] ?? ''
      index += 1
      return { text, modelId: 'm', providerId: 'ollama' as ProviderId, finishReason: 'stop' as const }
    },
    streamText: async () => undefined,
    healthCheck: async () => ({ available: true, authenticated: true, detail: '', checkedAt: '' }),
  }
  return { provider, calls: () => index }
}

describe('extractJson', () => {
  it('parses bare JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 })
  })

  it('parses JSON wrapped in prose or code fences', () => {
    expect(extractJson('Sure!\n```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })

  it('handles nested objects and string braces', () => {
    expect(extractJson('prefix {"a":{"b":"}"},"c":[1,2]} suffix')).toEqual({ a: { b: '}' }, c: [1, 2] })
  })

  it('throws when there is no JSON', () => {
    expect(() => extractJson('no json here')).toThrow()
  })
})

describe('generateStructured', () => {
  it('returns validated data on the first attempt', async () => {
    const { provider } = sequenceProvider(['{"score":87,"strengths":["clear"]}'])
    const result = await generateStructured(provider, { task: 'structured-extraction', input: 'x' }, schema)
    expect(result.data.score).toBe(87)
    expect(result.attempts).toBe(1)
  })

  it('retries once with a corrective instruction, then succeeds', async () => {
    const { provider, calls } = sequenceProvider(['not json', '{"score":50,"strengths":[]}'])
    const result = await generateStructured(provider, { task: 'structured-extraction', input: 'x' }, schema)
    expect(result.data.score).toBe(50)
    expect(result.attempts).toBe(2)
    expect(calls()).toBe(2)
  })

  it('throws a typed invalid_output error after retries fail', async () => {
    const { provider } = sequenceProvider(['nope', 'still nope'])
    await expect(
      generateStructured(provider, { task: 'structured-extraction', input: 'x' }, schema),
    ).rejects.toMatchObject({ code: 'invalid_output' })
  })
})
