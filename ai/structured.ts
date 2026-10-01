import type { ZodType } from 'zod'
import { ProviderError, type AIProvider, type GenerationRequest, type GenerationResult } from '../providers/types'

/**
 * Structured AI output (spec §84).
 *
 * Generation is validated against a schema before it is ever saved. On invalid
 * output we retry once with a corrective instruction, then fail with a typed
 * `invalid_output` error — the UI never crashes and never stores junk.
 */
export interface StructuredOptions {
  maxRetries?: number
}

export interface StructuredResult<T> {
  data: T
  raw: GenerationResult
  attempts: number
}

/** Extracts the first balanced JSON object/array from a model response. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    // fall through to brace scanning
  }

  const start = trimmed.search(/[[{]/)
  if (start === -1) throw new Error('No JSON found in response.')

  const open = trimmed[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < trimmed.length; i += 1) {
    const ch = trimmed[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === open) depth += 1
    else if (ch === close) {
      depth -= 1
      if (depth === 0) {
        return JSON.parse(trimmed.slice(start, i + 1))
      }
    }
  }
  throw new Error('Unbalanced JSON in response.')
}

export async function generateStructured<T>(
  provider: AIProvider,
  request: GenerationRequest,
  schema: ZodType<T>,
  options: StructuredOptions = {},
): Promise<StructuredResult<T>> {
  const maxRetries = options.maxRetries ?? 1
  let attempts = 0
  let lastError = ''
  let input = request.input

  while (attempts <= maxRetries) {
    attempts += 1
    const result = await provider.generateText({ ...request, input })
    try {
      const parsed = extractJson(result.text)
      const validated = schema.parse(parsed)
      return { data: validated, raw: result, attempts }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      if (attempts > maxRetries) break
      input = `${request.input}\n\nYour previous response could not be parsed as valid JSON matching the schema (${lastError}). Reply with ONLY valid JSON and nothing else.`
    }
  }

  throw new ProviderError(
    'invalid_output',
    provider.id,
    'The model did not return valid structured output after retrying.',
    lastError,
  )
}
