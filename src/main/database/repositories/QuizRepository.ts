import { BaseRepository } from './BaseRepository'
import type { Quiz, QuizType } from '@shared/types/entities'

interface QuizRow {
  id: string
  course_id: string
  external_id: string
  title: string
  description: string | null
  quiz_type: string
  due_at: number | null
  unlock_at: number | null
  lock_at: number | null
  time_limit: number | null
  allowed_attempts: number | null
  points_possible: number | null
  is_published: number
  html_url: string | null
  synced_at: number
}

export class QuizRepository extends BaseRepository<Quiz, QuizRow> {
  protected get tableName() { return 'quizzes' }

  protected fromRow(row: QuizRow): Quiz {
    return {
      id:               row.id,
      courseId:         row.course_id,
      externalId:       row.external_id,
      title:            row.title,
      description:      row.description,
      quizType:         row.quiz_type as QuizType,
      dueAt:            row.due_at,
      unlockAt:         row.unlock_at,
      lockAt:           row.lock_at,
      timeLimitMinutes: row.time_limit,
      allowedAttempts:  row.allowed_attempts,
      pointsPossible:   row.points_possible,
      isPublished:      row.is_published === 1,
      htmlUrl:          row.html_url,
      syncedAt:         row.synced_at,
    }
  }

  protected toRow(q: Partial<Quiz>): Partial<QuizRow> {
    const row: Partial<QuizRow> = {}
    if (q.id               !== undefined) row.id               = q.id
    if (q.courseId         !== undefined) row.course_id        = q.courseId
    if (q.externalId       !== undefined) row.external_id      = q.externalId
    if (q.title            !== undefined) row.title            = q.title
    if (q.description      !== undefined) row.description      = q.description
    if (q.quizType         !== undefined) row.quiz_type        = q.quizType
    if (q.dueAt            !== undefined) row.due_at           = q.dueAt
    if (q.unlockAt         !== undefined) row.unlock_at        = q.unlockAt
    if (q.lockAt           !== undefined) row.lock_at          = q.lockAt
    if (q.timeLimitMinutes !== undefined) row.time_limit       = q.timeLimitMinutes
    if (q.allowedAttempts  !== undefined) row.allowed_attempts = q.allowedAttempts
    if (q.pointsPossible   !== undefined) row.points_possible  = q.pointsPossible
    if (q.isPublished      !== undefined) row.is_published     = q.isPublished ? 1 : 0
    if (q.htmlUrl          !== undefined) row.html_url         = q.htmlUrl
    if (q.syncedAt         !== undefined) row.synced_at        = q.syncedAt
    return row
  }

  getByCourse(courseId: string): Quiz[] {
    const rows = this.db
      .prepare(`SELECT * FROM quizzes WHERE course_id = ? ORDER BY title ASC`)
      .all(courseId) as QuizRow[]
    return rows.map(r => this.fromRow(r))
  }

  getById(id: string): Quiz | undefined {
    return this.findById(id)
  }

  save(quiz: Quiz): void          { this.upsert(quiz) }
  saveMany(quizzes: Quiz[]): void { this.upsertMany(quizzes) }
}
