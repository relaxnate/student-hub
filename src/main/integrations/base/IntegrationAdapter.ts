import type {
  Course,
  Module,
  ModuleItem,
  Assignment,
  AssignmentAttachment,
  AssignmentGroup,
  CourseFile,
  CoursePage,
  Quiz,
  Grade,
  CalendarEvent,
  IntegrationProvider,
} from '@shared/types/entities'
import { TokenExpiredError, RateLimitError, APIError, NetworkError } from './errors'

export interface OAuthConfig {
  authorizationUrl: string
  tokenUrl: string
  scopes: string[]
  redirectUri: string
  // PKCE is used by default — no client secret needed for desktop apps
  usePKCE: boolean
}

export interface TokenResponse {
  accessToken: string
  refreshToken: string | null
  expiresIn: number | null    // seconds
  tokenType: string
}

// The shape returned by the normalise methods — ready to write to the DB.
// Using string IDs that are globally unique (prefixed with provider short name).
export interface NormalizedSyncData {
  courses:     Course[]
  modules:     Module[]
  moduleItems: ModuleItem[]
  assignments: Assignment[]
  attachments: AssignmentAttachment[]
  files:       CourseFile[]
  pages:       CoursePage[]
  quizzes:     Quiz[]
  grades:      Grade[]
  events:      CalendarEvent[]
}

/**
 * Every LMS adapter extends this class.
 *
 * Responsibility split:
 * - The base class handles HTTP, pagination, rate-limit retries, and token refresh.
 * - Subclasses implement the platform-specific fetch and normalise methods.
 */
export abstract class IntegrationAdapter {
  abstract readonly provider: IntegrationProvider
  abstract readonly displayName: string

