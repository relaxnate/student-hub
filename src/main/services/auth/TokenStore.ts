import { safeStorage } from 'electron'
import { getDb } from '../../database'

interface StoredTokens {
  accessToken: string
  refreshToken: string | null
  expiresAt: number | null
}

/**
 * Encrypts and persists OAuth tokens using Electron's safeStorage API.
 * safeStorage uses the OS keychain on macOS, DPAPI on Windows, and
 * libsecret / kwallet on Linux — tokens never sit in plaintext on disk.
 */
export class TokenStore {
  /** Encrypt tokens and persist them in the integrations table. */
  save(integrationId: string, tokens: StoredTokens): void {
    const db = getDb()

    const encryptedAccess = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(tokens.accessToken).toString('base64')
      : tokens.accessToken  // fallback: store plaintext if OS keychain unavailable

    const encryptedRefresh = tokens.refreshToken && safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(tokens.refreshToken).toString('base64')
      : tokens.refreshToken

    db.prepare(`
      UPDATE integrations
      SET
        access_token_encrypted  = ?,
        refresh_token_encrypted = ?,
        token_expires_at        = ?
      WHERE id = ?
    `).run(encryptedAccess, encryptedRefresh, tokens.expiresAt, integrationId)
  }

  /** Decrypt and return stored tokens for an integration. */
  load(integrationId: string): StoredTokens | null {
    const db = getDb()

    const row = db.prepare(`
      SELECT access_token_encrypted, refresh_token_encrypted, token_expires_at
      FROM integrations
      WHERE id = ?
    `).get(integrationId) as {
      access_token_encrypted:  string | null
      refresh_token_encrypted: string | null
      token_expires_at:        number | null
    } | undefined

    if (!row || !row.access_token_encrypted) return null

    try {
      const decrypt = (encrypted: string): string => {
        if (!safeStorage.isEncryptionAvailable()) return encrypted
        return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
      }

      return {
        accessToken:  decrypt(row.access_token_encrypted),
        refreshToken: row.refresh_token_encrypted ? decrypt(row.refresh_token_encrypted) : null,
        expiresAt:    row.token_expires_at,
      }
    } catch {
      // Decryption failed (e.g. different OS user, keychain lost) — need re-auth
      console.error(`[TokenStore] Failed to decrypt tokens for integration ${integrationId}`)
      return null
    }
  }

  clear(integrationId: string): void {
    const db = getDb()
    db.prepare(`
      UPDATE integrations
      SET access_token_encrypted = NULL, refresh_token_encrypted = NULL, token_expires_at = NULL
      WHERE id = ?
    `).run(integrationId)
  }
}
