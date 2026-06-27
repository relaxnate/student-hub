// AI provider registry — the singleton that resolves provider ids to live
// adapters, mirroring integrations/registry.ts. Unlike LMS integrations (one
// adapter instance per connected account), AI adapters are cheap and stateless
// apart from their key, so we build them on demand from the current stored key
// (via AIKeyService) — this guarantees a key change is picked up immediately.
import type { AIProviderAdapter } from './AIProviderAdapter'
import type { AIProvider, AIProviderId } from '@shared/types/entities'
import { buildAdapter, PROVIDER_CATALOG } from './providers/factory'
import { freeKeyConfigured } from './providers/FreeTierAdapter'
import { aiKeyService } from './AIKeyService'

/**
 * Resolve a provider id to a usable adapter, or undefined when a BYOK provider
 * has no stored key. The free tier always builds (it carries its own funded key,
 * which may be owner-set on-device, env, or the build constant).
 */
export function getAdapter(providerId: string): AIProviderAdapter | undefined {
  // The built-in assistant needs no key and is always available.
  if (providerId === 'studenthub') return buildAdapter('studenthub', null)
  if (providerId === 'free') return buildAdapter('free', aiKeyService.getKey('free'))
  const meta = PROVIDER_CATALOG.find(p => p.id === providerId)
  if (!meta) return undefined
  const key = aiKeyService.getKey(providerId)
  if (!key) return undefined
  return buildAdapter(providerId as AIProviderId, key)
}

/** Provider catalogue with live connection status for the UI. */
export function getProviders(): AIProvider[] {
  return PROVIDER_CATALOG.map(p => ({
    ...p,
    isConnected:
      p.id === 'studenthub' ? true                                       // always on (no key, offline)
      : p.id === 'free'      ? freeKeyConfigured(aiKeyService.getKey('free'))
      :                        aiKeyService.hasKey(p.id),
  }))
}

/** Only providers that can actually be used right now (free + keyed BYOK). */
export function getConnectedAdapters(): AIProviderAdapter[] {
  return getProviders()
    .filter(p => p.isConnected)
    .map(p => getAdapter(p.id))
    .filter((a): a is AIProviderAdapter => !!a)
}
