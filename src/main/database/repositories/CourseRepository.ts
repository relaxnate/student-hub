import { BaseRepository } from './BaseRepository'
import type { Course } from '@shared/types/entities'

// Row shape from SQLite (snake_case)
interface CourseRow {
  id: string
  integration_id: string
  external_id: string
  name: string
  course_code: string | null
  description: string | null
  color: string | null
  term: string | null
  start_date: number | null
  end_date: number | null
  is_active: number
  current_score: number | null
  current_grade: string | null
  apply_group_weights: number
  synced_at: number
}

export class CourseRepository extends BaseRepository<Course, CourseRow> {
  protected get tableName() { return 'courses' }

  protected fromRow(row: CourseRow): Course {
    return {
      id:              row.id,
      integrationId:   row.integration_id,
      externalId:      row.external_id,
      name:            row.name,
      courseCode:      row.course_code,
      description:     row.description,
      color:           row.color,
      term:            row.term,
      startDate:       row.start_date,
      endDate:         row.end_date,
      isActive:        row.is_active === 1,
      currentScore:    row.current_score,
      currentGrade:    row.current_grade,
      applyGroupWeights: row.apply_group_weights === 1,
      syncedAt:        row.synced_at,
    }
  }

  protected toRow(course: Partial<Course>): Partial<CourseRow> {
    const row: Partial<CourseRow> = {}
    if (course.id            !== undefined) row.id             = course.id
    if (course.integrationId !== undefined) row.integration_id = course.integrationId
    if (course.externalId    !== undefined) row.external_id    = course.externalId
    if (course.name          !== undefined) row.name           = course.name
    if (course.courseCode    !== undefined) row.course_code    = course.courseCode
    if (course.description   !== undefined) row.description    = course.description
    if (course.color         !== undefined) row.color          = course.color
    if (course.term          !== undefined) row.term           = course.term
    if (course.startDate     !== undefined) row.start_date     = course.startDate
    if (course.endDate       !== undefined) row.end_date       = course.endDate
    if (course.isActive      !== undefined) row.is_active      = course.isActive ? 1 : 0
    if (course.currentScore  !== undefined) row.current_score  = course.currentScore
    if (course.currentGrade  !== undefined) row.current_grade  = course.currentGrade
    if (course.applyGroupWeights !== undefined) row.apply_group_weights = course.applyGroupWeights ? 1 : 0
    if (course.syncedAt      !== undefined) row.synced_at      = course.syncedAt
    return row
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  getAll(): Course[] {
    return this.findAll()
  }

  getById(id: string): Course | undefined {
    return this.findById(id)
  }

  getByIntegration(integrationId: string): Course[] {
    return this.findWhere('integration_id', integrationId)
  }

  getActive(): Course[] {
    const rows = this.db
      .prepare(`SELECT * FROM courses WHERE is_active = 1 ORDER BY name`)
      .all() as CourseRow[]
    return rows.map(r => this.fromRow(r))
  }

  // After a successful course sync, mark every course that the latest sync
  // did NOT return as inactive. This guarantees the Dashboard/Courses/Grades
  // active-only views never show a stale course that has since been
  // unenrolled or dropped, even if Canvas stops returning it entirely (in
  // which case the upsert path would never touch its is_active flag).
  // `seenIds` is the full set of course ids returned by the current sync.
  reconcileActive(integrationId: string, seenIds: string[]): void {
    if (seenIds.length === 0) {
      // A sync that returned zero courses is almost always a transient API
      // hiccup, not "the student dropped every class" — don't nuke is_active
      // for the whole integration on an empty result.
      return
    }
    const placeholders = seenIds.map(() => '?').join(', ')
    this.db
      .prepare(
        `UPDATE courses SET is_active = 0
         WHERE integration_id = ? AND id NOT IN (${placeholders})`
      )
      .run(integrationId, ...seenIds)
  }

  save(course: Course): void {
    this.upsert(course)
  }

  saveMany(courses: Course[]): void {
    this.upsertMany(courses)
  }

  deleteByIntegration(integrationId: string): void {
    this.deleteWhere('integration_id', integrationId)
  }

  // Assign a local color to courses that don't have one yet.
  // Colors are from a curated palette that looks good in dark mode.
  assignMissingColors(): void {
    const PALETTE = [
      '#6366f1', '#8b5cf6', '#a855f7', '#ec4899',
      '#ef4444', '#f97316', '#eab308', '#22c55e',
      '#14b8a6', '#3b82f6', '#06b6d4',
    ]

    const uncolored = this.db
      .prepare(`SELECT id FROM courses WHERE color IS NULL`)
      .all() as { id: string }[]

    const update = this.db.prepare(`UPDATE courses SET color = ? WHERE id = ?`)
    const tx = this.db.transaction(() => {
      uncolored.forEach((row, i) => {
        update.run(PALETTE[i % PALETTE.length], row.id)
      })
    })
    tx()
  }
}
