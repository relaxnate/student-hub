import { shell, BrowserWindow, app } from 'electron'
import crypto from 'crypto'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { getDb } from '../../database'
import { createAdapter, registerAdapter } from '../../integrations/registry'
import { TokenStore } from './TokenStore'
import type { IntegrationProvider, Integration } from '@shared/types/entities'

// ─── PKCE helpers (RFC 7636) ─────────────────────────────────────────────────
function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function makeVerifier(): string {
  return base64url(crypto.randomBytes(32))
}
function makeChallenge(verifier: string): string {
  return base64url(crypto.createHash('sha256').update(verifier).digest())
}

// How long to wait for the user to complete the OAuth browser flow
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000  // 5 minutes

export class OAuthManager {
  private readonly tokenStore = new TokenStore()

  // Pending OAuth sessions awaiting the deep-link callback.
  // Key: state parameter (CSRF token).
  private pendingFlows = new Map<string, {
    provider:     IntegrationProvider
    baseUrl:      string
    clientId:     string
    codeVerifier?: string   // PKCE
    redirectUri?:  string   // must match the auth request at the token step
    resolve:      (integration: Integration) => void
    reject:       (err: Error) => void
    timeoutId:    ReturnType<typeof setTimeout>
  }>()

  /**
   * Start an OAuth flow for a provider. Dispatches to the correct mechanism:
   * - Google uses a 127.0.0.1 loopback HTTP server (Google rejects custom-scheme
   *   redirects for desktop clients; loopback is the supported flow).
   * - Canvas / Microsoft use the OS browser + a student-hub:// deep-link callback.
   */
  async startOAuth(
    provider: IntegrationProvider,
    baseUrl: string,
    clientId: string
  ): Promise<Integration> {
    if (provider === 'google-classroom' || provider === 'google-calendar') {
      return this.startLoopbackOAuth(provider, baseUrl, clientId)
    }
    return this.startDeepLinkOAuth(provider, baseUrl, clientId)
  }

