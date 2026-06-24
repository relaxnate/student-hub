import { IntegrationAdapter } from '../base/IntegrationAdapter'
import type { OAuthConfig, TokenResponse } from '../base/IntegrationAdapter'
import { TokenExpiredError, APIError, NetworkError } from '../base/errors'
import type {
  Course, Module, ModuleItem, ModuleItemType, Assignment, AssignmentAttachment,
  AssignmentGroup, CourseFile, CoursePage, Quiz, Grade, CalendarEvent,
} from '@shared/types/entities'
import type {
  MoodleSiteInfo, MoodleCourse, MoodleSection, MoodleAssignmentsResponse,
  MoodleGradeItemsResponse,
} from './moodle.types'

// Moodle integrates via the Web Services REST API. Auth is a per-user Web
// Services TOKEN (like Canvas's PAT) passed as `wstoken`, NOT OAuth — so Moodle
// connects through OAuthManager.connectWithToken, and the OAuth methods below
// are intentionally unsupported. Each Moodle is a distinct server, so a base URL
// is required (registry.requiresBaseUrl('moodle') === true).
//
// BETA: built to the documented Web Services API but not yet verified against a
// live Moodle site. Surfaced in the UI as experimental until tested.

const WS_PATH = '/webservice/rest/server.php'

export class MoodleAdapter extends IntegrationAdapter {
  readonly provider    = 'moodle' as const
  readonly displayName = 'Moodle'

  private moodleUserId: number | null = null

  constructor(baseUrl: string) {
    super(baseUrl)
  }

  // ─── OAuth (not used — Moodle is token-based) ──────────────────────────────
  getOAuthConfig(): OAuthConfig {
    throw new Error('Moodle uses a Web Services token, not OAuth.')
  }
  async exchangeCodeForToken(): Promise<TokenResponse> {
    throw new Error('Moodle uses a Web Services token, not OAuth.')
  }
  async refreshAccessToken(): Promise<TokenResponse> {
    throw new Error('Moodle Web Services tokens do not refresh — reconnect with a new token.')
  }

  async fetchUserProfile() {
    const site = await this.mdl<MoodleSiteInfo>('core_webservice_get_site_info')
    this.moodleUserId = site.userid
    // Moodle's site-info call doesn't return an email; leave it null.
    return { id: String(site.userid), name: site.fullname, email: null }
  }

  private async getUserId(): Promise<number> {
    if (this.moodleUserId != null) return this.moodleUserId
    const site = await this.mdl<MoodleSiteInfo>('core_webservice_get_site_info')
    this.moodleUserId = site.userid
    return site.userid
  }

  // ─── Courses ────────────────────────────────────────────────────────────────
  async fetchCourses(): Promise<Course[]> {
    const userId  = await this.getUserId()
    const courses = await this.mdl<MoodleCourse[]>('core_enrol_get_users_courses', { userid: String(userId) })
    const now = Date.now()
    return courses.map(c => {
      const endMs = c.enddate ? c.enddate * 1000 : null
      return {
        id:           `moodle-course-${c.id}`,
        integrationId: '',
        externalId:   String(c.id),
        name:         c.fullname,
        courseCode:   c.shortname || null,
        description:  c.summary ? stripHtml(c.summary) : null,
        color:        null,
        term:         c.startdate ? String(new Date(c.startdate * 1000).getFullYear()) : null,
        startDate:    c.startdate ? c.startdate * 1000 : null,
        endDate:      endMs,
        // Active unless the course has an end date that has already passed.
        isActive:     endMs === null || endMs > now,
        currentScore: null,   // Moodle has a course total grade item; UI falls back to per-assignment rawPercent
        currentGrade: null,
        applyGroupWeights: false,
        syncedAt:     now,
      }
    })
  }

  // ─── Modules (course sections) ───────────────────────────────────────────────
  async fetchModules(courseId: string, externalCourseId: string): Promise<Module[]> {
    const sections = await this.mdl<MoodleSection[]>('core_course_get_contents', { courseid: externalCourseId })
    return sections.map((s, i) => ({
      id:                    `moodle-module-${externalCourseId}-${s.id}`,
      courseId,
      externalId:            String(s.id),
      name:                  s.name?.trim() || `Section ${i}`,
      position:              i,
      description:           null,
      unlockAt:              null,
      isLocked:              s.visible === 0,
      completedRequirements: 0,
      totalRequirements:     s.modules?.length ?? 0,
      syncedAt:              Date.now(),
    }))
  }

  async fetchModuleItems(
    moduleId: string, courseId: string,
    externalCourseId: string, externalModuleId: string
  ): Promise<ModuleItem[]> {
    const sections = await this.mdl<MoodleSection[]>('core_course_get_contents', { courseid: externalCourseId })
    const section  = sections.find(s => String(s.id) === externalModuleId)
    return (section?.modules ?? []).map((m, i) => ({
      id:                    `moodle-item-${externalModuleId}-${m.id}`,
      moduleId,
      courseId,
      externalId:            String(m.id),
      title:                 m.name,
      type:                  mapModname(m.modname),
      position:              i,
      contentId:             m.modname === 'assign' && m.instance ? `moodle-assignment-${m.instance}` : null,
      url:                   m.url ?? null,
      pageUrl:               null,
      completionRequirement: null,
      isCompleted:           false,
      syncedAt:              Date.now(),
    }))
  }

  // ─── Assignment groups — Moodle weighting lives in grade categories; skip. ────
  async fetchAssignmentGroups(_courseId: string, _externalCourseId: string): Promise<AssignmentGroup[]> {
    return []
  }

