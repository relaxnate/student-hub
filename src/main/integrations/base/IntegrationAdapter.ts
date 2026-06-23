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

  /** Exchange an authorization code (from the OAuth callback) for tokens. */
  abstract exchangeCodeForToken(code: string, codeVerifier?: string): Promise<TokenResponse>

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

  protected async request<T>(
    urlOrPath: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (!this.accessToken) throw new TokenExpiredError()

    const url = urlOrPath.startsWith('http')
      ? urlOrPath
      : `${this.baseUrl}${urlOrPath}`

    let response: Response
    try {
      response = await fetch(url, {
        ...options,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept':        'application/json',
          'Content-Type':  'application/json',
          ...options.headers,
        },
      })
    } catch (cause) {
      throw new NetworkError(cause)
    }

    if (response.status === 401) throw new TokenExpiredError()

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After')
      throw new RateLimitError(retryAfter ? parseInt(retryAfter) * 1000 : 60_000)
    }

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

    while (nextUrl) {
      const response = await fetch(nextUrl, {
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
      results.push(...page)

      // Parse Link header: <https://...>; rel="next"
      const linkHeader = response.headers.get('Link') ?? ''
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/)
      nextUrl = nextMatch ? nextMatch[1] : null
    }

    return results
  }
}
