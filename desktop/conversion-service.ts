import { buildConversionFunnel, conversionSuggestions } from '../core/scores/conversion'
import { getServices } from './services'

/**
 * Conversion Studio service (spec §45). Reads the creator's own stored channel
 * totals and latest video snapshots — nothing is fetched live or invented.
 */
export interface ConversionStudioResult {
  funnel: {
    stages: Array<{
      key: string
      label: string
      numerator: number | null
      denominator: number | null
      rate: number | null
      source: string
      whyUnavailable?: string
    }>
    availableCount: number
    notes: string[]
  }
  suggestions: Array<{ title: string; detail: string }>
}

export function getConversionOverview(workspaceId: string): ConversionStudioResult {
  const { repos } = getServices()
  const channel = repos.listChannels(workspaceId).find((c) => c.platform === 'youtube') ?? repos.listChannels(workspaceId)[0] ?? null
  const videos = repos.listVideos(workspaceId, 100)
  const funnel = buildConversionFunnel(channel, videos)
  return { funnel, suggestions: conversionSuggestions(funnel) }
}
