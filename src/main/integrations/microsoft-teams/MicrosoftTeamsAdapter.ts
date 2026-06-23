import { IntegrationAdapter } from '../base/IntegrationAdapter'
import type { OAuthConfig, TokenResponse } from '../base/IntegrationAdapter'
import { TokenExpiredError, APIError, NetworkError } from '../base/errors'
import type {
  Course, Module, ModuleItem, Assignment, AssignmentAttachment, AssignmentGroup,
  CourseFile, CoursePage, Quiz, Grade, CalendarEvent, RubricCriterion,
} from '@shared/types/entities'
import type {
  MSEduClass, MSEduAssignment, MSEduSubmission,
  MSSubmissionOutcome, MSListResponse, MSUser,
} from './teams.types'

const GRAPH_BASE   = 'https://graph.microsoft.com/v1.0'
const REDIRECT_URI = 'student-hub://oauth/microsoft-teams/callback'

const SCOPES = [
  'openid', 'profile', 'email', 'offline_access',
  'User.Read',
  'EduAssignments.ReadBasic',
  'EduRoster.ReadBasic',
  'Calendars.Read',
].join(' ')

export class MicrosoftTeamsAdapter extends IntegrationAdapter {
  readonly provider    = 'microsoft-teams' as const
  readonly displayName = 'Microsoft Teams'
  private readonly clientId: string
  private readonly tenantId: string

  constructor(clientId: string, tenantId = 'common') {
    super('https://login.microsoftonline.com')
    this.clientId = clientId
    this.tenantId = tenantId
  }

  private get authBase() {
    return `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0`
  }

  getOAuthConfig(): OAuthConfig {
    return {
      authorizationUrl: `${this.authBase}/authorize`,
      tokenUrl:         `${this.authBase}/token`,
      scopes:           SCOPES.split(' '),
      redirectUri:      REDIRECT_URI,
      usePKCE:          true,    // Microsoft Identity Platform requires PKCE for public clients
    }
  }

