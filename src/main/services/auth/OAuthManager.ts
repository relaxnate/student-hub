import { shell, BrowserWindow, app } from 'electron'
import crypto from 'crypto'
import { getDb } from '../../database'
import { createAdapter, registerAdapter } from '../../integrations/registry'
import { TokenStore } from './TokenStore'
import type { IntegrationProvider, Integration } from '@shared/types/entities'

// How long to wait for the user to complete the OAuth browser flow
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000  // 5 minutes

export class OAuthManager {
  private readonly tokenStore = new TokenStore()

  // Pending OAuth sessions awaiting the deep-link callback.
  // Key: state parameter (CSRF token).
  private pendingFlows = new Map<string, {
    provider:    IntegrationProvider
    baseUrl:     string
    clientId:    string
    resolve:     (integration: Integration) => void
    reject:      (err: Error) => void
    timeoutId:   ReturnType<typeof setTimeout>
  }>()

  /**
   * Start an OAuth flow for a provider.
   * Opens the authorization URL in the default browser and waits for the
   * deep-link callback (student-hub://oauth/<provider>/callback?code=...&state=...).
   */
  async startOAuth(
    provider: IntegrationProvider,
    baseUrl: string,
    clientId: string
  ): Promise<Integration> {
    const state = crypto.randomBytes(16).toString('hex')

    return new Promise<Integration>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingFlows.delete(state)
        reject(new Error('OAuth flow timed out — the browser window may have been closed.'))
      }, OAUTH_TIMEOUT_MS)

      this.pendingFlows.set(state, { provider, baseUrl, clientId, resolve, reject, timeoutId })

      // Build the URL and open it in the OS browser
      const adapter = createAdapter(provider, baseUrl, clientId)

      let authUrl: string
      if (provider === 'canvas') {
        const canvas = adapter as import('../../integrations/canvas/CanvasAdapter').CanvasAdapter
        authUrl = canvas.buildAuthorizationUrl(state)
      } else {
        const config = adapter.getOAuthConfig()
        const params = new URLSearchParams({
          client_id:     clientId,
          redirect_uri:  config.redirectUri,
          response_type: 'code',
          scope:         config.scopes.join(' '),
          state,
        })
        authUrl = `${config.authorizationUrl}?${params.toString()}`
      }

      shell.openExternal(authUrl)
    })
  }

  /**
   * Called when Electron intercepts a student-hub:// deep link.
   * Parses the code + state, exchanges for tokens, creates the integration record.
   */
  async handleCallback(url: string): Promise<void> {
    const parsed = new URL(url)
    // URL format: student-hub://oauth/<provider>/callback
    const provider = parsed.hostname === 'oauth'
      ? (parsed.pathname.split('/')[1] as IntegrationProvider)
      : null

    const code  = parsed.searchParams.get('code')
    const state = parsed.searchParams.get('state')
    const error = parsed.searchParams.get('error')

    if (!state) return

    const pending = this.pendingFlows.get(state)
    if (!pending) return  // stale or unknown state — ignore

    clearTimeout(pending.timeoutId)
    this.pendingFlows.delete(state)

    if (error || !code) {
      pending.reject(new Error(error ?? 'No authorization code received'))
      return
    }

    try {
      const adapter = createAdapter(pending.provider, pending.baseUrl, pending.clientId)
      const tokens  = await adapter.exchangeCodeForToken(code)

      const expiresAt = tokens.expiresIn
        ? Date.now() + tokens.expiresIn * 1000
        : null

      adapter.setTokens(tokens.accessToken, tokens.refreshToken, expiresAt)

      const profile = await adapter.fetchUserProfile()

      // Persist the integration
      const integrationId = `${pending.provider}-${profile.id}`
      const db = getDb()

      db.prepare(`
        INSERT INTO integrations
          (id, provider, base_url, user_id_external, user_name, user_email, connected_at, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(id) DO UPDATE SET
          base_url        = excluded.base_url,
          user_name       = excluded.user_name,
          user_email      = excluded.user_email,
          is_active       = 1
      `).run(
        integrationId,
        pending.provider,
        pending.baseUrl || null,
        profile.id,
        profile.name,
        profile.email,
        Date.now()
      )

      this.tokenStore.save(integrationId, {
        accessToken:  tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt,
      })

      registerAdapter(integrationId, adapter)

      const integration: Integration = {
        id:              integrationId,
        provider:        pending.provider,
        displayName:     `${adapter.displayName} — ${profile.name}`,
        baseUrl:         pending.baseUrl || null,
        userIdExternal:  profile.id,
        userName:        profile.name,
        userEmail:       profile.email,
        connectedAt:     Date.now(),
        lastSyncedAt:    null,
        isActive:        true,
      }

      pending.resolve(integration)
    } catch (err) {
      pending.reject(err instanceof Error ? err : new Error(String(err)))
    }
  }

  /**
   * Connect using a Personal Access Token (PAT) — no OAuth flow, no admin setup required.
   * Any Canvas student can generate a PAT from their own profile settings page.
   * Also works for any LMS that supports Bearer token auth.
   */
  async connectWithToken(
    provider: IntegrationProvider,
    baseUrl:  string,
    token:    string
  ): Promise<Integration> {
    // Create adapter with empty clientId — not needed for PAT
    const adapter = createAdapter(provider, baseUrl, '')
    adapter.setTokens(token, null, null)

    // Validate the token immediately — if wrong, this throws before we save anything
    const profile = await adapter.fetchUserProfile()

    const integrationId = `${provider}-${profile.id}`
    const db = getDb()

    db.prepare(`
      INSERT INTO integrations
        (id, provider, base_url, user_id_external, user_name, user_email, connected_at, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET
        base_url   = excluded.base_url,
        user_name  = excluded.user_name,
        user_email = excluded.user_email,
        is_active  = 1
    `).run(
      integrationId, provider, baseUrl || null,
      profile.id, profile.name, profile.email, Date.now()
    )

    // PAT has no expiry tracked (student may have set one, but Canvas doesn't expose it)
    this.tokenStore.save(integrationId, {
      accessToken:  token,
      refreshToken: null,
      expiresAt:    null,
    })

    registerAdapter(integrationId, adapter)

    return {
      id:             integrationId,
      provider,
      displayName:    `${adapter.displayName} — ${profile.name}`,
      baseUrl:        baseUrl || null,
      userIdExternal: profile.id,
      userName:       profile.name,
      userEmail:      profile.email,
      connectedAt:    Date.now(),
      lastSyncedAt:   null,
      isActive:       true,
    }
  }
  async logout(integrationId: string): Promise<void> {
    this.tokenStore.clear(integrationId)
    const db = getDb()
    db.prepare(`UPDATE integrations SET is_active = 0 WHERE id = ?`).run(integrationId)
  }

  getConnectedIntegrations(): Integration[] {
    const db = getDb()
    const rows = db.prepare(`
      SELECT * FROM integrations WHERE is_active = 1
    `).all() as Array<{
      id: string
      provider: IntegrationProvider
      base_url: string | null
      user_id_external: string | null
      user_name: string | null
      user_email: string | null
      connected_at: number
      last_synced_at: number | null
    }>

    return rows.map(r => ({
      id:             r.id,
      provider:       r.provider,
      displayName:    `${r.provider} — ${r.user_name ?? 'Unknown'}`,
      baseUrl:        r.base_url,
      userIdExternal: r.user_id_external,
      userName:       r.user_name,
      userEmail:      r.user_email,
      connectedAt:    r.connected_at,
      lastSyncedAt:   r.last_synced_at,
      isActive:       true,
    }))
  }
}
