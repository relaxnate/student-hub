import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { OAuthManager } from '../services/auth/OAuthManager'
import { getProviderOAuth, isOAuthConfigured } from '../integrations/oauth-config'
import type { StartOAuthPayload, ConnectWithTokenPayload } from '@shared/types/ipc'

export function registerAuthHandlers(oauthManager: OAuthManager): void {

  // ── Personal Access Token (the student path — no admin, no OAuth) ─────────
  ipcMain.handle(IPC.AUTH.CONNECT_WITH_TOKEN, async (_event, payload: ConnectWithTokenPayload) => {
    try {
      const { provider, baseUrl, token } = payload
      if (!token.trim()) return { ok: false, error: 'Token is empty.' }
      if (!baseUrl.trim()) return { ok: false, error: 'Canvas URL is required.' }
      const integration = await oauthManager.connectWithToken(provider, baseUrl.trim(), token.trim())
      return { ok: true, data: integration }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Give students an actionable error message
      if (msg.includes('401') || msg.includes('unauthorized') || msg.toLowerCase().includes('invalid')) {
        return { ok: false, error: 'Token rejected — check that it was copied correctly and hasn\'t expired.' }
      }
      if (msg.includes('fetch') || msg.includes('network') || msg.includes('ENOTFOUND')) {
        return { ok: false, error: 'Could not reach that Canvas URL. Double-check the address and your internet connection.' }
      }
      return { ok: false, error: msg }
    }
  })

  // ── OAuth flow (for Google Classroom / Teams — requires app registration) ──
  ipcMain.handle(IPC.AUTH.START_OAUTH, async (_event, payload: StartOAuthPayload) => {
    try {
      const { provider, baseUrl = '' } = payload
      const clientId = getProviderOAuth(provider).clientId
      if (!clientId) {
        return { ok: false, error: `${provider} isn't set up yet — Student Hub needs its OAuth client ID configured for this build. (Owner: set it in src/main/integrations/oauth-config.ts or the GOOGLE_CLIENT_ID / MICROSOFT_CLIENT_ID env var.)` }
      }
      const integration = await oauthManager.startOAuth(provider, baseUrl, clientId)
      return { ok: true, data: integration }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC.AUTH.LOGOUT, async (_event, integrationId: string) => {
    try {
      await oauthManager.logout(integrationId)
      return { ok: true, data: null }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle(IPC.AUTH.GET_INTEGRATIONS, async () => {
    try {
      return { ok: true, data: oauthManager.getConnectedIntegrations() }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  // Which OAuth providers are connectable in this build (client ID configured).
  ipcMain.handle(IPC.AUTH.OAUTH_STATUS, () => {
    try {
      return {
        ok: true,
        data: {
          'google-classroom': isOAuthConfigured('google-classroom'),
          'microsoft-teams':  isOAuthConfigured('microsoft-teams'),
        } as Record<string, boolean>,
      }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
}
