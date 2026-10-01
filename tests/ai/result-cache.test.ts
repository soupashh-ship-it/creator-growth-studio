import { beforeEach, describe, expect, it } from 'vitest'
import { AiResultCache, hashGenerationRequest } from '@ai/result-cache'
import { openDatabase, type DatabaseSync } from '@database/connection'
import { runMigrations } from '@database/migrate'
import { migrations } from '@database/migrations'
import { Repositories } from '@database/repositories'
import type { GenerationRequest, GenerationResult } from '@providers/types'

const request: GenerationRequest = {
  task: 'title-generation',
  input: 'PoE 2 deadeye',
  system: 'You are a title assistant.',
}

const result: GenerationResult = {
  text: 'Best PoE 2 Deadeye Build',
  modelId: 'test-model',
  providerId: 'ollama',
  finishReason: 'stop',
}

let db: DatabaseSync
let repos: Repositories
let cache: AiResultCache

beforeEach(() => {
  db = openDatabase(':memory:')
  runMigrations(db, migrations)
  repos = new Repositories(db)
  cache = new AiResultCache(repos)
})

describe('hashGenerationRequest', () => {
  it('is stable for identical requests and changes with inputs', () => {
    expect(hashGenerationRequest(request)).toBe(hashGenerationRequest({ ...request }))
    expect(hashGenerationRequest(request)).not.toBe(
      hashGenerationRequest({ ...request, input: 'PoE 2 totem' }),
    )
    expect(hashGenerationRequest(request)).not.toBe(
      hashGenerationRequest({ ...request, system: 'Different system prompt.' }),
    )
  })

  it('changes when the task or schema changes', () => {
    const a = hashGenerationRequest(request)
    expect(a).not.toBe(hashGenerationRequest({ ...request, task: 'chat' }))
    expect(a).not.toBe(hashGenerationRequest({ ...request, jsonSchema: { type: 'object' } }))
  })
})

describe('AiResultCache', () => {
  it('misses before anything is stored, then hits', () => {
    const prompt = { name: 'title-generator', version: 1 }
    expect(cache.lookup(request, prompt)).toBeNull()
    cache.store(request, prompt, result)
    const hit = cache.lookup(request, prompt)
    expect(hit?.text).toBe('Best PoE 2 Deadeye Build')
    expect(hit?.providerId).toBe('ollama')
    expect(hit?.modelId).toBe('test-model')
    expect(hit?.promptVersion).toBe(1)
  })

  it('does not serve results from a superseded prompt version', () => {
    cache.store(request, { name: 'title-generator', version: 1 }, result)
    expect(cache.lookup(request, { name: 'title-generator', version: 2 })).toBeNull()
  })

  it('does not serve results across different prompt names', () => {
    cache.store(request, { name: 'title-generator', version: 1 }, result)
    expect(cache.lookup(request, { name: 'seo-analyzer', version: 1 })).toBeNull()
  })

  it('overwrites on regenerate instead of duplicating rows', () => {
    const prompt = { name: 'title-generator', version: 1 }
    cache.store(request, prompt, result)
    cache.store(request, prompt, { ...result, text: 'Regenerated title' })
    expect(cache.lookup(request, prompt)?.text).toBe('Regenerated title')
    const rows = db.prepare('SELECT COUNT(*) AS n FROM ai_result_cache').get() as { n: number }
    expect(rows.n).toBe(1)
  })

  it('clears every entry and reports how many were removed', () => {
    cache.store(request, { name: 'a', version: 1 }, result)
    cache.store({ ...request, input: 'other' }, { name: 'a', version: 1 }, result)
    expect(cache.clear()).toBe(2)
    expect(cache.lookup(request, { name: 'a', version: 1 })).toBeNull()
  })
})
