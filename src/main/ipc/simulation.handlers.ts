import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import {
  SimulationScenarioRepository,
  SimulationScoreRepository,
} from '../database/repositories'
import type {
  CreateScenarioPayload,
  RenameScenarioPayload,
  SetSimulationScorePayload,
} from '@shared/types/ipc'

const scenarioRepo = new SimulationScenarioRepository()
const scoreRepo    = new SimulationScoreRepository()

export function registerSimulationHandlers(): void {
  // ─── Scenarios ───────────────────────────────────────────────────────────

  ipcMain.handle(IPC.SIMULATION.GET_SCENARIOS, () => {
    try { return { ok: true, data: scenarioRepo.getAll() } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.SIMULATION.CREATE_SCENARIO, (_event, payload: CreateScenarioPayload) => {
    try { return { ok: true, data: scenarioRepo.create(payload.name, payload.color) } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.SIMULATION.DELETE_SCENARIO, (_event, id: string) => {
    try { scenarioRepo.delete(id); return { ok: true, data: null } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.SIMULATION.RENAME_SCENARIO, (_event, payload: RenameScenarioPayload) => {
    try { scenarioRepo.rename(payload.id, payload.name); return { ok: true, data: null } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  // ─── Scores ──────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.SIMULATION.GET_SCORES, (_event, scenarioId: string) => {
    try { return { ok: true, data: scoreRepo.getByScenario(scenarioId) } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.SIMULATION.SET_SCORE, (_event, payload: SetSimulationScorePayload) => {
    try {
      return {
        ok: true,
        data: scoreRepo.set(payload.scenarioId, payload.assignmentId, payload.hypotheticalScore),
      }
    } catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.SIMULATION.CLEAR_SCENARIO, (_event, scenarioId: string) => {
    try { scoreRepo.clear(scenarioId); return { ok: true, data: null } }
    catch (err) { return { ok: false, error: String(err) } }
  })
}
