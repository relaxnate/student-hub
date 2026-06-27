import crypto from 'crypto'
import { BaseRepository } from './BaseRepository'
import type { AIMessage, ToolCall, ToolResult } from '@shared/types/entities'

interface AIMessageRow {
  id: string
  conversation_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  tool_calls: string | null
  tool_results: string | null
  tokens_used: number | null
  created_at: number
}

export class AIMessageRepository extends BaseRepository<AIMessage, AIMessageRow> {
  protected get tableName() { return 'ai_messages' }

  protected fromRow(row: AIMessageRow): AIMessage {
    return {
      id:             row.id,
      conversationId: row.conversation_id,
      role:           row.role,
      content:        row.content,
      toolCalls:      row.tool_calls   ? safeParse<ToolCall[]>(row.tool_calls)     : undefined,
      toolResults:    row.tool_results ? safeParse<ToolResult[]>(row.tool_results) : undefined,
      tokensUsed:     row.tokens_used ?? undefined,
      createdAt:      row.created_at,
    }
  }

  protected toRow(m: Partial<AIMessage>): Partial<AIMessageRow> {
    const row: Partial<AIMessageRow> = {}
    if (m.id             !== undefined) row.id              = m.id
    if (m.conversationId !== undefined) row.conversation_id = m.conversationId
    if (m.role           !== undefined) row.role            = m.role
    if (m.content        !== undefined) row.content         = m.content
    if (m.toolCalls      !== undefined) row.tool_calls      = m.toolCalls ? JSON.stringify(m.toolCalls) : null
    if (m.toolResults    !== undefined) row.tool_results    = m.toolResults ? JSON.stringify(m.toolResults) : null
    if (m.tokensUsed     !== undefined) row.tokens_used     = m.tokensUsed ?? null
    if (m.createdAt      !== undefined) row.created_at      = m.createdAt
    return row
  }

  getByConversation(conversationId: string): AIMessage[] {
    const rows = this.db
      .prepare(`SELECT * FROM ai_messages WHERE conversation_id = ? ORDER BY created_at ASC`)
      .all(conversationId) as AIMessageRow[]
    return rows.map(r => this.fromRow(r))
  }

  create(message: Omit<AIMessage, 'id'>): AIMessage {
    const full: AIMessage = { ...message, id: `ai-msg-${crypto.randomUUID()}` }
    this.upsert(full)
    return full
  }

  /** Used during streaming — update the assistant message as chunks accumulate. */
  updateContent(id: string, content: string): void {
    this.db.prepare(`UPDATE ai_messages SET content = ? WHERE id = ?`).run(content, id)
  }

  deleteByConversation(conversationId: string): void {
    this.deleteWhere('conversation_id', conversationId)
  }
}

function safeParse<T>(s: string): T | undefined {
  try { return JSON.parse(s) as T } catch { return undefined }
}
