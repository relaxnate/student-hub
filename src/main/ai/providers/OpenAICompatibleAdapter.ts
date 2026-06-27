// Shared base for every OpenAI-compatible provider (OpenAI, OpenRouter, Groq,
// and the built-in Free tier via OpenRouter). They all speak the same
// `/chat/completions` SSE format (`choices[0].delta.content`, `[DONE]`
// terminator) and `/models` listing — only base URL, auth headers, and the
// model catalogue differ. Subclasses fill those in.

import { AIProviderAdapter, type StreamChatParams } from '../AIProviderAdapter'
import type { ChatMessage, ChatChunk, ModelInfo, ToolCall } from '@shared/types/entities'
import { parseSSEStream } from '../sse'
import { AIApiError } from '../errors'

interface OpenAIToolCallDelta {
  index: number
  id?: string
  function?: { name?: string; arguments?: string }
}
interface OpenAIChatDelta {
  choices?: { delta?: { content?: string; tool_calls?: OpenAIToolCallDelta[] }; finish_reason?: string | null }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null
}

export abstract class OpenAICompatibleAdapter extends AIProviderAdapter {
  /** e.g. https://api.openai.com/v1 (no trailing slash). */
  protected abstract get baseUrl(): string
  /** The Authorization (and any provider-specific) headers for a request. */
  protected abstract authHeaders(): Record<string, string>

  // ─── Message conversion ──────────────────────────────────────────────────
  // ChatMessage.content may be a plain string or ContentPart[] (text + images
  // for vision). OpenAI accepts both: a string, or an array of
  // {type:'text'|'image_url', …}. We pass arrays straight through.
  protected toRequestMessages(messages: ChatMessage[], systemPrompt?: string): unknown[] {
    const out: unknown[] = []
    if (systemPrompt) out.push({ role: 'system', content: systemPrompt })
    for (const m of messages) out.push({ role: m.role, content: m.content })
    return out
  }

  async *streamChat(params: StreamChatParams): AsyncIterable<ChatChunk> {
    const body: Record<string, unknown> = {
      model: params.model,
      messages: this.toRequestMessages(params.messages, params.systemPrompt),
      stream: true,
      stream_options: { include_usage: true },
    }
    if (params.maxTokens) body.max_tokens = params.maxTokens
    if (params.temperature !== undefined) body.temperature = params.temperature
    if (params.tools && params.tools.length && this.supportsTools) {
      body.tools = params.tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }))
    }

    const res = await this.fetchStream(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify(body),
      signal: params.signal,
    })

    let inTokens = 0
    let outTokens = 0
    // Accumulate streamed tool-call fragments by index (name arrives once,
    // arguments stream as string pieces).
    const toolAcc = new Map<number, { id: string; name: string; args: string }>()
    for await (const payload of parseSSEStream(res.body!, params.signal)) {
      let json: OpenAIChatDelta
      try { json = JSON.parse(payload) } catch { continue }
      const choice = json.choices?.[0]
      const delta = choice?.delta?.content ?? ''
      if (json.usage) {
        inTokens = json.usage.prompt_tokens ?? inTokens
        outTokens = json.usage.completion_tokens ?? outTokens
      }
      for (const tc of choice?.delta?.tool_calls ?? []) {
        const cur = toolAcc.get(tc.index) ?? { id: '', name: '', args: '' }
        if (tc.id) cur.id = tc.id
        if (tc.function?.name) cur.name = tc.function.name
        if (tc.function?.arguments) cur.args += tc.function.arguments
        toolAcc.set(tc.index, cur)
      }
      if (delta) yield { delta, done: false }
    }
    const toolCalls: ToolCall[] = [...toolAcc.values()]
      .filter(t => t.name)
      .map((t, i) => ({ id: t.id || `call_${i}`, name: t.name, arguments: t.args || '{}' }))
    yield {
      delta: '', done: true,
      usage: { inputTokens: inTokens, outputTokens: outTokens },
      ...(toolCalls.length ? { toolCalls } : {}),
    }
  }

  /** Subclasses that want a static catalogue override this. */
  abstract listModels(): Promise<ModelInfo[]>

  async validateKey(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.fetchJson<unknown>(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: this.authHeaders(),
      })
      return { ok: true }
    } catch (err) {
      if (err instanceof AIApiError && (err.status === 401 || err.status === 403)) {
        return { ok: false, error: 'That API key was rejected. Double-check you pasted the full key.' }
      }
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
}
