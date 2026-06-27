// Google Gemini — Generative Language REST API. Differs significantly from
// OpenAI: roles are 'user' and 'model' (not 'assistant'); the system prompt is a
// top-level `systemInstruction` field; streaming uses :streamGenerateContent
// with ?alt=sse so we can reuse the SSE parser.
import { AIProviderAdapter, type StreamChatParams } from '../AIProviderAdapter'
import type { ChatMessage, ChatChunk, ModelInfo, ToolCall } from '@shared/types/entities'
import { parseSSEStream } from '../sse'
import { AIApiError } from '../errors'

const GOOGLE_BASE = 'https://generativelanguage.googleapis.com/v1beta'

// Gemini Flash has a generous free tier through Google AI Studio → isFree.
const GEMINI_MODELS: ModelInfo[] = [
  { id: 'gemini-2.0-flash',  displayName: 'Gemini 2.0 Flash', contextWindow: 1_000_000, supportsVision: true, supportsTools: true, inputCostPer1M: 0,    outputCostPer1M: 0 },
  { id: 'gemini-1.5-flash',  displayName: 'Gemini 1.5 Flash', contextWindow: 1_000_000, supportsVision: true, supportsTools: true, inputCostPer1M: 0,    outputCostPer1M: 0 },
  { id: 'gemini-1.5-pro',    displayName: 'Gemini 1.5 Pro',   contextWindow: 2_000_000, supportsVision: true, supportsTools: true, inputCostPer1M: 1.25, outputCostPer1M: 5 },
]

interface GeminiPart {
  text?: string
  functionCall?: { name?: string; args?: Record<string, unknown> }
}
interface GeminiChunk {
  candidates?: { content?: { parts?: GeminiPart[] } }[]
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
}

export class GoogleAdapter extends AIProviderAdapter {
  readonly id = 'google'
  readonly displayName = 'Google (Gemini)'
  readonly supportsVision = true
  readonly supportsTools = true
  readonly contextWindow = 1_000_000
  readonly isFree = false   // BYOK key; Gemini Flash's own tier is free

  constructor(private readonly apiKey: string) { super() }

  // ChatMessage → Gemini `contents`. assistant→model; data-URL images→inline_data.
  private toContents(messages: ChatMessage[]): unknown[] {
    return messages
      .filter(m => m.role !== 'system')
      .map(m => {
        const role = m.role === 'assistant' ? 'model' : 'user'
        if (typeof m.content === 'string') return { role, parts: [{ text: m.content }] }
        const parts = m.content.map(part => {
          if (part.type === 'text') return { text: part.text ?? '' }
          const url = part.image_url?.url ?? ''
          const match = /^data:(.+?);base64,(.*)$/.exec(url)
          if (match) return { inline_data: { mime_type: match[1], data: match[2] } }
          return { text: url }
        })
        return { role, parts }
      })
  }

  async *streamChat(params: StreamChatParams): AsyncIterable<ChatChunk> {
    const body: Record<string, unknown> = {
      contents: this.toContents(params.messages),
      generationConfig: {
        ...(params.maxTokens ? { maxOutputTokens: params.maxTokens } : {}),
        ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
      },
    }
    if (params.systemPrompt) body.systemInstruction = { parts: [{ text: params.systemPrompt }] }
    if (params.tools && params.tools.length) {
      body.tools = [{ function_declarations: params.tools.map(t => ({ name: t.name, description: t.description, parameters: t.parameters })) }]
    }

    const url = `${GOOGLE_BASE}/models/${encodeURIComponent(params.model)}:streamGenerateContent?alt=sse&key=${this.apiKey}`
    const res = await this.fetchStream(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: params.signal,
    })

    let inTokens = 0
    let outTokens = 0
    const toolCalls: ToolCall[] = []
    for await (const payload of parseSSEStream(res.body!, params.signal)) {
      let chunk: GeminiChunk
      try { chunk = JSON.parse(payload) } catch { continue }
      const parts = chunk.candidates?.[0]?.content?.parts ?? []
      const text = parts.map(p => p.text ?? '').join('')
      for (const p of parts) {
        if (p.functionCall?.name) {
          toolCalls.push({
            id: `call_${toolCalls.length}`,
            name: p.functionCall.name,
            arguments: JSON.stringify(p.functionCall.args ?? {}),
          })
        }
      }
      if (chunk.usageMetadata) {
        inTokens = chunk.usageMetadata.promptTokenCount ?? inTokens
        outTokens = chunk.usageMetadata.candidatesTokenCount ?? outTokens
      }
      if (text) yield { delta: text, done: false }
    }
    yield {
      delta: '', done: true,
      usage: { inputTokens: inTokens, outputTokens: outTokens },
      ...(toolCalls.length ? { toolCalls } : {}),
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    return GEMINI_MODELS
  }

  async validateKey(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.fetchJson<unknown>(`${GOOGLE_BASE}/models?key=${this.apiKey}`, { method: 'GET' })
      return { ok: true }
    } catch (err) {
      if (err instanceof AIApiError && (err.status === 400 || err.status === 401 || err.status === 403)) {
        return { ok: false, error: 'That Google AI Studio key was rejected. Check it at aistudio.google.com/apikey.' }
      }
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
}
