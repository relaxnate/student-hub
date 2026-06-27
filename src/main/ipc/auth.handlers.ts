import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { OAuthManager } from '../services/auth/OAuthManager'
import { getProviderOAuth, isProviderConnectable, isProviderBeta, betaIntegrationsEnabled } from '../integrations/oauth-config'
import type { StartOAuthPayload, ConnectWithTokenPayload, ConnectCalendarFeedPayload } from '@shared/types/ipc'

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

  // ── Calendar feed (.ics) — the universal "paste your feed URL" path ────────
  ipcMain.handle(IPC.AUTH.CONNECT_CALENDAR_FEED, async (_event, payload: ConnectCalendarFeedPayload) => {
    try {
      const feedUrl = (payload.feedUrl ?? '').trim()
      if (!feedUrl) return { ok: false, error: 'Paste your calendar feed URL first.' }
      if (!/^(https?|webcal):\/\//i.test(feedUrl)) {
        return { ok: false, error: 'That doesn\'t look like a feed URL — it should start with https:// or webcal://' }
      }
      const integration = await oauthManager.connectCalendarFeed(feedUrl, payload.label?.trim() || undefined)
      return { ok: true, data: integration }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('VCALENDAR') || msg.includes('calendar')) {
        return { ok: false, error: 'That URL didn\'t return a calendar. Make sure you copied the iCal/ICS feed URL (not the web page).' }
      }
      if (msg.includes('fetch') || msg.includes('network') || msg.includes('ENOTFOUND') || msg.includes('ECONN')) {
        return { ok: false, error: 'Could not reach that URL. Check the address and your internet connection.' }
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
      // Beta gate: even with a client ID, sensitive-scope providers stay off
      // until the owner enables the beta (protects Google's 100-user cap).
      if (isProviderBeta(provider) && !betaIntegrationsEnabled()) {
        return { ok: false, error: `${provider} is in limited beta and isn't enabled in this build. (Owner: set STUDENTHUB_ENABLE_BETA_INTEGRATIONS=1 or betaIntegrationsEnabled in oauth-config.ts.)` }
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

  // Which OAuth providers are connectable in this build (client ID configured
  // AND, for sensitive-scope beta providers, the beta gate enabled).
  ipcMain.handle(IPC.AUTH.OAUTH_STATUS, () => {
    try {
      return {
        ok: true,
        data: {
          'google-classroom': isProviderConnectable('google-classroom'),
          'microsoft-teams':  isProviderConnectable('microsoft-teams'),
        } as Record<string, boolean>,
      }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
}
