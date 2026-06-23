/** The access token is expired or revoked. The OAuth flow must be restarted. */
export class TokenExpiredError extends Error {
  constructor() {
    super('Access token is expired or has been revoked')
    this.name = 'TokenExpiredError'
  }
}

/** The rate limit has been hit. Retry after `retryAfterMs` ms. */
export class RateLimitError extends Error {
  readonly retryAfterMs: number
  constructor(retryAfterMs = 60_000) {
    super(`Rate limit exceeded — retry after ${retryAfterMs}ms`)
    this.name = 'RateLimitError'
    this.retryAfterMs = retryAfterMs
  }
}

/** The LMS returned an unexpected HTTP status code. */
export class APIError extends Error {
  readonly statusCode: number
  readonly body: string
  constructor(statusCode: number, body: string) {
    super(`LMS API error ${statusCode}: ${body.slice(0, 200)}`)
    this.name = 'APIError'
    this.statusCode = statusCode
    this.body = body
  }
}

/** The institution's URL could not be reached. */
export class NetworkError extends Error {
  readonly cause: unknown
  constructor(cause: unknown) {
    super(`Network request failed: ${String(cause)}`)
    this.name = 'NetworkError'
    this.cause = cause
  }
}

/** The adapter received data it cannot parse — indicates a breaking API change. */
export class ParseError extends Error {
  readonly raw: unknown
  constructor(message: string, raw: unknown) {
    super(`Parse error: ${message}`)
    this.name = 'ParseError'
    this.raw = raw
  }
}
