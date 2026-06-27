// Anthropic Messages API — direct (NOT via OpenRouter). Streaming format differs
// from OpenAI: typed events (message_start / content_block_delta / message_delta
// / message_stop) where the token text is delta.text on a text_delta, and
// `system` is a top-level field rather than a system-role message.
import { AIProviderAdapter, type StreamChatParams } from '../AIProviderAdapter'
import type { ChatMessage, ChatChunk, ModelInfo, ToolCall } from '@shared/types/entities'
import { parseSSEStream } from '../sse'
import { AIApiError } from '../errors'

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1'
const ANTHROPIC_VERSION = '2023-06-01'

// Fallback catalogue if GET /v1/models fails. Verify ids at release.
const FALLBACK_MODELS: ModelInfo[] = [
  { id: 'claude-opus-4-1',          displayName: 'Claude Opus 4.1',    contextWindow: 200_000, supportsVision: true, supportsTools: true, inputCostPer1M: 15,  outputCostPer1M: 75 },
  { id: 'claude-sonnet-4-5',        displayName: 'Claude Sonnet 4.5',  contextWindow: 200_000, supportsVision: true, supportsTools: true, inputCostPer1M: 3,   outputCostPer1M: 15 },
  { id: 'claude-3-5-haiku-latest',  displayName: 'Claude 3.5 Haiku',   contextWindow: 200_000, supportsVision: true, supportsTools: true, inputCostPer1M: 0.8, outputCostPer1M: 4 },
]

interface AnthropicEvent {
  type: string
  index?: number
  message?: { usage?: { input_tokens?: number; output_tokens?: number } }
  content_block?: { type?: string; id?: string; name?: string }
  delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string }
  usage?: { output_tokens?: number }
}

export class AnthropicAdapter extends AIProviderAdapter {
  readonly id = 'anthropic'
  readonly displayName = 'Anthropic (Claude)'
  readonly supportsVision = true
  readonly supportsTools = true
  readonly contextWindow = 200_000
  readonly isFree = false

  constructor(private readonly apiKey: string) { super() }

  private headers() {
    return {
      'x-api-key': this.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    }
  }

  // ChatMessage → Anthropic message blocks. Only user/assistant belong in
  // `messages` (system is hoisted out). Data-URL images become base64 blocks.
  private toAnthropicMessages(messages: ChatMessage[]): unknown[] {
    return messages
      .filter(m => m.role !== 'system')
      .map(m => {
        if (typeof m.content === 'string') return { role: m.role, content: m.content }
        const blocks = m.content.map(part => {
          if (part.type === 'text') return { type: 'text', text: part.text ?? '' }
          const url = part.image_url?.url ?? ''
          const match = /^data:(.+?);base64,(.*)$/.exec(url)
          if (match) return { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } }
          return { type: 'text', text: url }
        })
        return { role: m.role, content: blocks }
      })
  }

  async *streamChat(params: StreamChatParams): AsyncIterable<ChatChunk> {
    const body: Record<string, unknown> = {
      model: params.model,
      max_tokens: params.maxTokens ?? 4096,
      messages: this.toAnthropicMessages(params.messages),
      stream: true,
    }
    if (params.systemPrompt) body.system = params.systemPrompt
    if (params.temperature !== undefined) body.temperature = params.temperature
    if (params.tools && params.tools.length) {
      body.tools = params.tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }))
    }

    const res = await this.fetchStream(`${ANTHROPIC_BASE}/messages`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: params.signal,
    })

    let inTokens = 0
    let outTokens = 0
    // tool_use blocks: content_block_start carries id+name; input_json_delta
    // streams the arguments JSON by block index.
    const toolAcc = new Map<number, { id: string; name: string; args: string }>()
    for await (const payload of parseSSEStream(res.body!, params.signal)) {
      let evt: AnthropicEvent
      try { evt = JSON.parse(payload) } catch { continue }
      if (evt.type === 'message_start' && evt.message?.usage?.input_tokens != null) {
        inTokens = evt.message.usage.input_tokens
      } else if (evt.type === 'content_block_start' && evt.content_block?.type === 'tool_use') {
        toolAcc.set(evt.index ?? 0, { id: evt.content_block.id ?? '', name: evt.content_block.name ?? '', args: '' })
      } else if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
        if (evt.delta.text) yield { delta: evt.delta.text, done: false }
      } else if (evt.type === 'content_block_delta' && evt.delta?.type === 'input_json_delta') {
        const cur = toolAcc.get(evt.index ?? 0)
        if (cur) cur.args += evt.delta.partial_json ?? ''
      } else if (evt.type === 'message_delta' && evt.usage?.output_tokens != null) {
        outTokens = evt.usage.output_tokens
      }
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

  async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await this.fetchJson<{ data: { id: string; display_name?: string }[] }>(
        `${ANTHROPIC_BASE}/models`, { method: 'GET', headers: this.headers() },
      )
      const live = (res.data ?? []).map(m => ({
        id: m.id,
        displayName: m.display_name ?? m.id,
        contextWindow: 200_000,
        supportsVision: true,
        supportsTools: true,
        inputCostPer1M: null,
        outputCostPer1M: null,
      }))
      return live.length ? live : FALLBACK_MODELS
    } catch {
      return FALLBACK_MODELS
    }
  }

  async validateKey(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.fetchJson<unknown>(`${ANTHROPIC_BASE}/models`, { method: 'GET', headers: this.headers() })
      return { ok: true }
    } catch (err) {
      if (err instanceof AIApiError && (err.status === 401 || err.status === 403)) {
        return { ok: false, error: 'That Anthropic API key was rejected. Check it at console.anthropic.com.' }
      }
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
}
