import crypto from 'crypto'
import { BaseRepository } from './BaseRepository'
import type { SimulationScenario } from '@shared/types/entities'

// Row shape from SQLite (snake_case)
interface SimulationScenarioRow {
  id: string
  name: string
  color: string
  created_at: number
}

export class SimulationScenarioRepository extends BaseRepository<SimulationScenario, SimulationScenarioRow> {
  protected get tableName() { return 'simulation_scenarios' }

  protected fromRow(row: SimulationScenarioRow): SimulationScenario {
    return {
      id:        row.id,
      name:      row.name,
      color:     row.color,
      createdAt: row.created_at,
    }
  }

  protected toRow(s: Partial<SimulationScenario>): Partial<SimulationScenarioRow> {
    const row: Partial<SimulationScenarioRow> = {}
    if (s.id        !== undefined) row.id         = s.id
    if (s.name      !== undefined) row.name       = s.name
    if (s.color     !== undefined) row.color      = s.color
    if (s.createdAt !== undefined) row.created_at = s.createdAt
    return row
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  getAll(): SimulationScenario[] {
    const rows = this.db
      .prepare(`SELECT * FROM simulation_scenarios ORDER BY created_at ASC`)
      .all() as SimulationScenarioRow[]
    return rows.map(r => this.fromRow(r))
  }

  create(name: string, color: string): SimulationScenario {
    const scenario: SimulationScenario = {
      id:        `sim-scenario-${crypto.randomUUID()}`,
      name,
      color,
      createdAt: Date.now(),
    }
    this.upsert(scenario)
    return scenario
  }

  rename(id: string, name: string): void {
    this.db.prepare(`UPDATE simulation_scenarios SET name = ? WHERE id = ?`).run(name, id)
  }

  // Deletes the scenario; its simulation_scores rows cascade away via the
  // ON DELETE CASCADE foreign key.
  delete(id: string): void {
    this.deleteById(id)
  }
}
