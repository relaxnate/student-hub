// Abstract base class every AI provider adapter extends. Mirrors the structure
// and philosophy of integrations/base/IntegrationAdapter.ts: abstract readonly
// identity/capability fields, abstract provider-specific methods, and shared
// concrete HTTP/SSE primitives in this base so subclasses stay thin.
//
// Keys are injected by AIKeyService in the main process — they NEVER reach the
// renderer. Streaming returns an AsyncIterable<ChatChunk> the handler relays to
// the renderer as STREAM_CHUNK events.

import type {
  ChatMessage,
  ChatChunk,
  ToolDefinition,
  ModelInfo,
} from '@shared/types/entities'
import { AINetworkError, AIApiError } from './errors'

export interface StreamChatParams {
  messages: ChatMessage[]
  model: string
  tools?: ToolDefinition[]
  systemPrompt?: string
  maxTokens?: number
  temperature?: number
  signal?: AbortSignal
}

export abstract class AIProviderAdapter {
  abstract readonly id: string
  abstract readonly displayName: string
  abstract readonly supportsVision: boolean
  abstract readonly supportsTools: boolean
  abstract readonly contextWindow: number
  abstract readonly isFree: boolean

  /**
   * Stream a chat response as an async iterable of chunks. Each chunk carries a
   * `delta` string; the final chunk has `done: true` and optional `usage`.
   * Implementations must honour `params.signal` for cancellation.
   */
  abstract streamChat(params: StreamChatParams): AsyncIterable<ChatChunk>

  /** All models this provider currently exposes. */
  abstract listModels(): Promise<ModelInfo[]>

  /** Validate the stored/given key. ok=false carries a user-readable error. */
  abstract validateKey(): Promise<{ ok: boolean; error?: string }>

  /**
   * Provider-specific usage delta from a chunk (token formats differ). Default:
   * read the chunk's own `usage` if present, otherwise zeros. Subclasses with
   * pricing override the cost.
   */
  estimateUsage(chunk: ChatChunk): { tokensIn: number; tokensOut: number; estimatedCostUSD: number } {
    if (chunk.usage) {
      return { tokensIn: chunk.usage.inputTokens, tokensOut: chunk.usage.outputTokens, estimatedCostUSD: 0 }
    }
    return { tokensIn: 0, tokensOut: 0, estimatedCostUSD: 0 }
  }

  // ─── Shared HTTP helper ──────────────────────────────────────────────────
  // Thin wrapper around global fetch (Node 20+) with typed error mapping. Each
  // subclass adds its own auth headers. Throws AINetworkError / AIApiError.

  protected async fetchJson<T>(url: string, init: RequestInit): Promise<T> {
    let res: Response
    try {
      res = await fetch(url, init)
    } catch (cause) {
      throw new AINetworkError(cause)
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new AIApiError(res.status, body)
    }
    return res.json() as Promise<T>
  }

  /** Open a streaming POST and return the raw Response (caller parses SSE). */
  protected async fetchStream(url: string, init: RequestInit): Promise<Response> {
    let res: Response
    try {
      res = await fetch(url, init)
    } catch (cause) {
      throw new AINetworkError(cause)
    }
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => '')
      throw new AIApiError(res.status, body)
    }
    return res
  }
}
