import { BaseRepository } from './BaseRepository'
import type { Reminder, ReminderRepeat } from '@shared/types/entities'

// Row shape from SQLite (snake_case)
interface ReminderRow {
  id: string
  title: string
  date: string
  time: string | null
  reminder_minutes_before: number
  color: string
  repeat: string
  course_id: string | null
  assignment_id: string | null
  created_at: number
  updated_at: number
}

export class ReminderRepository extends BaseRepository<Reminder, ReminderRow> {
  protected get tableName() { return 'reminders' }

  protected fromRow(row: ReminderRow): Reminder {
    return {
      id:                    row.id,
      title:                 row.title,
      date:                  row.date,
      time:                  row.time,
      reminderMinutesBefore: row.reminder_minutes_before,
      color:                 row.color,
      repeat:                (row.repeat as ReminderRepeat),
      courseId:              row.course_id,
      assignmentId:          row.assignment_id,
      createdAt:             row.created_at,
      updatedAt:             row.updated_at,
    }
  }

  protected toRow(r: Partial<Reminder>): Partial<ReminderRow> {
    const row: Partial<ReminderRow> = {}
    if (r.id                    !== undefined) row.id                      = r.id
    if (r.title                 !== undefined) row.title                   = r.title
    if (r.date                  !== undefined) row.date                    = r.date
    if (r.time                  !== undefined) row.time                    = r.time
    if (r.reminderMinutesBefore !== undefined) row.reminder_minutes_before = r.reminderMinutesBefore
    if (r.color                 !== undefined) row.color                   = r.color
    if (r.repeat                !== undefined) row.repeat                  = r.repeat
    if (r.courseId              !== undefined) row.course_id               = r.courseId
    if (r.assignmentId          !== undefined) row.assignment_id           = r.assignmentId
    if (r.createdAt             !== undefined) row.created_at              = r.createdAt
    if (r.updatedAt             !== undefined) row.updated_at              = r.updatedAt
    return row
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  getAll(): Reminder[] {
    const rows = this.db
      .prepare(`SELECT * FROM reminders ORDER BY date ASC, time ASC`)
      .all() as ReminderRow[]
    return rows.map(r => this.fromRow(r))
  }

  getById(id: string): Reminder | undefined {
    return this.findById(id)
  }

  // Reminders whose base date falls within [startDate, endDate] (inclusive),
  // both 'YYYY-MM-DD' strings. Lexicographic comparison is valid for ISO dates.
  // Note: recurring reminders are expanded for display in the renderer; this
  // returns the stored base rows only.
  getInRange(startDate: string, endDate: string): Reminder[] {
    const rows = this.db
      .prepare(`SELECT * FROM reminders WHERE date >= ? AND date <= ? ORDER BY date ASC, time ASC`)
      .all(startDate, endDate) as ReminderRow[]
    return rows.map(r => this.fromRow(r))
  }

  // Reminders that could still produce a future occurrence — i.e. anything dated
  // today or later, plus every recurring reminder regardless of base date.
  // Used by the NotificationService to (re)schedule upcoming notifications.
  getActiveForScheduling(todayDate: string): Reminder[] {
    const rows = this.db
      .prepare(`SELECT * FROM reminders WHERE date >= ? OR repeat != 'none'`)
      .all(todayDate) as ReminderRow[]
    return rows.map(r => this.fromRow(r))
  }

  create(reminder: Reminder): void {
    this.upsert(reminder)
  }

  update(reminder: Reminder): void {
    this.upsert(reminder)
  }

  remove(id: string): void {
    this.deleteById(id)
  }
}