  protected accessToken: string | null = null
  protected refreshToken: string | null = null
  protected tokenExpiresAt: number | null = null  // unix ms
  protected baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '')  // strip trailing slash
  }

  abstract getOAuthConfig(): OAuthConfig

  /**
   * Exchange an authorization code (from the OAuth callback) for tokens.
   * `opts.codeVerifier` carries the PKCE verifier; `opts.redirectUri` overrides
   * the adapter's default redirect (needed for Google's dynamic 127.0.0.1
   * loopback port — the token request's redirect_uri must match the auth request).
   */
  abstract exchangeCodeForToken(
    code: string,
    opts?: { codeVerifier?: string; redirectUri?: string }
  ): Promise<TokenResponse>

  /** Use the refresh token to get a new access token. */
  abstract refreshAccessToken(refreshToken: string): Promise<TokenResponse>

  /** Fetch the authenticated user's profile info. */
  abstract fetchUserProfile(): Promise<{ id: string; name: string; email: string | null }>

  // ─── Per-course fetch methods (implemented by each adapter) ─────────────

  abstract fetchCourses(): Promise<Course[]>
  abstract fetchModules(courseId: string, externalCourseId: string): Promise<Module[]>
  abstract fetchModuleItems(moduleId: string, courseId: string, externalCourseId: string, externalModuleId: string): Promise<ModuleItem[]>
  abstract fetchAssignmentGroups(courseId: string, externalCourseId: string): Promise<AssignmentGroup[]>
  abstract fetchAssignments(courseId: string, externalCourseId: string): Promise<{ assignments: Assignment[]; attachments: AssignmentAttachment[] }>
  abstract fetchFiles(courseId: string, externalCourseId: string): Promise<CourseFile[]>
  abstract fetchPages(courseId: string, externalCourseId: string): Promise<CoursePage[]>
  abstract fetchQuizzes(courseId: string, externalCourseId: string): Promise<Quiz[]>
  abstract fetchGrades(courseId: string, externalCourseId: string): Promise<Grade[]>
  abstract fetchCalendarEvents(integrationId: string, courseId: string | null, externalCourseId: string | null): Promise<CalendarEvent[]>

  // ─── Auth helpers ────────────────────────────────────────────────────────

  setTokens(accessToken: string, refreshToken: string | null, expiresAt: number | null): void {
    this.accessToken  = accessToken
    this.refreshToken = refreshToken
    this.tokenExpiresAt = expiresAt
  }

  isTokenExpired(): boolean {
    if (!this.tokenExpiresAt) return false
    // Consider expired 5 min before actual expiry
    return Date.now() >= this.tokenExpiresAt - 5 * 60 * 1000
  }

  // ─── HTTP primitives ─────────────────────────────────────────────────────

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // Exponential backoff with jitter: ~0.5s, 1s, 2s, …, capped at 8s.
  private backoffMs(attempt: number): number {
    const base = Math.min(8000, 500 * 2 ** (attempt - 1))
    return base + Math.floor(Math.random() * 250)
  }

  /**
   * fetch() with transparent retry on TRANSIENT failures only — network blips,
   * HTTP 429 (honouring Retry-After), and 5xx server errors. Returns the
   * Response for the caller to handle auth / ok / parsing; throws the
   * appropriate typed error once retries are exhausted. Non-transient responses
   * (4xx other than 429) return immediately so they aren't pointlessly retried.
   */
  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    maxAttempts = 3
  ): Promise<Response> {
    let attempt = 0
    for (;;) {
      attempt++
      let response: Response
      try {
        response = await fetch(url, init)
      } catch (cause) {
        if (attempt < maxAttempts) { await this.sleep(this.backoffMs(attempt)); continue }
        throw new NetworkError(cause)
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After')
        const retryAfterMs = retryAfter ? parseInt(retryAfter) * 1000 : 60_000
        if (attempt < maxAttempts) {
          await this.sleep(Math.min(retryAfter ? retryAfterMs : this.backoffMs(attempt), 30_000))
          continue
        }
        throw new RateLimitError(retryAfterMs)
      }

      // Canvas signals request throttling with **403 (Rate Limit Exceeded)**, NOT
      // 429 (its leaky-bucket quota is exhausted). This is transient — back off and
      // retry. Crucially, this must be distinguished from a genuine permission 403:
      // the SyncEngine treats permission-403s as "expected restriction" and SILENTLY
      // drops that course's data, so a throttle misread as a permission error would
      // lose real grades/assignments with no retry and no warning (worse for students
      // with many courses, who hit the quota soonest). On exhaustion we throw
      // RateLimitError so the sync stops cleanly with a "try again" message instead.
      if (response.status === 403 && await this.isThrottleResponse(response)) {
        if (attempt < maxAttempts) { await this.sleep(this.backoffMs(attempt)); continue }
        throw new RateLimitError(this.backoffMs(attempt))
      }

      // Transient server errors — worth another try.
      if (response.status >= 500 && attempt < maxAttempts) {
        await this.sleep(this.backoffMs(attempt))
        continue
      }

      return response
    }
  }

  /**
   * Whether a 403 is Canvas's rate-limit throttle (vs. a real permission denial).
   * Canvas exhausts a per-token "leaky bucket" and returns 403 with the body
   * "403 Forbidden (Rate Limit Exceeded)" and an `X-Rate-Limit-Remaining: 0`
   * header. We check the header first (cheap) and fall back to peeking a CLONE of
   * the body so the original response stays readable for a genuine-permission 403.
   */
  private async isThrottleResponse(response: Response): Promise<boolean> {
    const remaining = response.headers.get('X-Rate-Limit-Remaining')
    if (remaining !== null && parseFloat(remaining) <= 0) return true
    try {
      return /rate limit exceeded/i.test(await response.clone().text())
    } catch {
      return false
    }
  }

  protected async request<T>(
    urlOrPath: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (!this.accessToken) throw new TokenExpiredError()

    const url = urlOrPath.startsWith('http')
      ? urlOrPath
      : `${this.baseUrl}${urlOrPath}`

    const response = await this.fetchWithRetry(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Accept':        'application/json',
        'Content-Type':  'application/json',
        ...options.headers,
      },
    })

    if (response.status === 401) throw new TokenExpiredError()

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new APIError(response.status, body)
    }

    return response.json() as Promise<T>
  }

  /**
   * Follows Link header pagination (used by Canvas, GitHub-style APIs).
   * Accumulates all pages and returns the full array.
   */
  protected async requestPaginated<T>(
    initialPath: string,
    options: RequestInit = {}
  ): Promise<T[]> {
    const results: T[] = []
    let nextUrl: string | null = `${this.baseUrl}${initialPath}`
    // Safety cap: a malformed/cyclic Link header must never loop forever. At
    // per_page=100 this still allows up to 50,000 items per resource — far beyond
    // any real course — while bounding a pathological response.
    const MAX_PAGES = 500
    const seen = new Set<string>()
    let pages = 0

    while (nextUrl && pages < MAX_PAGES) {
      if (seen.has(nextUrl)) break   // Canvas returned a self-referential "next" — stop.
      seen.add(nextUrl)
      pages++

      const response = await this.fetchWithRetry(nextUrl, {
        ...options,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept':        'application/json',
          ...options.headers,
        },
      })

      if (response.status === 401) throw new TokenExpiredError()
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new APIError(response.status, body)
      }

      const page = await response.json() as T[]
      if (Array.isArray(page)) results.push(...page)

      // Parse Link header: <https://...>; rel="next"
      const linkHeader = response.headers.get('Link') ?? ''
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/)
      nextUrl = nextMatch ? nextMatch[1] : null
    }

    return results
  }
}
