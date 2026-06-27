// OpenAI Chat Completions — direct. Standard SSE (choices[0].delta.content).
import { OpenAICompatibleAdapter } from './OpenAICompatibleAdapter'
import type { ModelInfo } from '@shared/types/entities'

// Static catalogue (OpenAI's /models list is noisy and unpriced). Verify ids at
// release — see provider research. Pricing is USD/1M tokens (approx, for metering).
const OPENAI_MODELS: ModelInfo[] = [
  { id: 'gpt-4o',       displayName: 'GPT-4o',        contextWindow: 128_000, supportsVision: true,  supportsTools: true, inputCostPer1M: 2.5,  outputCostPer1M: 10 },
  { id: 'gpt-4o-mini',  displayName: 'GPT-4o mini',   contextWindow: 128_000, supportsVision: true,  supportsTools: true, inputCostPer1M: 0.15, outputCostPer1M: 0.6 },
  { id: 'gpt-4-turbo',  displayName: 'GPT-4 Turbo',   contextWindow: 128_000, supportsVision: true,  supportsTools: true, inputCostPer1M: 10,   outputCostPer1M: 30 },
  { id: 'o1',           displayName: 'o1',            contextWindow: 200_000, supportsVision: true,  supportsTools: true, inputCostPer1M: 15,   outputCostPer1M: 60 },
  { id: 'o1-mini',      displayName: 'o1-mini',       contextWindow: 128_000, supportsVision: false, supportsTools: false, inputCostPer1M: 3,   outputCostPer1M: 12 },
]

export class OpenAIAdapter extends OpenAICompatibleAdapter {
  readonly id = 'openai'
  readonly displayName = 'OpenAI'
  readonly supportsVision = true
  readonly supportsTools = true
  readonly contextWindow = 128_000
  readonly isFree = false

  constructor(private readonly apiKey: string) { super() }

  protected get baseUrl() { return 'https://api.openai.com/v1' }
  protected authHeaders() { return { Authorization: `Bearer ${this.apiKey}` } }

  async listModels(): Promise<ModelInfo[]> { return OPENAI_MODELS }
}