  /** Browser + custom-scheme deep-link flow (Canvas, Microsoft). */
  private startDeepLinkOAuth(
    provider: IntegrationProvider,
    baseUrl: string,
    clientId: string
  ): Promise<Integration> {
    const state   = crypto.randomBytes(16).toString('hex')
    const adapter = createAdapter(provider, baseUrl, clientId)

    return new Promise<Integration>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingFlows.delete(state)
        reject(new Error('OAuth flow timed out — the browser window may have been closed.'))
      }, OAUTH_TIMEOUT_MS)

      let authUrl: string
      let codeVerifier: string | undefined
      let redirectUri:  string | undefined

      if (provider === 'canvas') {
        // Canvas developer-key OAuth: no PKCE, fixed redirect (unchanged).
        const canvas = adapter as import('../../integrations/canvas/CanvasAdapter').CanvasAdapter
        authUrl = canvas.buildAuthorizationUrl(state)
      } else {
        const config = adapter.getOAuthConfig()
        redirectUri  = config.redirectUri
        const params = new URLSearchParams({
          client_id:     clientId,
          redirect_uri:  config.redirectUri,
          response_type: 'code',
          scope:         config.scopes.join(' '),
          state,
        })
        if (config.usePKCE) {
          codeVerifier = makeVerifier()
          params.set('code_challenge', makeChallenge(codeVerifier))
          params.set('code_challenge_method', 'S256')
        }
        authUrl = `${config.authorizationUrl}?${params.toString()}`
      }

      this.pendingFlows.set(state, {
        provider, baseUrl, clientId, codeVerifier, redirectUri, resolve, reject, timeoutId,
      })
      shell.openExternal(authUrl)
    })
  }

  /** Loopback 127.0.0.1 flow (Google). Spins up a transient local server whose
   *  ephemeral port is the redirect_uri, captures ?code&state, then shuts down. */
  private startLoopbackOAuth(
    provider: IntegrationProvider,
    baseUrl: string,
    clientId: string
  ): Promise<Integration> {
    const adapter      = createAdapter(provider, baseUrl, clientId)
    const config       = adapter.getOAuthConfig()
    const state        = crypto.randomBytes(16).toString('hex')
    const codeVerifier = makeVerifier()
    const challenge    = makeChallenge(codeVerifier)

    return new Promise<Integration>((resolve, reject) => {
      let redirectUri = ''
      const cleanup = () => { clearTimeout(timeoutId); try { server.close() } catch { /* noop */ } }
      const timeoutId = setTimeout(() => {
        cleanup()
        reject(new Error('OAuth flow timed out — the browser window may have been closed.'))
      }, OAUTH_TIMEOUT_MS)

      const server = http.createServer((req, res) => {
        const reqUrl = new URL(req.url ?? '/', 'http://127.0.0.1')
        const st   = reqUrl.searchParams.get('state')
        const code = reqUrl.searchParams.get('code')
        const err  = reqUrl.searchParams.get('error')
        if (st !== state) { res.writeHead(400); res.end('Invalid state'); return }

        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(`<!doctype html><html><body style="font-family:system-ui,sans-serif;background:#0e0e14;color:#e4e4e7;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2 style="font-weight:600">Student Hub connected</h2><p style="color:#a1a1aa">You can close this tab and return to the app.</p></div></body></html>`)
        cleanup()

        if (err || !code) { reject(new Error(err ?? 'No authorization code received')); return }
        this.finishOAuth(provider, baseUrl, clientId, code, { codeVerifier, redirectUri })
          .then(resolve)
          .catch(reject)
      })

      server.on('error', e => { cleanup(); reject(e instanceof Error ? e : new Error(String(e))) })
      server.listen(0, '127.0.0.1', () => {
        redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
        const params = new URLSearchParams({
          client_id:             clientId,
          redirect_uri:          redirectUri,
          response_type:         'code',
          scope:                 config.scopes.join(' '),
          state,
          access_type:           'offline',   // required for a Google refresh_token
          prompt:                'consent',
          code_challenge:        challenge,
          code_challenge_method: 'S256',
        })
        shell.openExternal(`${config.authorizationUrl}?${params.toString()}`)
      })
    })
  }

  /**
   * Called when Electron intercepts a student-hub:// deep link.
   * Parses the code + state, exchanges for tokens, creates the integration record.
   */
  async handleCallback(url: string): Promise<void> {
    const parsed  = new URL(url)
    const code    = parsed.searchParams.get('code')
    const state   = parsed.searchParams.get('state')
    const error   = parsed.searchParams.get('error')

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
      const integration = await this.finishOAuth(
        pending.provider, pending.baseUrl, pending.clientId, code,
        { codeVerifier: pending.codeVerifier, redirectUri: pending.redirectUri },
      )
      pending.resolve(integration)
    } catch (err) {
      pending.reject(err instanceof Error ? err : new Error(String(err)))
    }
  }

  /**
   * Shared tail of every OAuth flow: exchange the code (with PKCE verifier +
   * matching redirect_uri), fetch the profile, persist the integration + tokens,
   * and register the live adapter. Used by both the deep-link and loopback flows.
   */
  private async finishOAuth(
    provider: IntegrationProvider,
    baseUrl: string,
    clientId: string,
    code: string,
    opts: { codeVerifier?: string; redirectUri?: string },
  ): Promise<Integration> {
    const adapter = createAdapter(provider, baseUrl, clientId)
    const tokens  = await adapter.exchangeCodeForToken(code, opts)

    const expiresAt = tokens.expiresIn ? Date.now() + tokens.expiresIn * 1000 : null
    adapter.setTokens(tokens.accessToken, tokens.refreshToken, expiresAt)

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
      profile.id, profile.name, profile.email, Date.now(),
    )

    this.tokenStore.save(integrationId, {
      accessToken:  tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt,
    })

    registerAdapter(integrationId, adapter)

    return {
      id:              integrationId,
      provider,
      displayName:     `${adapter.displayName} — ${profile.name}`,
      baseUrl:         baseUrl || null,
      userIdExternal:  profile.id,
      userName:        profile.name,
      userEmail:       profile.email,
      connectedAt:     Date.now(),
      lastSyncedAt:    null,
      isActive:        true,
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
