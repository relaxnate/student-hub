import type { IntegrationProvider } from '@shared/types/entities'
import type { IntegrationAdapter } from './base/IntegrationAdapter'
import { CanvasAdapter } from './canvas/CanvasAdapter'
import { GoogleClassroomAdapter } from './google-classroom/GoogleClassroomAdapter'
import { MicrosoftTeamsAdapter } from './microsoft-teams/MicrosoftTeamsAdapter'

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
    case 'google-calendar': {
      const secret = process.env.GOOGLE_CLIENT_SECRET ?? ''
      return new GoogleClassroomAdapter(clientId, secret)
    }

    case 'microsoft-teams':
    case 'outlook-calendar': {
      const tenantId = process.env.MICROSOFT_TENANT_ID ?? 'common'
      return new MicrosoftTeamsAdapter(clientId, tenantId)
    }

    // Phase 4 adapters — scaffolded but not yet implemented:
    // case 'moodle':      return new MoodleAdapter(baseUrl, clientId)
    // case 'blackboard':  return new BlackboardAdapter(baseUrl, clientId)
    // case 'schoology':   return new SchoologyAdapter(clientId)

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
