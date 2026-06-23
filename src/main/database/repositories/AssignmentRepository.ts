import { BaseRepository } from './BaseRepository'
import type { Assignment, Grade, RubricCriterion, SubmissionType } from '@shared/types/entities'

// ─── Assignment Repository ───────────────────────────────────────────────────

interface AssignmentRow {
  id: string
  course_id: string
  external_id: string
  title: string
  description_html: string | null
  description_plain: string | null
  due_at: number | null
  unlock_at: number | null
  lock_at: number | null
  points_possible: number | null
  grading_type: string
  submission_types: string
  allowed_extensions: string
  rubric: string | null
  has_rubric: number
  is_published: number
  is_muted: number
  position: number | null
  assignment_group_id: string | null
  synced_at: number
}

export class AssignmentRepository extends BaseRepository<Assignment, AssignmentRow> {
  protected get tableName() { return 'assignments' }

  protected fromRow(row: AssignmentRow): Assignment {
    return {
      id:               row.id,
      courseId:         row.course_id,
      externalId:       row.external_id,
      title:            row.title,
      descriptionHtml:  row.description_html,
      descriptionPlain: row.description_plain,
      dueAt:            row.due_at,
      unlockAt:         row.unlock_at,
      lockAt:           row.lock_at,
      pointsPossible:   row.points_possible,
      gradingType:      row.grading_type as Assignment['gradingType'],
      submissionTypes:  this.parseJson<SubmissionType[]>(row.submission_types, []),
      allowedExtensions: this.parseJson<string[]>(row.allowed_extensions, []),
      rubric:           row.rubric ? this.parseJson<RubricCriterion[]>(row.rubric, []) : null,
      isPublished:      row.is_published === 1,
      isMuted:          row.is_muted === 1,
      position:         row.position,
      assignmentGroupId: row.assignment_group_id,
      syncedAt:         row.synced_at,
    }
  }

  protected toRow(a: Partial<Assignment>): Partial<AssignmentRow> {
    const row: Partial<AssignmentRow> = {}
    if (a.id               !== undefined) row.id               = a.id
    if (a.courseId         !== undefined) row.course_id        = a.courseId
    if (a.externalId       !== undefined) row.external_id      = a.externalId
    if (a.title            !== undefined) row.title            = a.title
    if (a.descriptionHtml  !== undefined) row.description_html = a.descriptionHtml
    if (a.descriptionPlain !== undefined) row.description_plain = a.descriptionPlain
    if (a.dueAt            !== undefined) row.due_at           = a.dueAt
    if (a.unlockAt         !== undefined) row.unlock_at        = a.unlockAt
    if (a.lockAt           !== undefined) row.lock_at          = a.lockAt
    if (a.pointsPossible   !== undefined) row.points_possible  = a.pointsPossible
    if (a.gradingType      !== undefined) row.grading_type     = a.gradingType
    if (a.submissionTypes  !== undefined) row.submission_types = JSON.stringify(a.submissionTypes)
    if (a.allowedExtensions !== undefined) row.allowed_extensions = JSON.stringify(a.allowedExtensions)
    if (a.rubric           !== undefined) row.rubric           = a.rubric ? JSON.stringify(a.rubric) : null
    if (a.isPublished      !== undefined) row.is_published     = a.isPublished ? 1 : 0
    if (a.isMuted          !== undefined) row.is_muted         = a.isMuted ? 1 : 0
    if (a.position         !== undefined) row.position         = a.position
    if (a.assignmentGroupId !== undefined) row.assignment_group_id = a.assignmentGroupId
    if (a.syncedAt         !== undefined) row.synced_at        = a.syncedAt
    return row
  }

