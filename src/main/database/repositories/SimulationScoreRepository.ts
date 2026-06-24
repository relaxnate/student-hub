import crypto from 'crypto'
import Database from 'better-sqlite3'
import { getDb } from '../index'
import type { SimulationScore } from '@shared/types/entities'

// simulation_scores is keyed by (scenario_id, assignment_id), not by `id` alone,
// so — exactly like WhatIfScoreRepository — it talks to the database directly
// instead of extending BaseRepository (whose upsert/findById hardcode `id` as the
// conflict/lookup column).

interface SimulationScoreRow {
  id: string
  scenario_id: string
  assignment_id: string
  hypothetical_score: number | null
  created_at: number
}

export class SimulationScoreRepository {
  private get db(): Database.Database {
    return getDb()
  }

  private fromRow(row: SimulationScoreRow): SimulationScore {
    return {
      id:                row.id,
      scenarioId:        row.scenario_id,
      assignmentId:      row.assignment_id,
      hypotheticalScore: row.hypothetical_score,
      createdAt:         row.created_at,
    }
  }

  getByScenario(scenarioId: string): SimulationScore[] {
    const rows = this.db
      .prepare(`SELECT * FROM simulation_scores WHERE scenario_id = ?`)
      .all(scenarioId) as SimulationScoreRow[]
    return rows.map(r => this.fromRow(r))
  }

  // Upsert one assignment's hypothetical score within a scenario. A null score
  // clears the override (deletes the row) so the assignment falls back to its
  // real grade in the simulation math.
  set(scenarioId: string, assignmentId: string, hypotheticalScore: number | null): SimulationScore {
    const now = Date.now()
    if (hypotheticalScore === null) {
      this.db
        .prepare(`DELETE FROM simulation_scores WHERE scenario_id = ? AND assignment_id = ?`)
        .run(scenarioId, assignmentId)
      return { id: '', scenarioId, assignmentId, hypotheticalScore: null, createdAt: now }
    }
    const id = `sim-score-${crypto.randomUUID()}`
    this.db.prepare(`
      INSERT INTO simulation_scores (id, scenario_id, assignment_id, hypothetical_score, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(scenario_id, assignment_id) DO UPDATE SET
        hypothetical_score = excluded.hypothetical_score
    `).run(id, scenarioId, assignmentId, hypotheticalScore, now)
    return { id, scenarioId, assignmentId, hypotheticalScore, createdAt: now }
  }

  // Remove every score belonging to a scenario (keeps the scenario itself).
  clear(scenarioId: string): void {
    this.db.prepare(`DELETE FROM simulation_scores WHERE scenario_id = ?`).run(scenarioId)
  }
}
