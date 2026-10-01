import { describe, expect, it } from 'vitest'
import {
  bufferToEmbedding,
  chunkText,
  cosineSimilarity,
  embeddingToBuffer,
  rankBySimilarity,
} from '@core/vectors'

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6)
  })

  it('is 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0)
  })

  it('is -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 6)
  })

  it('returns 0 for mismatched lengths or a zero vector', () => {
    expect(cosineSimilarity([1, 2], [1])).toBe(0)
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0)
    expect(cosineSimilarity([], [])).toBe(0)
  })
})

describe('embedding serialization', () => {
  it('round-trips a vector through a float32 buffer', () => {
    const original = [0.25, -1.5, 3.75, 0]
    const restored = bufferToEmbedding(embeddingToBuffer(original))
    expect(restored).toHaveLength(4)
    restored.forEach((value, index) => expect(value).toBeCloseTo(original[index] as number, 5))
  })

  it('returns [] for empty or malformed buffers', () => {
    expect(bufferToEmbedding(null)).toEqual([])
    expect(bufferToEmbedding(new Uint8Array([1, 2, 3]))).toEqual([])
  })
})

describe('rankBySimilarity', () => {
  const chunks = [
    { id: 'a', docId: 'doc1', text: 'lightning arrow build', embedding: [1, 0] },
    { id: 'b', docId: 'doc2', text: 'cozy farming tour', embedding: [0, 1] },
    { id: 'c', docId: 'doc3', text: 'bow build guide', embedding: [0.9, 0.1] },
  ]

  it('orders matches by score and drops weak ones', () => {
    const matches = rankBySimilarity([1, 0], chunks, { minScore: 0.5 })
    expect(matches.map((m) => m.chunkId)).toEqual(['a', 'c'])
    expect(matches[0]?.score).toBeGreaterThan(matches[1]?.score ?? 0)
  })

  it('respects the limit', () => {
    const matches = rankBySimilarity([1, 0], chunks, { minScore: 0, limit: 1 })
    expect(matches).toHaveLength(1)
  })
})

describe('chunkText', () => {
  it('returns the whole short text as one chunk', () => {
    expect(chunkText('short note')).toEqual(['short note'])
  })

  it('returns nothing for blank text', () => {
    expect(chunkText('   ')).toEqual([])
  })

  it('splits long text into overlapping chunks', () => {
    const sentence = 'This is a sentence about the build. '
    const long = sentence.repeat(120).trim()
    const chunks = chunkText(long, 300, 50)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((chunk) => chunk.length <= 320)).toBe(true)
    expect(chunks.join(' ').length).toBeGreaterThan(long.length)
  })
})
