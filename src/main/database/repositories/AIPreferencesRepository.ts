// Direct-db KV repository for AI Helper preferences. Common keys: active_provider,
// active_model, byok_monthly_token_budget, mascot_skin, mascot_enabled,
// chat_font_size.
import { getDb } from '../index'

interface AIPreferenceRow { key: string; value: string }

export class AIPreferencesRepository {
  private get db() { return getDb() }

  get(key: string): string | undefined {
    const row = this.db.prepare(`SELECT value FROM ai_preferences WHERE key = ?`).get(key) as
      { value: string } | undefined
    return row?.value
  }

  set(key: string, value: string): void {
    this.db.prepare(`
      INSERT INTO ai_preferences (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, value, Date.now())
  }

  getAll(): Record<string, string> {
    const rows = this.db.prepare(`SELECT key, value FROM ai_preferences`).all() as AIPreferenceRow[]
    return Object.fromEntries(rows.map(r => [r.key, r.value]))
  }
}
