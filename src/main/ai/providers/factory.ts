// Pure adapter factory + static provider catalogue. Kept dependency-free (no DB,
// no AIKeyService) so both the registry and AIKeyService can import it without a
// circular dependency.
import type { AIProviderAdapter } from '../AIProviderAdapter'
import type { AIProvider, AIProviderId } from '@shared/types/entities'
import { StudentHubAdapter } from './StudentHubAdapter'
import { FreeTierAdapter } from './FreeTierAdapter'
import { OpenRouterAdapter } from './OpenRouterAdapter'
import { AnthropicAdapter } from './AnthropicAdapter'
import { OpenAIAdapter } from './OpenAIAdapter'
import { GoogleAdapter } from './GoogleAdapter'
import { GroqAdapter } from './GroqAdapter'

/** Build a live adapter for a provider with the given key (null for keyless providers). */
export function buildAdapter(provider: AIProviderId, apiKey: string | null): AIProviderAdapter {
  switch (provider) {
    case 'studenthub': return new StudentHubAdapter()
    case 'free':       return new FreeTierAdapter(apiKey)
    case 'openrouter': return new OpenRouterAdapter(apiKey ?? '')
    case 'anthropic':  return new AnthropicAdapter(apiKey ?? '')
    case 'openai':     return new OpenAIAdapter(apiKey ?? '')
    case 'google':     return new GoogleAdapter(apiKey ?? '')
    case 'groq':       return new GroqAdapter(apiKey ?? '')
    default:           throw new Error(`Unknown AI provider: ${provider}`)
  }
}

// Static capability metadata for the provider list (without needing a key).
// isConnected is filled in by the registry from AIKeyService.
export const PROVIDER_CATALOG: Omit<AIProvider, 'isConnected'>[] = [
  { id: 'studenthub', displayName: 'Student Hub AI (free · offline)', supportsVision: false, supportsTools: false, contextWindow: 0, isFree: true },
  { id: 'free',       displayName: 'Free (Student Hub)', supportsVision: true,  supportsTools: true,  contextWindow: 64_000,    isFree: true },
  { id: 'openrouter', displayName: 'OpenRouter',         supportsVision: true,  supportsTools: true,  contextWindow: 128_000,   isFree: false },
  { id: 'anthropic',  displayName: 'Anthropic (Claude)', supportsVision: true,  supportsTools: true,  contextWindow: 200_000,   isFree: false },
  { id: 'openai',     displayName: 'OpenAI',             supportsVision: true,  supportsTools: true,  contextWindow: 128_000,   isFree: false },
  { id: 'google',     displayName: 'Google (Gemini)',    supportsVision: true,  supportsTools: true,  contextWindow: 1_000_000, isFree: false },
  { id: 'groq',       displayName: 'Groq',               supportsVision: false, supportsTools: true,  contextWindow: 128_000,   isFree: false },
]

export const ALL_PROVIDER_IDS = PROVIDER_CATALOG.map(p => p.id)