  // ─── Assignments ──────────────────────────────────────────────────────────────
  async fetchAssignments(
    courseId: string, externalCourseId: string
  ): Promise<{ assignments: Assignment[]; attachments: AssignmentAttachment[] }> {
    const resp = await this.mdl<MoodleAssignmentsResponse>('mod_assign_get_assignments', {
      'courseids[0]': externalCourseId,
    })
    const course = resp.courses?.find(c => String(c.id) === externalCourseId) ?? resp.courses?.[0]
    const assignments: Assignment[] = (course?.assignments ?? []).map(a => ({
      id:               `moodle-assignment-${a.id}`,
      courseId,
      externalId:       String(a.id),
      title:            a.name,
      descriptionHtml:  a.intro || null,
      descriptionPlain: a.intro ? stripHtml(a.intro) : null,
      dueAt:            a.duedate ? a.duedate * 1000 : null,
      unlockAt:         a.allowsubmissionsfromdate ? a.allowsubmissionsfromdate * 1000 : null,
      lockAt:           a.cutoffdate ? a.cutoffdate * 1000 : null,
      // A negative `grade` means a scale (not points) → no numeric points possible.
      pointsPossible:   a.grade > 0 ? a.grade : null,
      gradingType:      a.grade > 0 ? 'points' : 'not_graded',
      submissionTypes:  ['online_upload'],
      allowedExtensions: [],
      rubric:           null,
      isPublished:      true,
      isMuted:          false,
      position:         null,
      assignmentGroupId: null,
      syncedAt:         Date.now(),
    }))
    return { assignments, attachments: [] }
  }

  // ─── Files / Pages / Quizzes — surfaced as module items; not separately synced yet. ──
  async fetchFiles(_courseId: string, _externalCourseId: string): Promise<CourseFile[]> { return [] }
  async fetchPages(_courseId: string, _externalCourseId: string): Promise<CoursePage[]> { return [] }
  async fetchQuizzes(_courseId: string, _externalCourseId: string): Promise<Quiz[]> { return [] }

  // ─── Grades ─────────────────────────────────────────────────────────────────
  async fetchGrades(courseId: string, externalCourseId: string): Promise<Grade[]> {
    const userId = await this.getUserId()
    const resp = await this.mdl<MoodleGradeItemsResponse>('gradereport_user_get_grade_items', {
      courseid: externalCourseId,
      userid:   String(userId),
    })
    const usergrade = resp.usergrades?.[0]
    const grades: Grade[] = []
    for (const item of usergrade?.gradeitems ?? []) {
      // Only map module grade items that correspond to assignments.
      if (item.itemmodule !== 'assign' || item.iteminstance == null) continue
      grades.push({
        id:             `moodle-grade-${externalCourseId}-${item.id}`,
        assignmentId:   `moodle-assignment-${item.iteminstance}`,
        courseId,
        externalId:     String(item.id),
        score:          item.graderaw,
        pointsPossible: item.grademax,
        grade:          item.gradeformatted ?? (item.graderaw != null ? String(item.graderaw) : null),
        enteredGrade:   null,
        submittedAt:    item.gradedatesubmitted ? item.gradedatesubmitted * 1000 : null,
        gradedAt:       item.gradedategraded ? item.gradedategraded * 1000 : null,
        isLate:         false,
        isMissing:      item.graderaw == null,
        isExcused:      false,
        workflowState:  item.graderaw != null ? 'graded' : 'unsubmitted',
        submissionComments: [],
        syncedAt:       Date.now(),
      })
    }
    return grades
  }

  async fetchCalendarEvents(
    _integrationId: string, _courseId: string | null, _externalCourseId: string | null
  ): Promise<CalendarEvent[]> {
    // core_calendar_get_calendar_events exists but requires extra params; defer.
    return []
  }

  // ─── Moodle Web Services call ─────────────────────────────────────────────────
  // POSTs to {baseUrl}/webservice/rest/server.php with wstoken (the access token)
  // + wsfunction + moodlewsrestformat=json. Moodle reports errors as HTTP 200 with
  // an `exception`/`errorcode` body, so we inspect the JSON, not just the status.
  private async mdl<T>(wsfunction: string, params: Record<string, string> = {}): Promise<T> {
    if (!this.accessToken) throw new TokenExpiredError()
    const body = new URLSearchParams({
      wstoken:            this.accessToken,
      wsfunction,
      moodlewsrestformat: 'json',
      ...params,
    })

    let response: Response
    try {
      response = await fetch(`${this.baseUrl}${WS_PATH}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    body.toString(),
      })
    } catch (cause) {
      throw new NetworkError(cause)
    }
    if (!response.ok) throw new APIError(response.status, await response.text().catch(() => ''))

    const data = await response.json() as unknown
    if (data && typeof data === 'object' && 'exception' in data) {
      const err = data as { errorcode?: string; message?: string }
      if (err.errorcode === 'invalidtoken' || err.errorcode === 'accessexception') {
        throw new TokenExpiredError()
      }
      throw new APIError(400, JSON.stringify(data))
    }
    return data as T
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapModname(modname: string): ModuleItemType {
  switch (modname) {
    case 'assign':   return 'Assignment'
    case 'quiz':     return 'Quiz'
    case 'resource':
    case 'folder':   return 'File'
    case 'page':     return 'Page'
    case 'url':      return 'ExternalUrl'
    case 'lti':      return 'ExternalTool'
    case 'forum':    return 'Discussion'
    case 'label':    return 'SubHeader'
    default:         return 'Page'
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
