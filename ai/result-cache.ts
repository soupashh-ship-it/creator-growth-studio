import { createHash } from 'node:crypto'
import type { Repositories } from '../database/repositories'
import type { GenerationRequest, GenerationResult } from '../providers/types'

/**
 * AI result cache (spec §79, §83).
 *
 * Two independent facts decide whether a cached result may be reused:
 *   1. the *inputs* — hashed, including the system prompt, schema and images;
 *   2. the *prompt definition* — its name and version.
 *
 * Editing a prompt therefore invalidates every prior result even when the user
 * input is byte-identical, and a user can always force a fresh answer with
 * "Regenerate".
 */
export interface PromptRef {
  name: string
  version: number
}

export interface CachedGeneration {
  text: string
  providerId: string
  modelId: string
  promptName: string
  promptVersion: number
  cachedAt: string
}

/**
 * Hashes everything that can change the answer. Images are hashed by content so
 * a re-encoded but identical image still hits.
 */
export function hashGenerationRequest(request: GenerationRequest): string {
  const normalized = {
    task: request.task,
    model: request.model ?? null,
    system: request.system ?? null,
    input: request.input,
    jsonSchema: request.jsonSchema ?? null,
    temperature: request.temperature ?? null,
    maxTokens: request.maxTokens ?? null,
    images: (request.images ?? []).map((image) => createHash('sha256').update(image).digest('hex')),
  }
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex')
}

export class AiResultCache {
  constructor(private readonly repos: Repositories) {}

  lookup(request: GenerationRequest, prompt: PromptRef): CachedGeneration | null {
    const row = this.repos.findAiCacheEntry({
      inputHash: hashGenerationRequest(request),
      promptName: prompt.name,
      promptVersion: prompt.version,
    })
    if (!row) return null
    let text: string
    try {
      const parsed = JSON.parse(row.result_json) as { text?: string }
      text = typeof parsed.text === 'string' ? parsed.text : row.result_json
    } catch {
      text = row.result_json
    }
    return {
      text,
      providerId: row.provider,
      modelId: row.model,
      promptName: prompt.name,
      promptVersion: prompt.version,
      cachedAt: row.created_at,
    }
  }

  store(request: GenerationRequest, prompt: PromptRef, result: GenerationResult): void {
    this.repos.upsertAiCacheEntry({
      inputHash: hashGenerationRequest(request),
      promptName: prompt.name,
      promptVersion: prompt.version,
      provider: result.providerId,
      model: result.modelId,
      resultJson: JSON.stringify({ text: result.text }),
    })
  }

  clear(): number {
    return this.repos.clearAiCache()
  }
}
