import Database from 'better-sqlite3'
import { getDb } from '../index'
import type { WhatIfScore } from '@shared/types/entities'

// what_if_scores does not follow the id-keyed pattern the other tables use —
// its primary key is assignment_id (one hypothetical score per assignment).
// BaseRepository's upsert()/findById() hardcode `id` as the conflict/lookup
// column, so this repository talks to the database directly instead of
// extending BaseRepository.

interface WhatIfScoreRow {
  assignment_id: string
  hypothetical_score: number | null
  updated_at: number
}

export class WhatIfScoreRepository {
  private get db(): Database.Database {
    return getDb()
  }

  private fromRow(row: WhatIfScoreRow): WhatIfScore {
    return {
      assignmentId:      row.assignment_id,
      hypotheticalScore: row.hypothetical_score,
      updatedAt:         row.updated_at,
    }
  }

  getAll(): WhatIfScore[] {
    const rows = this.db.prepare(`SELECT * FROM what_if_scores`).all() as WhatIfScoreRow[]
    return rows.map(r => this.fromRow(r))
  }

  getByAssignment(assignmentId: string): WhatIfScore | undefined {
    const row = this.db
      .prepare(`SELECT * FROM what_if_scores WHERE assignment_id = ?`)
      .get(assignmentId) as WhatIfScoreRow | undefined
    return row ? this.fromRow(row) : undefined
  }

  // A null hypotheticalScore clears the override (falls back to the real
  // synced grade) but we still keep the row so "last edited" is preserved —
  // simplest is to just delete it instead, since a cleared what-if has no
  // meaningful state to retain.
  set(assignmentId: string, hypotheticalScore: number | null): WhatIfScore {
    const now = Date.now()
    if (hypotheticalScore === null) {
      this.db.prepare(`DELETE FROM what_if_scores WHERE assignment_id = ?`).run(assignmentId)
      return { assignmentId, hypotheticalScore: null, updatedAt: now }
    }
    this.db.prepare(`
      INSERT INTO what_if_scores (assignment_id, hypothetical_score, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(assignment_id) DO UPDATE SET
        hypothetical_score = excluded.hypothetical_score,
        updated_at = excluded.updated_at
    `).run(assignmentId, hypotheticalScore, now)
    return { assignmentId, hypotheticalScore, updatedAt: now }
  }

  clearByAssignment(assignmentId: string): void {
    this.db.prepare(`DELETE FROM what_if_scores WHERE assignment_id = ?`).run(assignmentId)
  }

  // Clear every what-if score belonging to assignments in one course.
  clearByCourse(courseId: string): void {
    this.db.prepare(`
      DELETE FROM what_if_scores
      WHERE assignment_id IN (SELECT id FROM assignments WHERE course_id = ?)
    `).run(courseId)
  }

  clearAll(): void {
    this.db.prepare(`DELETE FROM what_if_scores`).run()
  }
}
