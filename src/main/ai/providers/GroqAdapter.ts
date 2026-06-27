// Groq — OpenAI-compatible at https://api.groq.com/openai/v1, extremely fast
// inference on open-source models. Same SSE format as OpenAI.
import { OpenAICompatibleAdapter } from './OpenAICompatibleAdapter'
import type { ModelInfo } from '@shared/types/entities'

// Groq's free tier is metered by RPM/RPD/TPM rather than $ — cost shown as 0.
// Most text models don't take images (supportsVision:false). Verify ids at release.
const GROQ_MODELS: ModelInfo[] = [
  { id: 'llama-3.3-70b-versatile', displayName: 'Llama 3.3 70B', contextWindow: 128_000, supportsVision: false, supportsTools: true,  inputCostPer1M: 0, outputCostPer1M: 0 },
  { id: 'llama-3.1-8b-instant',    displayName: 'Llama 3.1 8B',  contextWindow: 128_000, supportsVision: false, supportsTools: true,  inputCostPer1M: 0, outputCostPer1M: 0 },
  { id: 'gemma2-9b-it',            displayName: 'Gemma2 9B',     contextWindow: 8_192,   supportsVision: false, supportsTools: true,  inputCostPer1M: 0, outputCostPer1M: 0 },
]

export class GroqAdapter extends OpenAICompatibleAdapter {
  readonly id = 'groq'
  readonly displayName = 'Groq'
  readonly supportsVision = false
  readonly supportsTools = true
  readonly contextWindow = 128_000
  readonly isFree = false   // BYOK key required; the key's own tier may be free

  constructor(private readonly apiKey: string) { super() }

  protected get baseUrl() { return 'https://api.groq.com/openai/v1' }
  protected authHeaders() { return { Authorization: `Bearer ${this.apiKey}` } }

  async listModels(): Promise<ModelInfo[]> { return GROQ_MODELS }
}
