// Secure storage + retrieval of BYOK provider API keys. Reuses the EXACT same
// Electron safeStorage mechanism as Canvas tokens (TokenStore) — no second
// encryption path. Keys live in the main process only: they are never sent to
// the renderer, never logged, and never written to the vault.
import { safeStorage } from 'electron'
import { getDb } from '../database'
import type { AIProviderId } from '@shared/types/entities'
import { buildAdapter } from './providers/factory'

interface ProviderKeyRow {
  provider: string
  encrypted_key: string
  display_label: string | null
  added_at: number
  validated_at: number | null
  is_valid: number
}

export class AIKeyService {
  private encrypt(plain: string): string {
    return safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(plain).toString('base64')
      : plain   // fallback: OS keychain unavailable (matches TokenStore behaviour)
  }

  private decrypt(stored: string): string {
    if (!safeStorage.isEncryptionAvailable()) return stored
    return safeStorage.decryptString(Buffer.from(stored, 'base64'))
  }

  /** Encrypt + persist a key (upsert). Optionally record validity. */
  saveKey(provider: string, key: string, opts?: { displayLabel?: string; isValid?: boolean }): void {
    const db = getDb()
    const now = Date.now()
    db.prepare(`
      INSERT INTO ai_provider_keys (provider, encrypted_key, display_label, added_at, validated_at, is_valid)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider) DO UPDATE SET
        encrypted_key = excluded.encrypted_key,
        display_label = excluded.display_label,
        validated_at  = excluded.validated_at,
        is_valid      = excluded.is_valid
    `).run(
      provider,
      this.encrypt(key),
      opts?.displayLabel ?? null,
      now,
      opts?.isValid != null ? now : null,
      opts?.isValid ? 1 : 0,
    )
  }

  /** Decrypt + return a stored key, or null if not set / undecryptable. */
  getKey(provider: string): string | null {
    const row = getDb()
      .prepare(`SELECT encrypted_key FROM ai_provider_keys WHERE provider = ?`)
      .get(provider) as { encrypted_key: string } | undefined
    if (!row?.encrypted_key) return null
    try {
      return this.decrypt(row.encrypted_key)
    } catch {
      console.error(`[AIKeyService] Failed to decrypt key for ${provider}`)
      return null
    }
  }

  deleteKey(provider: string): void {
    getDb().prepare(`DELETE FROM ai_provider_keys WHERE provider = ?`).run(provider)
  }

  hasKey(provider: string): boolean {
    const row = getDb()
      .prepare(`SELECT 1 FROM ai_provider_keys WHERE provider = ?`)
      .get(provider) as { 1: number } | undefined
    return !!row
  }

  /** Whether a stored key was last validated as good. */
  isValid(provider: string): boolean {
    const row = getDb()
      .prepare(`SELECT is_valid FROM ai_provider_keys WHERE provider = ?`)
      .get(provider) as { is_valid: number } | undefined
    return !!row && row.is_valid === 1
  }

  /** All connected provider rows (without exposing the encrypted key). */
  listConnected(): { provider: string; isValid: boolean; displayLabel: string | null }[] {
    const rows = getDb()
      .prepare(`SELECT provider, is_valid, display_label FROM ai_provider_keys`)
      .all() as ProviderKeyRow[]
    return rows.map(r => ({ provider: r.provider, isValid: r.is_valid === 1, displayLabel: r.display_label }))
  }

  /** Validate a candidate key by calling the adapter's validateKey, then store it. */
  async validateAndSaveKey(provider: string, key: string): Promise<{ ok: boolean; error?: string }> {
    let result: { ok: boolean; error?: string }
    try {
      // The free tier's funded key IS an OpenRouter key — validate it as one
      // (FreeTierAdapter.validateKey is a no-op since users normally need no key).
      const validateAs: AIProviderId = provider === 'free' ? 'openrouter' : (provider as AIProviderId)
      const adapter = buildAdapter(validateAs, key)
      result = await adapter.validateKey()
    } catch (err) {
      result = { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
    // Always store the key (so the user can retry later even if validation was a
    // transient network failure), but record whether it validated.
    this.saveKey(provider, key, { isValid: result.ok })
    return result
  }
}

// Singleton — one instance shared across the registry + handlers.
export const aiKeyService = new AIKeyService()
