// Typed errors for the AI gateway. Mirrors integrations/base/errors.ts in spirit:
// each error maps to a renderer-friendly STREAM_ERROR `code` so the UI can react
// (hard-stop the free tier, explain a rate limit, prompt for a key, etc.).

export type AIErrorCode =
  | 'free_tier_limit'
  | 'rate_limit'
  | 'no_key'
  | 'vision_unsupported'
  | 'network'
  | 'unknown'

export class AIError extends Error {
  readonly code: AIErrorCode
  constructor(message: string, code: AIErrorCode = 'unknown') {
    super(message)
    this.name = 'AIError'
    this.code = code
  }
}

/** Free tier has hit its local daily request cap — throw BEFORE any API call. */
export class FreeTierLimitError extends AIError {
  constructor(resetsAt?: string) {
    super(
      `You've used all of today's free AI requests.${resetsAt ? ` Resets ${resetsAt}.` : ''} ` +
      `Connect your own API key in Settings to keep going.`,
      'free_tier_limit',
    )
    this.name = 'FreeTierLimitError'
  }
}

/** Provider returned 429. */
export class AIRateLimitError extends AIError {
  constructor(message = 'The AI provider is rate-limiting requests. Please wait a moment and try again.') {
    super(message, 'rate_limit')
    this.name = 'AIRateLimitError'
  }
}

/** No stored API key for a BYOK provider. */
export class NoKeyError extends AIError {
  constructor(provider: string) {
    super(`No API key is connected for ${provider}. Add one in Settings → AI Helper.`, 'no_key')
    this.name = 'NoKeyError'
  }
}

/** The selected model can't accept image input. */
export class VisionNotSupportedError extends AIError {
  constructor(model: string) {
    super(`The model "${model}" doesn't support images. Switch to a vision-capable model to analyse this.`, 'vision_unsupported')
    this.name = 'VisionNotSupportedError'
  }
}

/** Network-level failure (DNS, offline, connection reset). */
export class AINetworkError extends AIError {
  constructor(cause?: unknown) {
    super(`Couldn't reach the AI provider. Check your connection and try again.`, 'network')
    this.name = 'AINetworkError'
    if (cause) this.cause = cause
  }
}

/** Non-2xx HTTP response from a provider that isn't one of the above. */
export class AIApiError extends AIError {
  readonly status: number
  constructor(status: number, body: string) {
    super(`AI provider error ${status}: ${truncate(body)}`, status === 429 ? 'rate_limit' : 'unknown')
    this.name = 'AIApiError'
    this.status = status
  }
}

function truncate(s: string, n = 300): string {
  const t = (s ?? '').trim()
  return t.length > n ? `${t.slice(0, n)}…` : t
}
