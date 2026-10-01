import { bufferToEmbedding, embeddingToBuffer, rankBySimilarity } from '../core/vectors'
import type { AIProvider } from '../providers/types'
import { getServices } from './services'

/**
 * Semantic knowledge search (spec §142).
 *
 * Embeddings are produced ONLY by a local provider (Ollama today) and stored on
 * this machine as float32 BLOBs. When no local embedding provider is available
 * the app falls back to the FTS index — semantic search is an enhancement, not a
 * requirement, and text is never sent to a remote API for embedding here.
 */

interface EmbeddingProvider {
  provider: AIProvider
  providerId: string
}

function embeddingProvider(): EmbeddingProvider | null {
  for (const provider of getServices().providers.values()) {
    if (typeof provider.embedTexts === 'function') return { provider, providerId: provider.id }
  }
  return null
}

export interface VectorStatus {
  available: boolean
  providerId: string | null
  totalChunks: number
  embeddedChunks: number
  detail: string
}

export function getVectorStatus(workspaceId: string): VectorStatus {
  const chunks = getServices().repos.listKnowledgeChunks(workspaceId)
  const embedded = chunks.filter((chunk) => chunk.embedding && chunk.embedding.byteLength > 0).length
  const provider = embeddingProvider()
  return {
    available: provider !== null,
    providerId: provider?.providerId ?? null,
    totalChunks: chunks.length,
    embeddedChunks: embedded,
    detail: provider
      ? `${embedded}/${chunks.length} chunk(s) embedded locally with ${provider.providerId}.`
      : 'No local embedding provider is available. Install and start Ollama with an embedding model to enable semantic search; keyword (FTS) search still works.',
  }
}

export async function indexKnowledge(
  workspaceId: string,
): Promise<{ embedded: number; providerId: string; modelId: string }> {
  const provider = embeddingProvider()
  if (!provider) {
    throw new Error(
      'No local embedding provider is available. Install and start Ollama with an embedding model, then try again.',
    )
  }
  const { repos } = getServices()
  const chunks = repos
    .listKnowledgeChunks(workspaceId)
    .filter((chunk) => !chunk.embedding || chunk.embedding.byteLength === 0)
  if (chunks.length === 0) {
    return { embedded: 0, providerId: provider.providerId, modelId: '' }
  }

  const { modelId, embeddings } = await provider.provider.embedTexts!(chunks.map((chunk) => chunk.chunk))
  chunks.forEach((chunk, index) => {
    const vector = embeddings[index]
    if (vector && vector.length > 0) {
      repos.setKnowledgeChunkEmbedding(chunk.id, embeddingToBuffer(vector))
    }
  })
  return { embedded: chunks.length, providerId: provider.providerId, modelId }
}

export interface SemanticHit {
  id: string
  title: string
  snippet: string
  score: number
}

export interface SemanticSearchResult {
  hits: SemanticHit[]
  used: boolean
  detail: string
}

/**
 * Ranks knowledge chunks against the query by cosine similarity. Returns
 * `used: false` when there is nothing to rank (no provider / not indexed), so
 * callers can fall back to FTS without showing a false empty result.
 */
export async function semanticSearch(
  workspaceId: string,
  query: string,
  limit = 8,
): Promise<SemanticSearchResult> {
  const provider = embeddingProvider()
  if (!provider) return { hits: [], used: false, detail: 'no-embedding-provider' }

  const { repos } = getServices()
  const chunks = repos
    .listKnowledgeChunks(workspaceId)
    .map((chunk) => ({
      id: chunk.id,
      docId: chunk.doc_id,
      title: chunk.title,
      text: chunk.chunk,
      embedding: bufferToEmbedding(chunk.embedding),
    }))
    .filter((chunk) => chunk.embedding.length > 0)
  if (chunks.length === 0) return { hits: [], used: false, detail: 'not-indexed' }

  const { embeddings } = await provider.provider.embedTexts!([query])
  const queryVector = embeddings[0]
  if (!queryVector || queryVector.length === 0) {
    return { hits: [], used: false, detail: 'embedding-failed' }
  }

  const matches = rankBySimilarity(queryVector, chunks, { limit })
  const hits = matches.map((match) => {
    const chunk = chunks.find((candidate) => candidate.id === match.chunkId)
    return {
      id: chunk?.docId ?? '',
      title: chunk?.title ?? '(untitled)',
      snippet: (chunk?.text ?? '').slice(0, 320),
      score: Math.round(match.score * 1000) / 1000,
    }
  })
  return { hits, used: true, detail: `semantic (${provider.providerId})` }
}
