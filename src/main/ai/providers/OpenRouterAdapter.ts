// OpenRouter (BYOK) — OpenAI-compatible gateway to hundreds of models.
// Adds the required observability headers and a live, priced model catalogue.
import { OpenAICompatibleAdapter } from './OpenAICompatibleAdapter'
import type { ModelInfo } from '@shared/types/entities'
import { AIApiError } from '../errors'

export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'
export const OPENROUTER_HEADERS = {
  'HTTP-Referer': 'https://studenthub.app',
  'X-Title': 'Student Hub',
}

interface ORModel {
  id: string
  name?: string
  context_length?: number
  architecture?: { input_modalities?: string[]; modality?: string }
  pricing?: { prompt?: string; completion?: string }
  supported_parameters?: string[]
}

/** Map an OpenRouter /models entry → our ModelInfo (pricing is USD per token). */
export function openRouterModelToInfo(m: ORModel): ModelInfo {
  const inPer1M  = m.pricing?.prompt     != null ? parseFloat(m.pricing.prompt) * 1e6     : null
  const outPer1M = m.pricing?.completion != null ? parseFloat(m.pricing.completion) * 1e6 : null
  const modalities = m.architecture?.input_modalities ?? []
  const supportsVision = modalities.includes('image') || (m.architecture?.modality ?? '').includes('image')
  const supportsTools = (m.supported_parameters ?? []).includes('tools')
  return {
    id: m.id,
    displayName: m.name ?? m.id,
    contextWindow: m.context_length ?? 8_192,
    supportsVision,
    supportsTools,
    isFree: m.id.endsWith(':free') || (inPer1M === 0 && outPer1M === 0),
    inputCostPer1M: inPer1M,
    outputCostPer1M: outPer1M,
  }
}

export class OpenRouterAdapter extends OpenAICompatibleAdapter {
  // Explicit (widened) types so FreeTierAdapter can extend + override these.
  readonly id: string = 'openrouter'
  readonly displayName: string = 'OpenRouter'
  readonly supportsVision: boolean = true
  readonly supportsTools: boolean = true
  readonly contextWindow: number = 128_000
  readonly isFree: boolean = false

  constructor(protected readonly apiKey: string) { super() }

  protected get baseUrl() { return OPENROUTER_BASE }
  protected authHeaders() {
    return { Authorization: `Bearer ${this.apiKey}`, ...OPENROUTER_HEADERS }
  }

  async listModels(): Promise<ModelInfo[]> {
    const res = await this.fetchJson<{ data: ORModel[] }>(`${this.baseUrl}/models`, {
      method: 'GET',
      headers: this.authHeaders(),
    })
    return (res.data ?? []).map(openRouterModelToInfo)
  }

  // OpenRouter exposes a dedicated key-check endpoint.
  async validateKey(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.fetchJson<unknown>(`${this.baseUrl}/auth/key`, {
        method: 'GET',
        headers: this.authHeaders(),
      })
      return { ok: true }
    } catch (err) {
      if (err instanceof AIApiError && (err.status === 401 || err.status === 403)) {
        return { ok: false, error: 'That OpenRouter key was rejected. Check it at openrouter.ai/keys.' }
      }
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
}
