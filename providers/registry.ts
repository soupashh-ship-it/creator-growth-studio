import type { AIProvider, ProviderId } from './types'
import { OllamaProvider } from './local-ai/ollama'
import { LmStudioProvider } from './local-ai/lmstudio'
import { GeminiCliProvider } from './gemini/gemini-cli'
import { ChatGPTProvider } from './openai/chatgpt'

/**
 * Builds the set of available providers. Every provider is always present in
 * the registry; availability is probed at call time so the router's fallback
 * chain can explain why a provider was skipped (spec §7, §81).
 */
export function createProviderRegistry(): Map<ProviderId, AIProvider> {
  const providers: AIProvider[] = [
    new ChatGPTProvider(),
    new GeminiCliProvider(),
    new OllamaProvider(),
    new LmStudioProvider(),
  ]
  return new Map(providers.map((p) => [p.id, p]))
}
