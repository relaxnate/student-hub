import type { IntegrationProvider } from '@shared/types/entities'
import type { IntegrationAdapter } from './base/IntegrationAdapter'
import { CanvasAdapter } from './canvas/CanvasAdapter'
import { GoogleClassroomAdapter } from './google-classroom/GoogleClassroomAdapter'
import { MicrosoftTeamsAdapter } from './microsoft-teams/MicrosoftTeamsAdapter'
import { MoodleAdapter } from './moodle/MoodleAdapter'
import { getProviderOAuth } from './oauth-config'

const adapters = new Map<string, IntegrationAdapter>()

export function createAdapter(
  provider: IntegrationProvider,
  baseUrl: string,
  clientId: string
): IntegrationAdapter {
  switch (provider) {
    case 'canvas':
      return new CanvasAdapter(baseUrl, clientId)

    case 'google-classroom':
    case 'google-calendar':
      return new GoogleClassroomAdapter(clientId, getProviderOAuth(provider).clientSecret)

    case 'microsoft-teams':
    case 'outlook-calendar':
      return new MicrosoftTeamsAdapter(clientId, getProviderOAuth(provider).tenantId || 'common')

    // Moodle: token + base URL (like Canvas's PAT), connected via connectWithToken.
    case 'moodle':
      return new MoodleAdapter(baseUrl)

    // Higher-friction platforms (deferred — see 06 - Research/Additional Platforms Notes):
    // case 'blackboard':  return new BlackboardAdapter(baseUrl, clientId)  // OAuth2 3LO + Anthology portal app
    // case 'schoology':   return new SchoologyAdapter(clientId)            // OAuth 1.0a + admin-issued keys

    default:
      throw new Error(`No adapter implemented for provider: ${provider}`)
  }
}

export function registerAdapter(integrationId: string, adapter: IntegrationAdapter): void {
  adapters.set(integrationId, adapter)
}

export function getAdapter(integrationId: string): IntegrationAdapter | undefined {
  return adapters.get(integrationId)
}

export function getAllAdapters(): Map<string, IntegrationAdapter> {
  return adapters
}

export function removeAdapter(integrationId: string): void {
  adapters.delete(integrationId)
}

export function requiresBaseUrl(provider: IntegrationProvider): boolean {
  return provider === 'canvas' || provider === 'moodle'
}
