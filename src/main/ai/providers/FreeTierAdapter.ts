// FreeTierAdapter — what users get with ZERO setup, no key of their own. It uses
// Student Hub's funded OpenRouter key, restricted to :free models, with a local
// daily request cap so we stay inside OpenRouter's free allowance.
//
// The funded key is resolved (in priority order) from:
//   1. an owner-set key stored on-device (ai_provider_keys['free'], encrypted) —
//      settable from the AI Helper tab's settings, so the free tier can be turned
//      on without rebuilding;
//   2. the STUDENTHUB_OPENROUTER_KEY environment variable;
//   3. the FUNDED_KEY constant baked into the build for distribution.
// The registry passes the owner-set key (1) into the constructor.

import { OpenRouterAdapter, OPENROUTER_BASE } from './OpenRouterAdapter'
import type { StreamChatParams } from '../AIProviderAdapter'
import type { ChatChunk, ModelInfo } from '@shared/types/entities'
import { FreeTierLimitError, AIError } from '../errors'
import { AIUsageRepository } from '../../database/repositories/AIUsageRepository'

// Build-time funded key for distributed copies. Replace before shipping the free
// tier publicly, OR set STUDENTHUB_OPENROUTER_KEY, OR set it from the in-app
// AI Helper settings (stored encrypted, takes priority).
const FUNDED_KEY_CONSTANT = 'sk-or-REPLACE_WITH_STUDENTHUB_FUNDED_OPENROUTER_KEY'

const DEFAULT_FREE_MODEL = 'deepseek/deepseek-r1:free'
const DAILY_REQUEST_LIMIT = 1000

/** Resolve the funded key from owner-set → env → constant. */
export function resolveFreeKey(ownerKey?: string | null): string {
  return (ownerKey && ownerKey.trim()) || process.env.STUDENTHUB_OPENROUTER_KEY || FUNDED_KEY_CONSTANT
}

/** Whether a usable funded key is present (i.e. not the placeholder). */
export function freeKeyConfigured(ownerKey?: string | null): boolean {
  const k = resolveFreeKey(ownerKey)
  return !!k && !k.includes('REPLACE_WITH')
}

export class FreeTierAdapter extends OpenRouterAdapter {
  readonly id = 'free'
  readonly displayName = 'Free (Student Hub)'
  readonly supportsVision = true
  readonly supportsTools = true
  readonly contextWindow = 64_000
  readonly isFree = true

  private usageRepo = new AIUsageRepository()
  private readonly funded: string

  constructor(ownerKey?: string | null) {
    const key = resolveFreeKey(ownerKey)
    super(key)          // OpenRouterAdapter stores it as apiKey; authHeaders use it
    this.funded = key
  }

  private get configured(): boolean {
    return !!this.funded && !this.funded.includes('REPLACE_WITH')
  }

  async *streamChat(params: StreamChatParams): AsyncIterable<ChatChunk> {
    // Enforce the daily cap BEFORE any network call.
    const used = this.usageRepo.getTodayRequestCount('free')
    if (used >= DAILY_REQUEST_LIMIT) throw new FreeTierLimitError(resetLabel())

    if (!this.configured) {
      throw new AIError(
        'The free tier isn’t set up on this device yet. Open the AI Helper settings (gear icon) → Free tier and paste a Student Hub OpenRouter key, or connect your own provider key.',
        'no_key',
      )
    }
    // Force a :free model so we never accidentally route as paid.
    const model = params.model?.endsWith(':free') ? params.model : DEFAULT_FREE_MODEL
    yield* super.streamChat({ ...params, model })
  }

  async listModels(): Promise<ModelInfo[]> {
    const fallback: ModelInfo[] = [{
      id: DEFAULT_FREE_MODEL, displayName: 'DeepSeek R1 (free)', contextWindow: 64_000,
      supportsVision: false, supportsTools: true, isFree: true, inputCostPer1M: 0, outputCostPer1M: 0,
    }]
    if (!this.configured) return fallback
    try {
      const all = await super.listModels()
      const free = all.filter(m => m.id.endsWith(':free')).map(m => ({ ...m, isFree: true }))
      return free.length ? free : fallback
    } catch {
      return fallback
    }
  }

  /** No user key needed — always "available" (whether it can send depends on the funded key + cap). */
  async validateKey(): Promise<{ ok: boolean; error?: string }> {
    return { ok: true }
  }

  static readonly DAILY_REQUEST_LIMIT = DAILY_REQUEST_LIMIT
  static readonly DEFAULT_MODEL = DEFAULT_FREE_MODEL
  static get baseUrl() { return OPENROUTER_BASE }
}

/** OpenRouter's free daily window resets at 00:00 UTC. */
function resetLabel(): string {
  const now = new Date()
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0))
  return reset.toISOString()
}
