import { z } from 'zod'
import { asUntrustedData, definePrompt } from './registry'

/**
 * Structured deep research (spec §60–61).
 *
 * The creator supplies research material (articles, patch notes, public pages
 * they have read). The model must return findings as structured cards that
 * separate SOURCED facts from SPECULATION and never invent analytics figures,
 * search volume or competitor numbers. The app parses the model output into
 * typed findings; anything that fails to parse is shown raw rather than dropped.
 */

export const researchFindingSchema = z.object({
  /** One sentence claim. */
  claim: z.string(),
  /** Where the claim comes from — a named source, "local briefing", or "model prior". */
  source: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  /** Whether the claim is grounded in the supplied material or is speculation. */
  basis: z.enum(['sourced', 'speculation']),
})

export const deepResearchSchema = z.object({
  summary: z.string(),
  findings: z.array(researchFindingSchema),
  openQuestions: z.array(z.string()),
  confidence: z.enum(['high', 'medium', 'low']),
})

export type ResearchFinding = z.infer<typeof researchFindingSchema>
export type DeepResearchOutput = z.infer<typeof deepResearchSchema>

export interface DeepResearchInput {
  question: string
  material: string
  briefing?: string
}

export const deepResearchPrompt = definePrompt<DeepResearchOutput>({
  name: 'deep-research',
  version: 1,
  date: '2026-10-01',
  schema: deepResearchSchema,
  build(input) {
    const ctx = input as DeepResearchInput
    return {
      system:
        'You are a research analyst for a content creator. Work only from the supplied research material and the ' +
        'local data briefing. For every finding, name the source it came from and mark its basis as "sourced" or ' +
        '"speculation" honestly. Never invent analytics figures, search volume, viewer counts or competitor numbers; ' +
        'if something is missing, put it in openQuestions instead. Return ONLY JSON matching: ' +
        '{ "summary": string, "findings": [{ "claim": string, "source": string, "confidence": "high"|"medium"|"low", ' +
        '"basis": "sourced"|"speculation" }], "openQuestions": string[], "confidence": "high"|"medium"|"low" }.',
      user:
        (ctx.briefing ? `LOCAL DATA BRIEFING (trusted, computed by the app):\n${ctx.briefing}\n\n` : '') +
        asUntrustedData('research_material', ctx.material) +
        '\n\nRESEARCH QUESTION: ' +
        ctx.question.trim(),
    }
  },
})

/**
 * Extracts the first well-formed deep-research object from model text.
 *
 * Models wrap JSON in prose or ```json fences, so we try fenced blocks first,
 * then the outermost braces, then the raw text. Returns null when nothing
 * validates — callers then fall back to showing the raw response.
 */
export function parseDeepResearch(text: string): DeepResearchOutput | null {
  const candidates: string[] = []

  const fence = /```(?:json)?\s*([\s\S]*?)```/gi
  let match: RegExpExecArray | null
  while ((match = fence.exec(text)) !== null) {
    if (match[1]) candidates.push(match[1])
  }

  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1))
  candidates.push(text)

  for (const candidate of candidates) {
    try {
      const parsed = deepResearchSchema.safeParse(JSON.parse(candidate.trim()))
      if (parsed.success) return parsed.data
    } catch {
      // Try the next candidate.
    }
  }
  return null
}

/** Counts how many findings are grounded vs speculative (for the UI summary). */
export function summarizeFindings(output: DeepResearchOutput): {
  sourced: number
  speculation: number
} {
  let sourced = 0
  let speculation = 0
  for (const finding of output.findings) {
    if (finding.basis === 'sourced') sourced += 1
    else speculation += 1
  }
  return { sourced, speculation }
}