  private parseJson<T>(value: string, fallback: T): T {
    try { return JSON.parse(value) as T } catch { return fallback }
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  getByCourse(courseId: string): Assignment[] {
    const rows = this.db
      .prepare(`
        SELECT * FROM assignments
        WHERE course_id = ?
        ORDER BY due_at ASC NULLS LAST, position ASC
      `)
      .all(courseId) as AssignmentRow[]
    return rows.map(r => this.fromRow(r))
  }

  getById(id: string): Assignment | undefined {
    return this.findById(id)
  }

  /** Assignments due within the next N days, across all courses */
  getUpcoming(withinMs: number): Assignment[] {
    const now = Date.now()
    const rows = this.db
      .prepare(`
        SELECT * FROM assignments
        WHERE due_at IS NOT NULL
          AND due_at >= ?
          AND due_at <= ?
        ORDER BY due_at ASC
      `)
      .all(now, now + withinMs) as AssignmentRow[]
    return rows.map(r => this.fromRow(r))
  }

  /** Assignments past due with no grade recorded */
  getOverdue(): Assignment[] {
    const now = Date.now()
    const rows = this.db
      .prepare(`
        SELECT a.* FROM assignments a
        LEFT JOIN grades g ON g.assignment_id = a.id
        WHERE a.due_at IS NOT NULL
          AND a.due_at < ?
          AND (g.id IS NULL OR g.workflow_state = 'unsubmitted')
        ORDER BY a.due_at DESC
      `)
      .all(now) as AssignmentRow[]
    return rows.map(r => this.fromRow(r))
  }

  save(assignment: Assignment): void              { this.upsert(assignment) }
  saveMany(assignments: Assignment[]): void       { this.upsertMany(assignments) }
}

// ─── Grade Repository ────────────────────────────────────────────────────────

interface GradeRow {
  id: string
  assignment_id: string
  course_id: string
  external_id: string | null
  score: number | null
  points_possible: number | null
  grade: string | null
  entered_grade: string | null
  submitted_at: number | null
  graded_at: number | null
  is_late: number
  is_missing: number
  is_excused: number
  workflow_state: string
  submission_comments: string
  synced_at: number
}

export class GradeRepository extends BaseRepository<Grade, GradeRow> {
  protected get tableName() { return 'grades' }

  protected fromRow(row: GradeRow): Grade {
    return {
      id:              row.id,
      assignmentId:    row.assignment_id,
      courseId:        row.course_id,
      externalId:      row.external_id,
      score:           row.score,
      pointsPossible:  row.points_possible,
      grade:           row.grade,
      enteredGrade:    row.entered_grade,
      submittedAt:     row.submitted_at,
      gradedAt:        row.graded_at,
      isLate:          row.is_late === 1,
      isMissing:       row.is_missing === 1,
      isExcused:       row.is_excused === 1,
      workflowState:   row.workflow_state as Grade['workflowState'],
      submissionComments: this.parseJson(row.submission_comments),
      syncedAt:        row.synced_at,
    }
  }

  protected toRow(g: Partial<Grade>): Partial<GradeRow> {
    const row: Partial<GradeRow> = {}
    if (g.id             !== undefined) row.id              = g.id
    if (g.assignmentId   !== undefined) row.assignment_id   = g.assignmentId
    if (g.courseId       !== undefined) row.course_id       = g.courseId
    if (g.externalId     !== undefined) row.external_id     = g.externalId
    if (g.score          !== undefined) row.score           = g.score
    if (g.pointsPossible !== undefined) row.points_possible = g.pointsPossible
    if (g.grade          !== undefined) row.grade           = g.grade
    if (g.enteredGrade   !== undefined) row.entered_grade   = g.enteredGrade
    if (g.submittedAt    !== undefined) row.submitted_at    = g.submittedAt
    if (g.gradedAt       !== undefined) row.graded_at       = g.gradedAt
    if (g.isLate         !== undefined) row.is_late         = g.isLate ? 1 : 0
    if (g.isMissing      !== undefined) row.is_missing      = g.isMissing ? 1 : 0
    if (g.isExcused      !== undefined) row.is_excused      = g.isExcused ? 1 : 0
    if (g.workflowState  !== undefined) row.workflow_state  = g.workflowState
    if (g.submissionComments !== undefined) row.submission_comments = JSON.stringify(g.submissionComments)
    if (g.syncedAt       !== undefined) row.synced_at       = g.syncedAt
    return row
  }

  private parseJson<T>(value: string): T {
    try { return JSON.parse(value) as T } catch { return [] as unknown as T }
  }

  getByCourse(courseId: string): Grade[] {
    return this.findWhere('course_id', courseId)
  }

  getByAssignment(assignmentId: string): Grade | undefined {
    const rows = this.findWhere('assignment_id', assignmentId)
    return rows[0]
  }

  save(grade: Grade): void              { this.upsert(grade) }
  saveMany(grades: Grade[]): void       { this.upsertMany(grades) }
}
