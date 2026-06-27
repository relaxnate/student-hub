import { IntegrationAdapter } from '../base/IntegrationAdapter'
import type { OAuthConfig, TokenResponse } from '../base/IntegrationAdapter'
import { TokenExpiredError, RateLimitError, APIError, NetworkError } from '../base/errors'
import type {
  Course, Module, ModuleItem, Assignment, AssignmentAttachment, AssignmentGroup,
  CourseFile, CoursePage, Quiz, Grade, CalendarEvent,
} from '@shared/types/entities'
import type {
  GCourse, GTopic, GCourseWork, GStudentSubmission,
  GDate, GTimeOfDay,
} from './google-classroom.types'

const GC_BASE      = 'https://classroom.googleapis.com/v1'
const TOKEN_URL    = 'https://oauth2.googleapis.com/token'
const AUTH_URL     = 'https://accounts.google.com/o/oauth2/v2/auth'
const REDIRECT_URI = 'student-hub://oauth/google-classroom/callback'

// Minimal read-only scope set that powers the student experience (identity +
// courses + the student's own coursework, submissions/grades, and topics for
// modules). We deliberately DON'T request rosters/announcements — fewer
// sensitive scopes means lighter Google verification and a shorter consent
// screen for students. All are read-only ".me"/"readonly" scopes.
const SCOPES = [
  'openid', 'profile', 'email',
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
  'https://www.googleapis.com/auth/classroom.student-submissions.me.readonly',
  'https://www.googleapis.com/auth/classroom.topics.readonly',
].join(' ')

export class GoogleClassroomAdapter extends IntegrationAdapter {
  readonly provider    = 'google-classroom' as const
  readonly displayName = 'Google Classroom'
  private readonly clientId: string
  private readonly clientSecret: string

  constructor(clientId: string, clientSecret: string) {
    super('https://classroom.googleapis.com')
    this.clientId     = clientId
    this.clientSecret = clientSecret
  }

  getOAuthConfig(): OAuthConfig {
    return {
      authorizationUrl: AUTH_URL,
      tokenUrl:         TOKEN_URL,
      scopes:           SCOPES.split(' '),
      redirectUri:      REDIRECT_URI,
      usePKCE:          true,
    }
  }

