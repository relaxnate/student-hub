// ─── Bundled OAuth client configuration ─────────────────────────────────────
// Student Hub ships ONE public OAuth client per provider so students can just
// click "Connect" without registering their own Google/Azure app ("easier for
// them"). For desktop/installed apps the client_id (and Google's desktop
// client_secret) are NOT confidential — they're expected to live in the binary.
//
// OWNER (relaxnate) — one-time setup to make Connect work:
//   • Google:   create an OAuth "Desktop app" client in a Google Cloud project
//               with the Classroom API enabled; paste its client_id + secret
//               below (or set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET). The
//               sensitive classroom.* scopes also require Google OAuth
//               verification before >100 users (cannot be bypassed in code).
//   • Microsoft: register a multi-tenant Azure AD app, platform "Mobile &
//               desktop applications", redirect student-hub://oauth/microsoft-teams/callback,
//               with the Education delegated scopes. Public client → no secret
//               (PKCE). Paste its client_id below (or set MICROSOFT_CLIENT_ID).
//               School IT admins must grant tenant admin consent once.
//
// Precedence: environment variable (dev / CI secret) → bundled constant below.
// Empty string = not configured → the connect flow reports a clear setup error
// instead of failing cryptically.

const BUNDLED = {
  googleClientId:     '',   // ← paste Google OAuth desktop client_id here
  googleClientSecret: '',   // ← paste Google OAuth desktop client_secret here (non-confidential for installed apps)
  microsoftClientId:  '',   // ← paste Azure AD app client_id here
  microsoftTenant:    'common',
  // Master beta gate for the OAuth integrations (Google Classroom, MS Teams).
  // These use SENSITIVE scopes whose Google verification is capped at 100 users
  // for the project's lifetime (non-resettable) until verified, so we keep them
  // OFF by default even when a client_id is configured — the owner flips this
  // (or sets STUDENTHUB_ENABLE_BETA_INTEGRATIONS=1) to expose them as a limited
  // beta. This prevents accidentally burning the cap on the public.
  betaIntegrationsEnabled: false,
} as const

// Providers behind the beta gate (sensitive-scope OAuth, limited rollout).
const BETA_PROVIDERS = new Set([
  'google-classroom', 'google-calendar', 'microsoft-teams', 'outlook-calendar',
])

export interface ProviderOAuth {
  clientId: string
  clientSecret: string   // '' when not applicable (public clients)
  tenantId: string       // Microsoft only; '' otherwise
}

/** Resolve OAuth client config for a provider (env override → bundled). */
export function getProviderOAuth(provider: string): ProviderOAuth {
  switch (provider) {
    case 'google-classroom':
    case 'google-calendar':
      return {
        clientId:     process.env.GOOGLE_CLIENT_ID     ?? BUNDLED.googleClientId,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? BUNDLED.googleClientSecret,
        tenantId:     '',
      }
    case 'microsoft-teams':
    case 'outlook-calendar':
      return {
        clientId:     process.env.MICROSOFT_CLIENT_ID ?? BUNDLED.microsoftClientId,
        clientSecret: '',
        tenantId:     process.env.MICROSOFT_TENANT_ID ?? BUNDLED.microsoftTenant,
      }
    default:
      return { clientId: '', clientSecret: '', tenantId: '' }
  }
}

/** True when a provider has a usable client ID configured. */
export function isOAuthConfigured(provider: string): boolean {
  return getProviderOAuth(provider).clientId.trim().length > 0
}

/** Whether a provider is gated behind the limited beta (sensitive-scope OAuth). */
export function isProviderBeta(provider: string): boolean {
  return BETA_PROVIDERS.has(provider)
}

/** Whether the beta integrations have been explicitly enabled by the owner. */
export function betaIntegrationsEnabled(): boolean {
  return process.env.STUDENTHUB_ENABLE_BETA_INTEGRATIONS === '1' || BUNDLED.betaIntegrationsEnabled
}

/**
 * Whether a provider can actually be connected right now: it must have a client
 * ID configured AND, if it's a beta provider, the beta gate must be enabled.
 * This is the single source of truth the UI + the OAuth start handler use, so a
 * configured-but-not-beta-enabled Classroom stays hidden (cap protected).
 */
export function isProviderConnectable(provider: string): boolean {
  if (!isOAuthConfigured(provider)) return false
  if (isProviderBeta(provider) && !betaIntegrationsEnabled()) return false
  return true
}
