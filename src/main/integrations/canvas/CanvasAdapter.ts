import crypto from 'crypto'
import { IntegrationAdapter } from '../base/IntegrationAdapter'
import type { OAuthConfig, TokenResponse } from '../base/IntegrationAdapter'
import { ParseError } from '../base/errors'
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
  RubricCriterion,
} from '@shared/types/entities'
import type {
  CanvasCourse,
  CanvasEnrollment,
  CanvasModule,
  CanvasModuleItem,
  CanvasAssignment,
  CanvasAssignmentGroup,
  CanvasFile,
  CanvasFolder,
  CanvasPage,
  CanvasQuiz,
  CanvasSubmission,
} from './canvas.types'
import { logDebug } from '../../crash-logger'

// Canvas uses per-institution OAuth with developer keys.
// Each institution runs their own Canvas instance at a unique base URL.
// The redirect URI must be registered in the Canvas developer key settings.

const CANVAS_REDIRECT_URI = 'student-hub://oauth/canvas/callback'

export class CanvasAdapter extends IntegrationAdapter {
  readonly provider = 'canvas' as const
  readonly displayName = 'Canvas'

  // The client ID comes from the developer key registered at the institution.
  private readonly clientId: string

  constructor(institutionUrl: string, clientId: string) {
    super(institutionUrl)
    this.clientId = clientId
  }

  getOAuthConfig(): OAuthConfig {
    return {
      authorizationUrl: `${this.baseUrl}/login/oauth2/auth`,
      tokenUrl:         `${this.baseUrl}/login/oauth2/token`,
      scopes:           [], // Canvas uses purpose-based scope (set in developer key)
      redirectUri:      CANVAS_REDIRECT_URI,
      usePKCE:          false, // Canvas OAuth2 does not support PKCE for developer keys
    }
  }