  async exchangeCodeForToken(code: string): Promise<TokenResponse> {
    const body = new URLSearchParams({
      grant_type:   'authorization_code',
      client_id:    this.clientId,
      redirect_uri: REDIRECT_URI,
      scope:        SCOPES,
      code,
    })
    const res = await fetch(`${this.authBase}/token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    })
    if (!res.ok) throw new Error(`MS token exchange failed: ${await res.text()}`)
    const data = await res.json() as {
      access_token: string; refresh_token?: string; expires_in?: number; token_type: string
    }
    return {
      accessToken:  data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresIn:    data.expires_in ?? null,
      tokenType:    data.token_type,
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
    const body = new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     this.clientId,
      refresh_token: refreshToken,
      scope:         SCOPES,
    })
    const res = await fetch(`${this.authBase}/token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    })
    if (!res.ok) throw new Error('MS token refresh failed')
    const data = await res.json() as { access_token: string; refresh_token?: string; expires_in?: number }
    return {
      accessToken:  data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresIn:    data.expires_in ?? null,
      tokenType:    'Bearer',
    }
  }

  async fetchUserProfile() {
    const user = await this.msRequest<MSUser>(`${GRAPH_BASE}/me`)
    return {
      id:    user.id,
      name:  user.displayName,
      email: user.mail ?? user.userPrincipalName ?? null,
    }
  }

  // ─── Courses (Education Classes) ──────────────────────────────────────────

  async fetchCourses(): Promise<Course[]> {
    const raw = await this.msPagedRequest<MSEduClass>(`${GRAPH_BASE}/education/me/classes`)
    return raw.map(cls => ({
      id:           `ms-course-${cls.id}`,
      integrationId: '',
      externalId:   cls.id,
      name:         cls.displayName,
      courseCode:   cls.course?.courseNumber ?? cls.mailNickname,
      description:  cls.description ?? cls.course?.description ?? null,
      color:        null,
      term:         cls.term?.displayName ?? null,
      startDate:    cls.term?.startDate ? new Date(cls.term.startDate).getTime() : null,
      endDate:      cls.term?.endDate   ? new Date(cls.term.endDate).getTime()   : null,
      isActive:     true,
      currentScore: null,
      currentGrade: null,
      applyGroupWeights: false,
      syncedAt:     Date.now(),
    }))
  }

  // ─── Modules ──────────────────────────────────────────────────────────────
  // Teams EDU doesn't have a module/topic hierarchy equivalent.
  // We synthesize a single module per class to hold all assignments.

  async fetchModules(courseId: string, _externalCourseId: string): Promise<Module[]> {
    return [{
      id:                    `ms-module-${courseId}`,
      courseId,
      externalId:            `${courseId}-assignments`,
      name:                  'Assignments',
      position:              0,
      description:           null,
      unlockAt:              null,
      isLocked:              false,
      completedRequirements: 0,
      totalRequirements:     0,
      syncedAt:              Date.now(),
    }]
  }

  async fetchModuleItems(
    moduleId: string, courseId: string,
    externalCourseId: string, _externalModuleId: string
  ): Promise<ModuleItem[]> {
    const raw = await this.msPagedRequest<MSEduAssignment>(
      `${GRAPH_BASE}/education/classes/${externalCourseId}/assignments`
    )
    return raw
      .filter(a => a.status === 'assigned')
      .map((a, i) => ({
        id:                    `ms-item-${moduleId}-${a.id}`,
        moduleId,
        courseId,
        externalId:            a.id,
        title:                 a.displayName,
        type:                  'Assignment' as const,
        position:              i,
        contentId:             `ms-assignment-${a.id}`,
        url:                   null,
        pageUrl:               null,
        completionRequirement: null,
        isCompleted:           false,
        syncedAt:              Date.now(),
      }))
  }

  // ─── Assignment Groups ───────────────────────────────────────────────────
  // Teams for Education has no concept of weighted assignment groups.

  async fetchAssignmentGroups(_courseId: string, _externalCourseId: string): Promise<AssignmentGroup[]> {
    return []
  }

  // ─── Assignments ──────────────────────────────────────────────────────────

  async fetchAssignments(
    courseId: string, externalCourseId: string
  ): Promise<{ assignments: Assignment[]; attachments: AssignmentAttachment[] }> {
    const raw = await this.msPagedRequest<MSEduAssignment>(
      `${GRAPH_BASE}/education/classes/${externalCourseId}/assignments`
    )

    const assignments: Assignment[]           = []
    const attachments: AssignmentAttachment[] = []

    for (const a of raw) {
      if (a.status === 'draft') continue

      const instructionHtml = a.instructions?.contentType === 'html'
        ? a.instructions.content
        : a.instructions?.content
          ? `<p>${a.instructions.content.replace(/\n/g, '</p><p>')}</p>`
          : null

      const rubric: RubricCriterion[] | null = a.rubric
        ? a.rubric.qualities.map((q, qi) => ({
            id:              q.qualityId,
            description:     q.displayName,
            longDescription: q.description?.content ?? null,
            points:          q.weight ?? 0,
            ratings:         a.rubric!.levels.map((l, li) => ({
              id:              `${q.qualityId}-${l.levelId}`,
              description:     l.displayName,
              longDescription: q.criteria[li]?.description.content ?? null,
              points:          0,
            })),
          }))
        : null

      assignments.push({
        id:               `ms-assignment-${a.id}`,
        courseId,
        externalId:       a.id,
        title:            a.displayName,
        descriptionHtml:  instructionHtml,
        descriptionPlain: a.instructions?.content ?? null,
        dueAt:            a.dueDateTime ? new Date(a.dueDateTime).getTime() : null,
        unlockAt:         a.assignedDateTime ? new Date(a.assignedDateTime).getTime() : null,
        lockAt:           null,
        pointsPossible:   a.grading && 'maxPoints' in a.grading ? a.grading.maxPoints ?? null : null,
        gradingType:      'points',
        submissionTypes:  ['online_upload'],
        allowedExtensions: [],
        rubric,
        isPublished:      a.status === 'assigned',
        isMuted:          false,
        position:         null,
        assignmentGroupId: null,
        syncedAt:         Date.now(),
      })

      for (const res of a.resources ?? []) {
        const r = res.resource
        attachments.push({
          id:           `ms-attach-${a.id}-${res.id}`,
          assignmentId: `ms-assignment-${a.id}`,
          fileId:       null,
          url:          r.fileUrl ?? r.link ?? null,
          filename:     r.displayName,
          contentType:  null,
          size:         null,
        })
      }
    }

    return { assignments, attachments }
  }

  async fetchFiles(_courseId: string, _externalCourseId: string): Promise<CourseFile[]> {
    // Teams files live in SharePoint/OneDrive. Fetching them requires the
    // Files.Read scope and additional Graph API calls. Implemented in Phase 4.
    return []
  }

  async fetchPages(_courseId: string, _externalCourseId: string): Promise<CoursePage[]> {
    return []
  }

  async fetchQuizzes(_courseId: string, _externalCourseId: string): Promise<Quiz[]> {
    return []
  }

  // ─── Grades ───────────────────────────────────────────────────────────────

  async fetchGrades(courseId: string, externalCourseId: string): Promise<Grade[]> {
    const assignmentList = await this.msPagedRequest<MSEduAssignment>(
      `${GRAPH_BASE}/education/classes/${externalCourseId}/assignments`
    )

    const grades: Grade[] = []

    await Promise.all(
      assignmentList
        .filter(a => a.status === 'assigned')
        .map(async a => {
          const subs = await this.msPagedRequest<MSEduSubmission>(
            `${GRAPH_BASE}/education/classes/${externalCourseId}/assignments/${a.id}/submissions`
          )
          for (const sub of subs) {
            const pointsOutcome = (sub.outcomes ?? []).find(
              o => o['@odata.type'] === '#microsoft.graph.educationPointsOutcome'
            )
            const score = pointsOutcome?.publishedPoints?.points ?? pointsOutcome?.points?.points ?? null
            const maxPts = a.grading && 'maxPoints' in a.grading ? a.grading.maxPoints ?? null : null

            grades.push({
              id:             `ms-grade-${sub.id}`,
              assignmentId:   `ms-assignment-${a.id}`,
              courseId,
              externalId:     sub.id,
              score,
              pointsPossible: maxPts,
              grade:          score != null ? String(score) : null,
              enteredGrade:   null,
              submittedAt:    sub.submittedDateTime ? new Date(sub.submittedDateTime).getTime() : null,
              gradedAt:       sub.returnedDateTime  ? new Date(sub.returnedDateTime).getTime()  : null,
              isLate:         false,
              isMissing:      sub.status === 'working',
              isExcused:      false,
              workflowState:  msSubmissionStateToWorkflow(sub.status),
              submissionComments: [],
              syncedAt:       Date.now(),
            })
          }
        })
    )

    return grades
  }

  async fetchCalendarEvents(
    integrationId: string, _courseId: string | null, _externalCourseId: string | null
  ): Promise<CalendarEvent[]> {
    const now      = new Date()
    const twoMonths = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
    const start    = now.toISOString()
    const end      = twoMonths.toISOString()

    const raw = await this.msPagedRequest<{
      id: string; subject: string; body?: { content: string }
      start: { dateTime: string }; end: { dateTime: string }
      isAllDay: boolean; location?: { displayName?: string }
    }>(`${GRAPH_BASE}/me/calendar/events?$filter=start/dateTime ge '${start}' and start/dateTime le '${end}'`)

    return raw.map(e => ({
      id:            `ms-event-${e.id}`,
      integrationId,
      courseId:      null,
      externalId:    e.id,
      title:         e.subject,
      description:   e.body?.content ?? null,
      startAt:       new Date(e.start.dateTime).getTime(),
      endAt:         new Date(e.end.dateTime).getTime(),
      allDay:        e.isAllDay,
      eventType:     'event' as const,
      assignmentId:  null,
      location:      e.location?.displayName ?? null,
      syncedAt:      Date.now(),
    }))
  }

  // ─── HTTP helpers ─────────────────────────────────────────────────────────

  private async msRequest<T>(url: string): Promise<T> {
    if (!this.accessToken) throw new TokenExpiredError()
    let response: Response
    try {
      response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${this.accessToken}`, 'Accept': 'application/json' },
      })
    } catch (cause) {
      throw new NetworkError(cause)
    }
    if (response.status === 401) throw new TokenExpiredError()
    if (!response.ok) throw new APIError(response.status, await response.text().catch(() => ''))
    return response.json() as Promise<T>
  }

  // Graph API uses @odata.nextLink for pagination
  private async msPagedRequest<T>(url: string): Promise<T[]> {
    const results: T[] = []
    let nextLink: string | null = url

    while (nextLink) {
      const page = await this.msRequest<MSListResponse<T>>(nextLink)
      results.push(...page.value)
      nextLink = page['@odata.nextLink'] ?? null
    }

    return results
  }
}

function msSubmissionStateToWorkflow(state: string): Grade['workflowState'] {
  switch (state) {
    case 'submitted': return 'submitted'
    case 'released':
    case 'returned':  return 'graded'
    default:          return 'unsubmitted'
  }
}
