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
} as const

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