  /** Build the authorization URL the user is sent to in their browser. */
  buildAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id:     this.clientId,
      response_type: 'code',
      redirect_uri:  CANVAS_REDIRECT_URI,
      state,
    })
    return `${this.baseUrl}/login/oauth2/auth?${params.toString()}`
  }

  async exchangeCodeForToken(code: string): Promise<TokenResponse> {
    const body = new URLSearchParams({
      grant_type:   'authorization_code',
      client_id:    this.clientId,
      redirect_uri: CANVAS_REDIRECT_URI,
      code,
    })

    const response = await fetch(`${this.baseUrl}/login/oauth2/token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Canvas token exchange failed: ${text}`)
    }

    const data = await response.json() as {
      access_token: string
      refresh_token?: string
      expires_in?: number
      token_type: string
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
    })

    const response = await fetch(`${this.baseUrl}/login/oauth2/token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    })

    if (!response.ok) throw new Error('Canvas token refresh failed')

    const data = await response.json() as {
      access_token: string
      expires_in?: number
      token_type: string
    }

    return {
      accessToken:  data.access_token,
      refreshToken, // Canvas refresh tokens don't rotate
      expiresIn:    data.expires_in ?? null,
      tokenType:    data.token_type,
    }
  }

  async fetchUserProfile() {
    const user = await this.request<{
      id: number
      name: string
      primary_email?: string
      email?: string
    }>('/api/v1/users/self')

    return {
      id:    String(user.id),
      name:  user.name,
      email: user.primary_email ?? user.email ?? null,
    }
  }

  // ─── Courses ─────────────────────────────────────────────────────────────

  async fetchCourses(): Promise<Course[]> {
    // 'enrollment_state=active' alone would skip every course from a past
    // term, which is exactly the data the Grade & GPA Calculator needs for
    // historical GPA. We explicitly request both active (current) and
    // completed (past) enrollments — this deliberately excludes
    // 'invited_or_pending' courses the student hasn't accepted yet, which
    // shouldn't appear anywhere in the app. We include enrollments so we can
    // see the student's grade data and determine per-course active/past status.
    const raw = await this.requestPaginated<CanvasCourse>(
      '/api/v1/courses?enrollment_state[]=active&enrollment_state[]=completed' +
      '&include[]=term&include[]=enrollments&per_page=50'
    )

    // Keep the raw list and the normalized list index-aligned so the second
    // pass can inspect each course's raw dates.
    const kept    = raw.filter(c => c.workflow_state !== 'deleted')
    const courses = kept.map(c => this.normalizeCourse(c))

    // ── Second pass: relative-recency downgrade (DATELESS courses only) ─────
    // Date-driven detection in normalizeCourse() already correctly classifies
    // any course that has start/end dates. But some courses/terms carry NO
    // dates at all (e.g. a "Default Term" homeroom). For those, we can't use a
    // date window, so we fall back to comparing the school YEAR parsed from the
    // term name / course code / course name, and downgrade any dateless course
    // whose year is older than the newest year we see. We ONLY touch dateless
    // courses here — dated ones must keep whatever the date window decided
    // (this is what previously broke: Spring 2026 and Summer 2026 are both
    // "2026", so a year-only rule could never separate them — dates can).
    const isDateless = (c: CanvasCourse): boolean =>
      !c.start_at && !c.end_at && !c.term?.start_at && !c.term?.end_at

    const yearOf = (c: Course): number | null => {
      for (const s of [c.term, c.courseCode, c.name].filter(Boolean) as string[]) {
        const m = s.match(/(19|20)\d{2}/g)
        if (m?.length) return Math.max(...m.map(Number))
      }
      return null
    }

    const activeYears = courses
      .filter(c => c.isActive)
      .map(yearOf)
      .filter((y): y is number => y !== null)

    if (activeYears.length > 0) {
      const newestYear = Math.max(...activeYears)
      courses.forEach((c, i) => {
        if (!c.isActive) return
        if (!isDateless(kept[i])) return   // dated courses already settled by the date window
        const y = yearOf(c)
        if (y !== null && y < newestYear) c.isActive = false
      })
    }

    return courses
  }

  private normalizeCourse(raw: CanvasCourse): Course {
    // Canvas already computes the correct grade percentage for us — it
    // accounts for weighted assignment groups, dropped grades, and any
    // grading-scheme rules the instructor has configured. We pull it from
    // the student's own enrollment record rather than re-deriving it from
    // raw assignment scores, so the number always matches what the student
    // sees on the Canvas grades page. This also gives the Grade & GPA
    // Calculator a usable score for historical courses even before (or in
    // place of) any per-assignment data being synced for them.
    //
    // A course can carry more than one enrollment (e.g. cross-listed
    // sections); prefer an active StudentEnrollment, but fall back to any
    // enrollment with a 'student' type if none is currently active (this is
    // exactly the case for a past/completed course, where the only student
    // enrollment present will have enrollment_state 'completed').
    // Canvas reports the enrollment `type` inconsistently across instances and
    // endpoints. The embedded-on-course shape (what include[]=enrollments
    // returns) is usually the lowercase short form "student", but the canonical
    // Enrollment object — and some Canvas versions/instances even in the
    // embedded shape — return "StudentEnrollment", and a few use the snake_case
    // "student_enrollment". The old code matched only the exact lowercase
    // "student", so on a school whose Canvas returns "StudentEnrollment" we
    // failed to find the enrollment at all → currentScore/currentGrade became
    // null for EVERY course → no grades anywhere (BUG-009). Match all spellings
    // case-insensitively.
    const enrollments = raw.enrollments ?? []
    const activeEnrollment =
      enrollments.find(e => isStudentEnrollment(e) && e.enrollment_state === 'active')
    let studentEnrollment: CanvasEnrollment | undefined =
      activeEnrollment ?? enrollments.find(e => isStudentEnrollment(e))

    // Last-resort fallback: if no enrollment matched any known student spelling
    // but one of them actually carries grade data, use it rather than silently
    // dropping the student's grade. Reading a grade we maybe shouldn't is
    // harmless; hiding a real grade is the bug we're fixing.
    if (!studentEnrollment) {
      const withGrade = enrollments.find(
        e => e.computed_current_score != null || e.computed_current_grade != null
      )
      if (withGrade) {
        logDebug(
          `[CanvasAdapter] course ${raw.id} "${raw.name}": no recognized student ` +
          `enrollment type (saw: ${enrollments.map(e => e.type).join(', ') || 'none'}); ` +
          `falling back to an enrollment that carries grade data`
        )
        studentEnrollment = withGrade
      } else if (enrollments.length > 0) {
        logDebug(
          `[CanvasAdapter] course ${raw.id} "${raw.name}": no student enrollment and ` +
          `no enrollment carries grade data (types: ${enrollments.map(e => e.type).join(', ')})`
        )
      }
    }

    // Diagnostic: record the enrollment type we matched and flag a null official
    // score, so a future "no grades" report can be confirmed from the installed
    // app's log file without dev tools.
    if (studentEnrollment && studentEnrollment.computed_current_score == null) {
      logDebug(
        `[CanvasAdapter] course ${raw.id} "${raw.name}": matched enrollment ` +
        `type="${studentEnrollment.type}" but computed_current_score is null`
      )
    }

    // ── Determine "is this one of my CURRENT classes" ──────────────────────
    // enrollment_state alone is unreliable on school-district Canvas
    // instances: many leave a student's enrollment marked 'active' even after
    // the course is rolled into a concluded/"Archive" term (exactly what we
    // see with Fulton's "Archive 2024-25" courses). So we layer in stronger
    // signals and treat a course as INACTIVE if any of them say it's over:
    //
    //   1. The student's enrollment is explicitly completed/inactive, OR has
    //      a completed_at timestamp.
    //   2. The course's own end_at date has passed (and restricts students
    //      after end — Canvas exposes end_at on the course object).
    //   3. The enrollment term's end_at date has passed.
    //   4. The term name looks archival ("Archive …", "Concluded", or a year
    //      range strictly before the most-recent term we saw).
    //
    // We start from the strict enrollment signal and only downgrade to
    // inactive — never the reverse — so a genuinely current course is never
    // hidden.
    // ── DATE-WINDOW active detection ───────────────────────────────────────
    // enrollment_state is unreliable here: this school leaves EVERY enrollment
    // 'active' (past and present alike), so we cannot trust it. The authoritative
    // signal is whether TODAY falls inside the course/term date window. Example
    // that drove this: it's summer break (2026-06-23) — Spring 2026 courses
    // ended in May and must become history, while summer credit-recovery courses
    // running now must stay current, even though Canvas marks them all 'active'.
    const now = Date.now()
    const GRACE_MS  = 10 * 24 * 60 * 60 * 1000   // keep a course ~10 days past its end before archiving (final-week buffer)
    const LEAD_MS   = 21 * 24 * 60 * 60 * 1000   // a course starting >21 days out is a FUTURE term, not current yet

    const parseTs = (s?: string | null): number | null => (s ? new Date(s).getTime() : null)
    // Prefer the course's own dates; fall back to the enrollment term's dates.
    const effStart = parseTs(raw.start_at) ?? parseTs(raw.term?.start_at)
    const effEnd   = parseTs(raw.end_at)   ?? parseTs(raw.term?.end_at)
    const hasDates = effStart !== null || effEnd !== null

    const termLooksArchival =
      !!raw.term?.name && /archive|concluded|past/i.test(raw.term.name)

    let isActive: boolean
    if (hasDates) {
      // Date-driven: current iff now is within [start - lead, end + grace].
      const ended     = effEnd   !== null && now > effEnd + GRACE_MS
      const notStarted = effStart !== null && now < effStart - LEAD_MS
      isActive = !ended && !notStarted && !termLooksArchival
    } else {
      // No usable dates anywhere — fall back to enrollment-level signals.
      // (The relative-recency year downgrade in fetchCourses also only touches
      // these dateless courses.)
      const enrollmentConcluded =
        !!studentEnrollment?.completed_at ||
        studentEnrollment?.enrollment_state === 'completed' ||
        studentEnrollment?.enrollment_state === 'inactive'
      isActive = !enrollmentConcluded && !termLooksArchival
    }

    return {
      id:           `canvas-course-${raw.id}`,
      integrationId: '',   // filled in by SyncEngine after auth
      externalId:   String(raw.id),
      name:         raw.name,
      courseCode:   raw.course_code || null,
      description:  raw.public_description ?? raw.syllabus_body ?? null,
      color:        null,  // assigned locally
      term:         raw.term?.name ?? null,
      startDate:    raw.start_at ? new Date(raw.start_at).getTime() : null,
      endDate:      raw.end_at   ? new Date(raw.end_at).getTime()   : null,
      isActive,
      currentScore: studentEnrollment?.computed_current_score ?? null,
      currentGrade: studentEnrollment?.computed_current_grade ?? null,
      applyGroupWeights: raw.apply_assignment_group_weights ?? false,
      syncedAt:     Date.now(),
    }
  }

  // ─── Modules ─────────────────────────────────────────────────────────────

  async fetchModules(courseId: string, externalCourseId: string): Promise<Module[]> {
    // We don't request include[]=items here. It's not needed — normalizeModule()
    // never reads raw.items, since module items are always fetched separately
    // per-module via fetchModuleItems() below (that's the only place Canvas
    // gives us item-level completion state anyway). Dropping the unused
    // include also trims the response payload.
    const raw = await this.requestPaginated<CanvasModule>(
      `/api/v1/courses/${externalCourseId}/modules?per_page=50`
    )
    return raw.map(m => this.normalizeModule(m, courseId))
  }

  private normalizeModule(raw: CanvasModule, courseId: string): Module {
    return {
      id:                    `canvas-module-${raw.id}`,
      courseId,
      externalId:            String(raw.id),
      name:                  raw.name,
      position:              raw.position,
      description:           null,
      unlockAt:              raw.unlock_at ? new Date(raw.unlock_at).getTime() : null,
      isLocked:              raw.state === 'locked',
      completedRequirements: 0,
      totalRequirements:     raw.items_count,
      syncedAt:              Date.now(),
    }
  }

  // ─── Module Items ─────────────────────────────────────────────────────────

  async fetchModuleItems(
    moduleId: string,
    courseId: string,
    externalCourseId: string,
    externalModuleId: string
  ): Promise<ModuleItem[]> {
    const raw = await this.requestPaginated<CanvasModuleItem>(
      `/api/v1/courses/${externalCourseId}/modules/${externalModuleId}/items?include[]=content_details&per_page=50`
    )
    return raw.map(item => this.normalizeModuleItem(item, moduleId, courseId))
  }

  private normalizeModuleItem(
    raw: CanvasModuleItem,
    moduleId: string,
    courseId: string
  ): ModuleItem {
    // Map Canvas content_id to our internal ID format
    let contentId: string | null = null
    if (raw.content_id) {
      switch (raw.type) {
        case 'Assignment': contentId = `canvas-assignment-${raw.content_id}`; break
        case 'Quiz':       contentId = `canvas-quiz-${raw.content_id}`;       break
        case 'File':       contentId = `canvas-file-${raw.content_id}`;       break
        case 'Page':       contentId = null;  break  // Pages use page_url, not content_id
        default:           contentId = null
      }
    }

    let completionRequirement = null
    if (raw.completion_requirement) {
      completionRequirement = {
        type:     raw.completion_requirement.type,
        minScore: raw.completion_requirement.min_score,
      }
    }

    return {
      id:                    `canvas-module-item-${raw.id}`,
      moduleId,
      courseId,
      externalId:            String(raw.id),
      title:                 raw.title,
      type:                  raw.type,
      position:              raw.position,
      contentId,
      url:                   raw.external_url ?? null,
      pageUrl:               raw.page_url ?? null,
      completionRequirement,
      isCompleted:           raw.completion_requirement?.completed ?? false,
      syncedAt:              Date.now(),
    }
  }

  // ─── Assignment Groups ───────────────────────────────────────────────────

  async fetchAssignmentGroups(courseId: string, externalCourseId: string): Promise<AssignmentGroup[]> {
    const raw = await this.requestPaginated<CanvasAssignmentGroup>(
      `/api/v1/courses/${externalCourseId}/assignment_groups?per_page=50`
    )
    return raw.map(g => this.normalizeAssignmentGroup(g, courseId))
  }

  private normalizeAssignmentGroup(raw: CanvasAssignmentGroup, courseId: string): AssignmentGroup {
    return {
      id:          `canvas-assignment-group-${raw.id}`,
      courseId,
      externalId:  String(raw.id),
      name:        raw.name,
      groupWeight: raw.group_weight ?? 0,
      position:    raw.position,
      syncedAt:    Date.now(),
    }
  }

  // ─── Assignments ─────────────────────────────────────────────────────────

  async fetchAssignments(
    courseId: string,
    externalCourseId: string
  ): Promise<{ assignments: Assignment[]; attachments: AssignmentAttachment[] }> {
    // We don't request include[]=submission here — grades/submissions are
    // fetched separately via fetchGrades(), which uses the dedicated
    // student-submissions endpoint. Keeping these two calls independent means
    // a problem fetching one doesn't block the other (SyncEngine also
    // isolates them per-phase regardless).
    const raw = await this.requestPaginated<CanvasAssignment>(
      `/api/v1/courses/${externalCourseId}/assignments?include[]=attachments&per_page=50`
    )

    const assignments: Assignment[] = []
    const attachments: AssignmentAttachment[] = []

    for (const a of raw) {
      assignments.push(this.normalizeAssignment(a, courseId))

      // Gather any files attached directly to the assignment instructions
      if (a.attachments && a.attachments.length > 0) {
        for (const file of a.attachments) {
          attachments.push({
            id:           `canvas-attach-${a.id}-${file.id}`,
            assignmentId: `canvas-assignment-${a.id}`,
            fileId:       null,   // we'll link this after file sync
            url:          file.url,
            filename:     file.filename,
            contentType:  file['content-type'],
            size:         file.size,
          })
        }
      }
    }

    return { assignments, attachments }
  }

  private normalizeAssignment(raw: CanvasAssignment, courseId: string): Assignment {
    const rubric: RubricCriterion[] | null = raw.rubric
      ? raw.rubric.map(rc => ({
          id:              rc.id,
          description:     rc.description,
          longDescription: rc.long_description || null,
          points:          rc.points,
          ratings:         rc.ratings.map(r => ({
            id:              r.id,
            description:     r.description,
            longDescription: r.long_description || null,
            points:          r.points,
          })),
        }))
      : null

    return {
      id:               `canvas-assignment-${raw.id}`,
      courseId,
      externalId:       String(raw.id),
      title:            raw.name,
      descriptionHtml:  raw.description,
      descriptionPlain: raw.description ? stripHtml(raw.description) : null,
      dueAt:            raw.due_at    ? new Date(raw.due_at).getTime()    : null,
      unlockAt:         raw.unlock_at ? new Date(raw.unlock_at).getTime() : null,
      lockAt:           raw.lock_at   ? new Date(raw.lock_at).getTime()   : null,
      pointsPossible:   raw.points_possible,
      gradingType:      raw.grading_type as Assignment['gradingType'],
      submissionTypes:  raw.submission_types as Assignment['submissionTypes'],
      allowedExtensions: raw.allowed_extensions,
      rubric,
      isPublished:      raw.published,
      isMuted:          raw.muted,
      position:         raw.position,
      assignmentGroupId: raw.assignment_group_id ? `canvas-assignment-group-${raw.assignment_group_id}` : null,
      syncedAt:         Date.now(),
    }
  }

  // ─── Files ───────────────────────────────────────────────────────────────

  async fetchFiles(courseId: string, externalCourseId: string): Promise<CourseFile[]> {
    // First build the folder-path map so we can reconstruct the tree
    const folders = await this.requestPaginated<CanvasFolder>(
      `/api/v1/courses/${externalCourseId}/folders?per_page=50`
    )
    const folderMap = new Map<number, string>()
    for (const f of folders) {
      // full_name looks like "course files/Week 3/Slides" — strip the "course files/" prefix
      const path = f.full_name.replace(/^course files\/?/i, '') || '/'
      folderMap.set(f.id, path)
    }

    const raw = await this.requestPaginated<CanvasFile>(
      `/api/v1/courses/${externalCourseId}/files?per_page=50`
    )

    return raw
      .filter(f => !f.hidden)
      .map(f => ({
        id:          `canvas-file-${f.id}`,
        courseId,
        externalId:  String(f.id),
        filename:    f.filename,
        displayName: f.display_name,
        contentType: f['content-type'],
        size:        f.size,
        url:         f.url,
        localPath:   null,
        folderPath:  folderMap.get(f.folder_id) ?? '/',
        isHidden:    f.hidden,
        isLocked:    f.locked,
        createdAt:   f.created_at ? new Date(f.created_at).getTime() : null,
        updatedAt:   f.updated_at ? new Date(f.updated_at).getTime() : null,
        syncedAt:    Date.now(),
      }))
  }

  // ─── Pages ───────────────────────────────────────────────────────────────

  async fetchPages(courseId: string, externalCourseId: string): Promise<CoursePage[]> {
    const raw = await this.requestPaginated<CanvasPage>(
      `/api/v1/courses/${externalCourseId}/pages?published=true&per_page=50`
    )

    return raw.map(p => ({
      id:          `canvas-page-${externalCourseId}-${p.url}`,
      courseId,
      externalId:  p.url,   // Canvas uses URL slugs as the unique identifier for pages
      title:       p.title,
      bodyHtml:    p.body,
      url:         p.url,
      isPublished: p.published,
      editedAt:    p.updated_at ? new Date(p.updated_at).getTime() : null,
      syncedAt:    Date.now(),
    }))
  }

  // ─── Quizzes ─────────────────────────────────────────────────────────────

  async fetchQuizzes(courseId: string, externalCourseId: string): Promise<Quiz[]> {
    const raw = await this.requestPaginated<CanvasQuiz>(
      `/api/v1/courses/${externalCourseId}/quizzes?per_page=50`
    )

    return raw
      .filter(q => q.published)
      .map(q => ({
        id:             `canvas-quiz-${q.id}`,
        courseId,
        externalId:     String(q.id),
        title:          q.title,
        description:    q.description,
        quizType:       q.quiz_type,
        dueAt:          q.due_at    ? new Date(q.due_at).getTime()    : null,
        unlockAt:       q.unlock_at ? new Date(q.unlock_at).getTime() : null,
        lockAt:         q.lock_at   ? new Date(q.lock_at).getTime()   : null,
        timeLimitMinutes: q.time_limit,
        allowedAttempts: q.allowed_attempts === -1 ? null : q.allowed_attempts,
        pointsPossible: q.points_possible,
        isPublished:    q.published,
        htmlUrl:        q.html_url ?? null,
        syncedAt:       Date.now(),
      }))
  }

  // ─── Grades ──────────────────────────────────────────────────────────────

  async fetchGrades(courseId: string, externalCourseId: string): Promise<Grade[]> {
    // Use the dedicated student-submissions endpoint instead of bundling
    // submission data into the assignments call via include[]=submission.
    // This keeps grade-sync independent of assignment-sync (SyncEngine
    // isolates failures per-phase regardless, but this also avoids coupling
    // two different concerns into one request).
    //
    // Per Canvas's documented behavior for this endpoint: "List of student
    // ids to return submissions for. If this argument is omitted, return
    // submissions for the calling user. Students may only list their own
    // submissions." We deliberately omit student_ids[] rather than passing
    // 'self' — the docs only confirm the omitted-argument behavior for this
    // specific bulk endpoint, so we stick to what's verified rather than an
    // unconfirmed shorthand.
    const raw = await this.requestPaginated<CanvasSubmission>(
      `/api/v1/courses/${externalCourseId}/students/submissions` +
      `?include[]=submission_comments&include[]=assignment&per_page=50`
    )

    return raw
      .filter(sub => sub.assignment_id != null)
      .map(sub => ({
        id:              `canvas-grade-${sub.id}`,
        assignmentId:    `canvas-assignment-${sub.assignment_id}`,
        courseId,
        externalId:      String(sub.id),
        score:           sub.score,
        pointsPossible:  sub.assignment?.points_possible ?? null,
        grade:           sub.grade,
        enteredGrade:    sub.entered_grade,
        submittedAt:     sub.submitted_at ? new Date(sub.submitted_at).getTime() : null,
        gradedAt:        sub.graded_at    ? new Date(sub.graded_at).getTime()    : null,
        isLate:          sub.late,
        isMissing:       sub.missing,
        isExcused:       sub.excused ?? false,
        workflowState:   sub.workflow_state as Grade['workflowState'],
        submissionComments: (sub.submission_comments ?? []).map(c => ({
          id:         String(c.id),
          authorName: c.author_name,
          comment:    c.comment,
          createdAt:  new Date(c.created_at).getTime(),
        })),
        syncedAt: Date.now(),
      }))
  }

  // ─── Calendar Events ─────────────────────────────────────────────────────

  async fetchCalendarEvents(
    integrationId: string,
    courseId: string | null,
    externalCourseId: string | null
  ): Promise<CalendarEvent[]> {
    const contextFilter = externalCourseId
      ? `&context_codes[]=course_${externalCourseId}`
      : '&context_codes[]=user_self'

    const raw = await this.requestPaginated<{
      id: number
      title: string
      description: string | null
      start_at: string
      end_at: string | null
      all_day: boolean
      type: string
      assignment?: { id: number }
      html_url: string
      context_code: string
      location_name?: string | null
    }>(`/api/v1/calendar_events?type=event${contextFilter}&per_page=50`)

    return raw.map(e => ({
      id:            `canvas-event-${e.id}`,
      integrationId,
      courseId,
      externalId:    String(e.id),
      title:         e.title,
      description:   e.description,
      startAt:       new Date(e.start_at).getTime(),
      endAt:         e.end_at ? new Date(e.end_at).getTime() : null,
      allDay:        e.all_day,
      eventType:     (e.assignment ? 'assignment' : 'event') as CalendarEvent['eventType'],
      assignmentId:  e.assignment ? `canvas-assignment-${e.assignment.id}` : null,
      location:      e.location_name ?? null,
      syncedAt:      Date.now(),
    }))
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Whether a Canvas enrollment represents the student themselves, tolerant of
 * every spelling Canvas uses for the enrollment `type` field across instances
 * and endpoints: "student" (embedded-on-course slim shape), "StudentEnrollment"
 * (canonical Enrollment object), "student_enrollment" (snake_case on some
 * instances). Matched case-insensitively. See BUG-009.
 */
function isStudentEnrollment(e: CanvasEnrollment): boolean {
  const t = (e.type ?? '').toLowerCase().replace(/[_\s]/g, '')
  // "student" and "studentenrollment" both collapse to start with "student"
  return t === 'student' || t === 'studentenrollment'
}

/** Very lightweight HTML stripper for producing plain-text assignment descriptions. */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim()
}