  async exchangeCodeForToken(
    code: string,
    opts?: { codeVerifier?: string; redirectUri?: string }
  ): Promise<TokenResponse> {
    // redirect_uri MUST match the one used in the auth request. Google desktop
    // apps use a dynamic 127.0.0.1 loopback redirect (passed via opts), not the
    // custom scheme (which Google rejects).
    const body = new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      client_id:     this.clientId,
      redirect_uri:  opts?.redirectUri ?? REDIRECT_URI,
    })
    if (this.clientSecret)   body.set('client_secret', this.clientSecret)
    if (opts?.codeVerifier)  body.set('code_verifier', opts.codeVerifier)
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`)
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
      refresh_token: refreshToken,
      client_id:     this.clientId,
      client_secret: this.clientSecret,
    })
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    if (!res.ok) throw new Error('Google token refresh failed')
    const data = await res.json() as { access_token: string; expires_in?: number }
    return {
      accessToken:  data.access_token,
      refreshToken, // Google refresh tokens don't rotate
      expiresIn:    data.expires_in ?? null,
      tokenType:    'Bearer',
    }
  }

  async fetchUserProfile() {
    // The OpenID Connect userinfo endpoint returns the FLAT OIDC shape
    // ({ sub, name, email }) — NOT Classroom's userProfiles shape — so map those
    // fields. `sub` is the stable Google account id used to namespace the
    // integration. (Reading data.name.fullName/emailAddress here was wrong and
    // produced an integration id of "google-classroom-undefined".)
    const data = await this.gcRequest<{ sub: string; name?: string; email?: string }>(
      'https://www.googleapis.com/oauth2/v3/userinfo'
    )
    return {
      id:    data.sub,
      name:  data.name ?? data.email ?? 'Google account',
      email: data.email ?? null,
    }
  }

  // ─── Courses ──────────────────────────────────────────────────────────────

  async fetchCourses(): Promise<Course[]> {
    const raw = await this.gcPageTokenPaginated<GCourse>(
      `${GC_BASE}/courses?studentId=me&courseStates=ACTIVE&pageSize=30`,
      'courses'
    )
    return raw.filter(c => c.courseState === 'ACTIVE').map(c => ({
      id:           `gc-course-${c.id}`,
      integrationId: '',
      externalId:   c.id,
      name:         c.name,
      courseCode:   c.section ?? null,
      description:  c.description ?? c.descriptionHeading ?? null,
      color:        null,
      term:         null,
      startDate:    null,
      endDate:      null,
      isActive:     true,
      currentScore: null,
      currentGrade: null,
      applyGroupWeights: false,
      syncedAt:     Date.now(),
    }))
  }

  // ─── Modules (Topics) ─────────────────────────────────────────────────────
  // Google Classroom has "Topics" which serve as the closest equivalent to modules.
  // CourseWork items reference a topicId, allowing us to build the same hierarchy.

  async fetchModules(courseId: string, externalCourseId: string): Promise<Module[]> {
    const raw = await this.gcPageTokenPaginated<GTopic>(
      `${GC_BASE}/courses/${externalCourseId}/topics?pageSize=100`,
      'topic'
    )
    return raw.map((t, i) => ({
      id:                    `gc-module-${t.topicId}`,
      courseId,
      externalId:            t.topicId,
      name:                  t.name,
      position:              i,
      description:           null,
      unlockAt:              null,
      isLocked:              false,
      completedRequirements: 0,
      totalRequirements:     0,
      syncedAt:              Date.now(),
    }))
  }

  async fetchModuleItems(
    moduleId: string, courseId: string,
    externalCourseId: string, externalModuleId: string
  ): Promise<ModuleItem[]> {
    // Get coursework that belongs to this topic
    const all = await this.gcPageTokenPaginated<GCourseWork>(
      `${GC_BASE}/courses/${externalCourseId}/courseWork?pageSize=100`,
      'courseWork'
    )
    return all
      .filter(cw => cw.topicId === externalModuleId && cw.state === 'PUBLISHED')
      .map((cw, i) => ({
        id:                    `gc-module-item-${moduleId}-${cw.id}`,
        moduleId,
        courseId,
        externalId:            cw.id,
        title:                 cw.title,
        type:                  'Assignment' as const,
        position:              i,
        contentId:             `gc-assignment-${cw.id}`,
        url:                   null,
        pageUrl:               null,
        completionRequirement: null,
        isCompleted:           false,
        syncedAt:              Date.now(),
      }))
  }

  // ─── Assignment Groups ───────────────────────────────────────────────────
  // Google Classroom has no concept of weighted assignment groups.

  async fetchAssignmentGroups(_courseId: string, _externalCourseId: string): Promise<AssignmentGroup[]> {
    return []
  }

  // ─── Assignments ──────────────────────────────────────────────────────────

  async fetchAssignments(
    courseId: string, externalCourseId: string
  ): Promise<{ assignments: Assignment[]; attachments: AssignmentAttachment[] }> {
    const raw = await this.gcPageTokenPaginated<GCourseWork>(
      `${GC_BASE}/courses/${externalCourseId}/courseWork?orderBy=dueDate asc&pageSize=100`,
      'courseWork'
    )

    const assignments: Assignment[]             = []
    const attachments: AssignmentAttachment[]   = []

    for (const cw of raw) {
      if (cw.state !== 'PUBLISHED') continue

      const dueAt = cw.dueDate ? gcDateToMs(cw.dueDate, cw.dueTime) : null

      assignments.push({
        id:               `gc-assignment-${cw.id}`,
        courseId,
        externalId:       cw.id,
        title:            cw.title,
        descriptionHtml:  cw.description ? `<p>${cw.description.replace(/\n/g, '</p><p>')}</p>` : null,
        descriptionPlain: cw.description ?? null,
        dueAt,
        unlockAt:         null,
        lockAt:           null,
        pointsPossible:   cw.maxPoints ?? null,
        gradingType:      cw.maxPoints != null ? 'points' : 'not_graded',
        submissionTypes:  ['online_upload'],
        allowedExtensions: [],
        rubric:           null,
        isPublished:      true,
        isMuted:          false,
        position:         null,
        assignmentGroupId: null,
        syncedAt:         Date.now(),
      })

      // Materials → attachments
      for (const material of cw.materials ?? []) {
        const attachment = gcMaterialToAttachment(`gc-assignment-${cw.id}`, material)
        if (attachment) attachments.push(attachment)
      }
    }

    return { assignments, attachments }
  }

  // ─── Files ────────────────────────────────────────────────────────────────
  // Google Classroom doesn't have a standalone file repository per course.
  // Files are attached to individual assignments as materials.
  // We surface Drive files attached to coursework as course files.

  async fetchFiles(courseId: string, externalCourseId: string): Promise<CourseFile[]> {
    const raw = await this.gcPageTokenPaginated<GCourseWork>(
      `${GC_BASE}/courses/${externalCourseId}/courseWork?pageSize=100`,
      'courseWork'
    )

    const files: CourseFile[] = []
    for (const cw of raw) {
      for (const material of cw.materials ?? []) {
        if (material.driveFile) {
          const df = material.driveFile.driveFile
          files.push({
            id:          `gc-file-${df.id}`,
            courseId,
            externalId:  df.id,
            filename:    df.title,
            displayName: df.title,
            contentType: 'application/octet-stream',
            size:        0,
            url:         df.alternateLink,
            localPath:   null,
            folderPath:  cw.title,  // group under the assignment that contains them
            isHidden:    false,
            isLocked:    false,
            createdAt:   null,
            updatedAt:   null,
            syncedAt:    Date.now(),
          })
        }
      }
    }
    return files
  }

  async fetchPages(_courseId: string, _externalCourseId: string): Promise<CoursePage[]> {
    // Google Classroom doesn't have standalone pages. Announcements are the closest
    // equivalent but aren't instructional content. Return empty for now.
    return []
  }

  async fetchQuizzes(_courseId: string, _externalCourseId: string): Promise<Quiz[]> {
    return []
  }

  // ─── Grades ───────────────────────────────────────────────────────────────

  async fetchGrades(courseId: string, externalCourseId: string): Promise<Grade[]> {
    // Get all courseWork first so we can enumerate submission endpoints
    const courseWork = await this.gcPageTokenPaginated<GCourseWork>(
      `${GC_BASE}/courses/${externalCourseId}/courseWork?pageSize=100`,
      'courseWork'
    )

    const grades: Grade[] = []

    await Promise.all(
      courseWork
        .filter(cw => cw.state === 'PUBLISHED')
        .map(async cw => {
          const subs = await this.gcPageTokenPaginated<GStudentSubmission>(
            `${GC_BASE}/courses/${externalCourseId}/courseWork/${cw.id}/studentSubmissions?userId=me`,
            'studentSubmissions'
          )
          for (const sub of subs) {
            grades.push({
              id:             `gc-grade-${sub.id}`,
              assignmentId:   `gc-assignment-${cw.id}`,
              courseId,
              externalId:     sub.id,
              score:          sub.assignedGrade ?? null,
              pointsPossible: cw.maxPoints ?? null,
              grade:          sub.assignedGrade != null ? String(sub.assignedGrade) : null,
              enteredGrade:   sub.draftGrade != null ? String(sub.draftGrade) : null,
              submittedAt:    null,
              gradedAt:       null,
              isLate:         sub.late ?? false,
              isMissing:      false,
              isExcused:      false,
              workflowState:  gcSubmissionStateToWorkflow(sub.state),
              submissionComments: [],
              syncedAt:       Date.now(),
            })
          }
        })
    )

    return grades
  }

  async fetchCalendarEvents(
    _integrationId: string, _courseId: string | null, _externalCourseId: string | null
  ): Promise<CalendarEvent[]> {
    // Classroom events are surfaced through the course-specific Google Calendar (calendarId)
    // which requires the calendar scope. For now, return empty — Calendar integration
    // is handled by the separate GoogleCalendarAdapter.
    return []
  }

  // ─── HTTP helpers ─────────────────────────────────────────────────────────

  private async gcRequest<T>(url: string): Promise<T> {
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
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After')
      throw new RateLimitError(retryAfter ? parseInt(retryAfter) * 1000 : 60_000)
    }
    // 403 (course the student can't read via API) and other non-OK statuses
    // surface as APIError — SyncEngine treats 403 as an expected restriction and
    // keeps syncing the rest, so one locked course never blocks the others.
    if (!response.ok) throw new APIError(response.status, await response.text().catch(() => ''))
    return response.json() as Promise<T>
  }

  // Google Classroom uses pageToken pagination (not Link headers)
  private async gcPageTokenPaginated<T>(
    baseUrl: string,
    dataKey: string
  ): Promise<T[]> {
    const results: T[] = []
    let pageToken: string | undefined

    do {
      const url      = pageToken ? `${baseUrl}&pageToken=${pageToken}` : baseUrl
      const response = await this.gcRequest<Record<string, unknown>>(url)
      const items    = response[dataKey]
      if (Array.isArray(items)) results.push(...items as T[])
      pageToken = response.nextPageToken as string | undefined
    } while (pageToken)

    return results
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function gcDateToMs(date: GDate, time?: GTimeOfDay): number {
  return new Date(
    date.year, date.month - 1, date.day,
    time?.hours ?? 23, time?.minutes ?? 59, 0
  ).getTime()
}

function gcMaterialToAttachment(
  assignmentId: string,
  material: { driveFile?: { driveFile: { id: string; title: string; alternateLink: string } }; link?: { url: string; title?: string } }
): AssignmentAttachment | null {
  if (material.driveFile) {
    const df = material.driveFile.driveFile
    return {
      id:           `gc-attach-${assignmentId}-${df.id}`,
      assignmentId,
      fileId:       null,
      url:          df.alternateLink,
      filename:     df.title,
      contentType:  null,
      size:         null,
    }
  }
  if (material.link) {
    return {
      id:           `gc-attach-${assignmentId}-${encodeURIComponent(material.link.url)}`,
      assignmentId,
      fileId:       null,
      url:          material.link.url,
      filename:     material.link.title ?? material.link.url,
      contentType:  null,
      size:         null,
    }
  }
  return null
}

function gcSubmissionStateToWorkflow(state: string): Grade['workflowState'] {
  switch (state) {
    case 'TURNED_IN': return 'submitted'
    case 'RETURNED':  return 'graded'
    default:          return 'unsubmitted'
  }
}
