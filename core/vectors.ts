/**
 * Local vector search utilities (spec §142).
 *
 * Embeddings are produced by a LOCAL provider (Ollama today) and stored on-device
 * as a float32 BLOB. Everything here is pure and deterministic so it can be
 * tested without a model: similarity, ranking and the binary (de)serialization.
 *
 * When no embedding provider is available the knowledge base falls back to the
 * FTS index, so semantic search is an enhancement, never a requirement.
 */

export interface EmbeddedChunk {
  id: string
  docId: string
  text: string
  embedding: number[]
}

export interface VectorMatch {
  docId: string
  chunkId: string
  text: string
  /** Cosine similarity in [-1, 1]; higher is closer. */
  score: number
}

/** Cosine similarity of two vectors. Returns 0 for empty or mismatched inputs. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i += 1) {
    const av = a[i] as number
    const bv = b[i] as number
    dot += av * bv
    normA += av * av
    normB += bv * bv
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/** Ranks chunks against a query embedding, best first, dropping weak matches. */
export function rankBySimilarity(
  query: number[],
  chunks: EmbeddedChunk[],
  options: { limit?: number; minScore?: number } = {},
): VectorMatch[] {
  const limit = options.limit ?? 8
  const minScore = options.minScore ?? 0.2
  return chunks
    .map((chunk) => ({
      docId: chunk.docId,
      chunkId: chunk.id,
      text: chunk.text,
      score: cosineSimilarity(query, chunk.embedding),
    }))
    .filter((match) => match.score >= minScore)
    .sort((a, b) => b.score - a.score || a.chunkId.localeCompare(b.chunkId))
    .slice(0, limit)
}

/** Encodes a vector as a little-endian float32 buffer for BLOB storage. */
export function embeddingToBuffer(embedding: number[]): Buffer {
  const buffer = Buffer.allocUnsafe(embedding.length * 4)
  for (let i = 0; i < embedding.length; i += 1) {
    buffer.writeFloatLE(embedding[i] as number, i * 4)
  }
  return buffer
}

/** Decodes a float32 BLOB back into a vector. Returns [] for empty/odd buffers. */
export function bufferToEmbedding(buffer: Uint8Array | null | undefined): number[] {
  if (!buffer || buffer.byteLength === 0 || buffer.byteLength % 4 !== 0) return []
  const view = Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  const out: number[] = new Array(buffer.byteLength / 4)
  for (let i = 0; i < out.length; i += 1) out[i] = view.readFloatLE(i * 4)
  return out
}

/**
 * Splits long text into overlapping chunks on paragraph/sentence boundaries.
 * Used when a document is large enough that one embedding would blur its topic.
 */
export function chunkText(text: string, maxChars = 1200, overlapChars = 150): string[] {
  const clean = text.trim()
  if (clean.length <= maxChars) return clean ? [clean] : []
  const chunks: string[] = []
  let start = 0
  while (start < clean.length) {
    let end = Math.min(start + maxChars, clean.length)
    if (end < clean.length) {
      const window = clean.slice(start, end)
      const breakAt = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('. '))
      if (breakAt > maxChars * 0.5) end = start + breakAt + 1
    }
    chunks.push(clean.slice(start, end).trim())
    if (end >= clean.length) break
    start = Math.max(end - overlapChars, start + 1)
  }
  return chunks.filter((chunk) => chunk.length > 0)
}
