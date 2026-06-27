// The built-in "Student Hub AI" provider — a $0, fully-offline assistant. Unlike
// every other adapter it makes NO network call: it answers from the student's own
// synced data + a curated knowledge base (see StudentHubBrain), then streams the
// reply word-by-word so the chat UI's typing animation feels natural and the
// thinking→answer transition matches the other providers.
import { AIProviderAdapter, type StreamChatParams } from '../AIProviderAdapter'
import type { ChatChunk, ChatMessage, ModelInfo } from '@shared/types/entities'
import { answerStudentQuestion } from '../studenthub/StudentHubBrain'

export const STUDENTHUB_MODEL = 'studenthub-assistant'

export class StudentHubAdapter extends AIProviderAdapter {
  readonly id = 'studenthub'
  readonly displayName = 'Student Hub AI'
  readonly supportsVision = false
  readonly supportsTools = false   // it does its own data lookups; no LLM tool loop
  readonly contextWindow = 0
  readonly isFree = true

  async *streamChat(params: StreamChatParams): AsyncIterable<ChatChunk> {
    const text = lastUserText(params.messages)
    let answer: string
    try {
      answer = await answerStudentQuestion(text)
    } catch (err) {
      answer = `Sorry — I hit a snag reading your data (${err instanceof Error ? err.message : String(err)}). Try a re-sync, or switch to a full AI model in the gear menu.`
    }

    // Stream the composed answer in small word-groups for a natural typing feel,
    // honouring cancellation.
    const tokens = answer.match(/\S+\s*/g) ?? [answer]
    for (let i = 0; i < tokens.length; i++) {
      if (params.signal?.aborted) return
      yield { delta: tokens[i], done: false }
      // ~2 words per tick; a tiny delay keeps the animation smooth without dragging.
      if (i % 2 === 1) await sleep(14)
    }
    yield { delta: '', done: true, usage: { inputTokens: 0, outputTokens: 0 } }
  }

  async listModels(): Promise<ModelInfo[]> {
    return [{
      id: STUDENTHUB_MODEL,
      displayName: 'Student Hub Assistant (free · offline)',
      contextWindow: 0,
      supportsVision: false,
      supportsTools: false,
      isFree: true,
      inputCostPer1M: 0,
      outputCostPer1M: 0,
    }]
  }

  async validateKey(): Promise<{ ok: boolean; error?: string }> {
    return { ok: true }   // no key — always available
  }
}

function lastUserText(messages: ChatMessage[]): string {
  const last = [...messages].reverse().find(m => m.role === 'user')
  if (!last) return ''
  if (typeof last.content === 'string') return last.content
  return last.content.map(p => (p.type === 'text' ? p.text ?? '' : '')).join(' ').trim()
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}
