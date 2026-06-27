import crypto from 'crypto'
import { BaseRepository } from './BaseRepository'
import type { AIConversation } from '@shared/types/entities'

interface AIConversationRow {
  id: string
  title: string | null
  provider: string
  model: string
  created_at: number
  updated_at: number
  message_count: number
  is_archived: number
}

export class AIConversationRepository extends BaseRepository<AIConversation, AIConversationRow> {
  protected get tableName() { return 'ai_conversations' }

  protected fromRow(row: AIConversationRow): AIConversation {
    return {
      id:           row.id,
      title:        row.title,
      provider:     row.provider,
      model:        row.model,
      createdAt:    row.created_at,
      updatedAt:    row.updated_at,
      messageCount: row.message_count,
      isArchived:   row.is_archived === 1,
    }
  }

  protected toRow(c: Partial<AIConversation>): Partial<AIConversationRow> {
    const row: Partial<AIConversationRow> = {}
    if (c.id           !== undefined) row.id            = c.id
    if (c.title        !== undefined) row.title         = c.title
    if (c.provider     !== undefined) row.provider      = c.provider
    if (c.model        !== undefined) row.model         = c.model
    if (c.createdAt    !== undefined) row.created_at    = c.createdAt
    if (c.updatedAt    !== undefined) row.updated_at    = c.updatedAt
    if (c.messageCount !== undefined) row.message_count = c.messageCount
    if (c.isArchived   !== undefined) row.is_archived   = c.isArchived ? 1 : 0
    return row
  }

  /** All conversations, newest first. The renderer splits active vs. archived. */
  getAll(): AIConversation[] {
    const rows = this.db
      .prepare(`SELECT * FROM ai_conversations ORDER BY updated_at DESC`)
      .all() as AIConversationRow[]
    return rows.map(r => this.fromRow(r))
  }

  /** Archive or unarchive a conversation (keeps it, just hides it from the main list). */
  setArchived(id: string, archived: boolean): void {
    this.db.prepare(`UPDATE ai_conversations SET is_archived = ?, updated_at = ? WHERE id = ?`)
      .run(archived ? 1 : 0, Date.now(), id)
  }

  getById(id: string): AIConversation | undefined {
    return this.findById(id)
  }

  create(provider: string, model: string): AIConversation {
    const now = Date.now()
    const conversation: AIConversation = {
      id:           `ai-conv-${crypto.randomUUID()}`,
      title:        null,
      provider,
      model,
      createdAt:    now,
      updatedAt:    now,
      messageCount: 0,
      isArchived:   false,
    }
    this.upsert(conversation)
    return conversation
  }

  updateTitle(id: string, title: string): void {
    this.db.prepare(`UPDATE ai_conversations SET title = ?, updated_at = ? WHERE id = ?`)
      .run(title, Date.now(), id)
  }

  updateTimestamp(id: string): void {
    this.db.prepare(`UPDATE ai_conversations SET updated_at = ? WHERE id = ?`).run(Date.now(), id)
  }

  /** Bump message_count and updated_at (called after persisting a message). */
  incrementMessageCount(id: string, by = 1): void {
    this.db.prepare(`UPDATE ai_conversations SET message_count = message_count + ?, updated_at = ? WHERE id = ?`)
      .run(by, Date.now(), id)
  }

  delete(id: string): void {
    this.deleteById(id)
  }

  deleteAll(): void {
    this.db.prepare(`DELETE FROM ai_conversations`).run()
  }
}
