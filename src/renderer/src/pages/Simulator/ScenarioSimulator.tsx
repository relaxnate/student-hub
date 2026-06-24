// Component 1 — Multi-Scenario Simulator
// Up to 4 named scenarios edited side-by-side, with a live outcome-comparison
// table and best-scenario detection. Scenarios + scores persist to the DB via
// the simulation IPC namespace (entirely separate from the what-if system).

import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, Trophy, Crown } from 'lucide-react'
import { api } from '../../lib/ipc'
import { cn, percentToLetter } from '../../lib/utils'
import { Badge } from '../../components/ui/Badge'
import type { SimulationScenario } from '@shared/types/entities'
import {
  computeCoursePercent, computeOverallGpa, type CourseBundle,
} from './simMath'

// Distinct, visually clear scenario colors (blue, green, purple, orange).
const SCENARIO_COLORS = ['#3b82f6', '#22c55e', '#a855f7', '#f97316']
const MAX_SCENARIOS = 4

type ScoreMap = Record<string, Record<string, number>>   // scenarioId -> assignmentId -> score

function gpaColor(gpa: number | null): string {
  if (gpa === null) return 'text-zinc-500'
  if (gpa >= 3.0) return 'text-green-400'
  if (gpa >= 2.0) return 'text-amber-400'
  return 'text-red-400'
}
function pctColor(pct: number | null): string {
  if (pct === null) return 'text-zinc-500'
  if (pct >= 90) return 'text-green-400'
  if (pct >= 70) return 'text-amber-400'
  return 'text-red-400'
}

export default function ScenarioSimulator({ bundles }: { bundles: CourseBundle[] }) {
  const [scenarios, setScenarios] = useState<SimulationScenario[]>([])
  const [scores,    setScores]    = useState<ScoreMap>({})
  const [selectedCourseId, setSelectedCourseId] = useState<string>(
    bundles.find(b => b.course.isActive)?.course.id ?? bundles[0]?.course.id ?? ''
  )
  const [ready, setReady] = useState(false)
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // ── Load scenarios + their scores ───────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const sRes = await api.simulation.getScenarios()
      const list: SimulationScenario[] = sRes.ok ? sRes.data : []
      const map: ScoreMap = {}
      await Promise.all(list.map(async (s: SimulationScenario) => {
        const scRes = await api.simulation.getScores(s.id)
        const inner: Record<string, number> = {}
        if (scRes.ok) for (const sc of scRes.data) {
          if (sc.hypotheticalScore !== null) inner[sc.assignmentId] = sc.hypotheticalScore
        }
        map[s.id] = inner
      }))
      setScenarios(list)
      setScores(map)
      setReady(true)
    }
    load()
  }, [])

  // ── Scenario CRUD ────────────────────────────────────────────────────────────
  const addScenario = async () => {
    if (scenarios.length >= MAX_SCENARIOS) return
    const usedColors = new Set(scenarios.map(s => s.color))
    const color = SCENARIO_COLORS.find(c => !usedColors.has(c)) ?? SCENARIO_COLORS[scenarios.length % 4]
    const name = `Scenario ${String.fromCharCode(65 + scenarios.length)}`
    const res = await api.simulation.createScenario({ name, color })
    if (res.ok) {
      setScenarios(prev => [...prev, res.data])
      setScores(prev => ({ ...prev, [res.data.id]: {} }))
    }
  }

  const deleteScenario = async (id: string) => {
    await api.simulation.deleteScenario(id)
    setScenarios(prev => prev.filter(s => s.id !== id))
    setScores(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  const renameScenario = (id: string, name: string) => {
    setScenarios(prev => prev.map(s => (s.id === id ? { ...s, name } : s)))
    const key = `name:${id}`
    if (timers.current[key]) clearTimeout(timers.current[key])
    timers.current[key] = setTimeout(() => { api.simulation.renameScenario({ id, name }) }, 400)
  }

  // ── Score editing ──────────────────────────────────────────────────────────
  const setScore = (scenarioId: string, assignmentId: string, raw: string) => {
    const trimmed = raw.trim()
    const value = trimmed === '' ? null : parseFloat(trimmed)
    if (value !== null && Number.isNaN(value)) return

    setScores(prev => {
      const inner = { ...(prev[scenarioId] ?? {}) }
      if (value === null) delete inner[assignmentId]
      else inner[assignmentId] = value
      return { ...prev, [scenarioId]: inner }
    })

    const key = `${scenarioId}:${assignmentId}`
    if (timers.current[key]) clearTimeout(timers.current[key])
    timers.current[key] = setTimeout(() => {
      api.simulation.setScore({ scenarioId, assignmentId, hypotheticalScore: value })
    }, 400)
  }

  // ── Derived ──────────────────────────────────────────────────────────────────
  const scenarioMaps = useMemo(() => {
    const m: Record<string, Map<string, number>> = {}
    for (const s of scenarios) m[s.id] = new Map(Object.entries(scores[s.id] ?? {}))
    return m
  }, [scenarios, scores])

  const selected = bundles.find(b => b.course.id === selectedCourseId) ?? bundles[0]

  // Comparison table: real + per-scenario course percents, plus overall GPA row.
  const comparison = useMemo(() => {
    const rows = bundles.map(b => {
      const real = computeCoursePercent(b.course, b.assignments, b.groups).percent
      const perScenario = scenarios.map(s =>
        computeCoursePercent(b.course, b.assignments, b.groups, scenarioMaps[s.id]).percent
      )
      return { course: b.course, real, perScenario }
    })
    const realGpa = computeOverallGpa(rows.map(r => r.real))
    const scenarioGpas = scenarios.map((_, i) => computeOverallGpa(rows.map(r => r.perScenario[i])))
    const bestGpa = scenarioGpas.reduce<number | null>((best, g) =>
      g !== null && (best === null || g > best) ? g : best, null)
    const bestIdx = bestGpa === null ? -1 : scenarioGpas.findIndex(g => g === bestGpa)
    return { rows, realGpa, scenarioGpas, bestIdx }
  }, [bundles, scenarios, scenarioMaps])

  if (!ready) return null

  return (
    <div className="space-y-6">
      {/* ── Section 1: Scenario Manager ─────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-300 mb-2">Scenarios</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {scenarios.map(s => (
            <div key={s.id}
              className="rounded-xl bg-surface-800 border border-white/5 p-3 flex flex-col gap-2"
              style={{ borderTopColor: s.color, borderTopWidth: 2 }}>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: s.color }} />
                <input
                  value={s.name}
                  onChange={e => renameScenario(s.id, e.target.value)}
                  className="flex-1 min-w-0 bg-transparent text-sm font-medium text-zinc-100 focus:outline-none focus:bg-white/5 rounded px-1 py-0.5"
                />
                <button onClick={() => deleteScenario(s.id)} title="Delete scenario"
                  className="text-zinc-600 hover:text-red-400 transition-colors shrink-0">
                  <Trash2 size={13} />
                </button>
              </div>
              <p className="text-2xs text-zinc-600">
                {Object.keys(scores[s.id] ?? {}).length} edited score{Object.keys(scores[s.id] ?? {}).length !== 1 ? 's' : ''}
              </p>
            </div>
          ))}
          {scenarios.length < MAX_SCENARIOS && (
            <button onClick={addScenario}
              className="rounded-xl border border-dashed border-white/15 hover:border-accent-500/50 hover:bg-white/5 p-3 flex items-center justify-center gap-2 text-sm text-zinc-400 hover:text-accent-400 transition-colors min-h-[68px]">
              <Plus size={15} /> Add Scenario
            </button>
          )}
        </div>
      </section>

      {scenarios.length === 0 ? (
        <p className="text-sm text-zinc-500 text-center py-8">
          Add a scenario to start comparing what-if outcomes.
        </p>
      ) : (
        <>
          {/* ── Section 2: Assignment Editor ──────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-zinc-300">Assignment editor</h2>
              <select value={selectedCourseId} onChange={e => setSelectedCourseId(e.target.value)}
                className="bg-surface-700 border border-white/10 rounded-md text-xs text-zinc-300 px-2 py-1.5 focus:outline-none max-w-[260px]">
                {bundles.map(b => (
                  <option key={b.course.id} value={b.course.id}>
                    {b.course.name}{!b.course.isActive ? ' (past)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {selected && (
              <div className="rounded-xl bg-surface-800 border border-white/5 overflow-hidden">
                {/* header row */}
                <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5 text-2xs font-semibold text-zinc-500 uppercase tracking-wider">
                  <span className="flex-1">Assignment</span>
                  {selected.course.applyGroupWeights && <span className="w-14 text-right">Weight</span>}
                  <span className="w-20 text-right">Real</span>
                  {scenarios.map(s => (
                    <span key={s.id} className="w-20 text-right truncate" style={{ color: s.color }}>
                      {s.name}
                    </span>
                  ))}
                </div>

                {selected.assignments.length === 0 ? (
                  <p className="text-xs text-zinc-600 px-4 py-4">No synced assignments in this course.</p>
                ) : (
                  selected.assignments.map((a, i) => {
                    const realGraded = a.grade?.workflowState === 'graded' && a.grade.score !== null && !a.grade.isExcused
                    const group = a.assignmentGroupId
                      ? selected.groups.find(g => g.id === a.assignmentGroupId) : undefined
                    return (
                      <div key={a.id} className={cn('flex items-center gap-3 px-4 py-2',
                        i < selected.assignments.length - 1 && 'border-b border-white/3')}>
                        <span className="flex-1 text-xs text-zinc-300 truncate" title={a.title}>{a.title}</span>
                        {selected.course.applyGroupWeights && (
                          <span className="w-14 text-right text-2xs text-zinc-500">
                            {group ? `${group.groupWeight}%` : '—'}
                          </span>
                        )}
                        <span className="w-20 text-right text-xs tabular-nums text-zinc-400">
                          {realGraded ? `${a.grade!.score}/${a.pointsPossible}` : `—/${a.pointsPossible ?? '—'}`}
                        </span>
                        {scenarios.map(s => {
                          const v = scores[s.id]?.[a.id]
                          const edited = v !== undefined
                          return (
                            <input key={s.id} type="number" inputMode="decimal" step="0.01"
                              disabled={!a.pointsPossible}
                              value={v ?? ''}
                              placeholder={a.pointsPossible ? '—' : 'N/A'}
                              onChange={e => setScore(s.id, a.id, e.target.value)}
                              className={cn(
                                'w-20 h-7 px-2 rounded-md border text-xs text-right tabular-nums focus:outline-none focus:ring-1 disabled:opacity-40 disabled:cursor-not-allowed',
                                edited
                                  ? 'bg-accent-500/10 border-accent-500/40 text-zinc-100 ring-accent-500'
                                  : 'bg-surface-700 border-white/10 text-zinc-300 focus:ring-accent-500'
                              )}
                              style={edited ? { borderColor: s.color } : undefined}
                            />
                          )
                        })}
                      </div>
                    )
                  })
                )}

                {/* running course % per scenario */}
                <div className="flex items-center gap-3 px-4 py-2.5 border-t border-white/10 bg-surface-900/40">
                  <span className="flex-1 text-2xs font-semibold text-zinc-400 uppercase tracking-wider">Course %</span>
                  {selected.course.applyGroupWeights && <span className="w-14" />}
                  <span className={cn('w-20 text-right text-xs font-bold tabular-nums',
                    pctColor(computeCoursePercent(selected.course, selected.assignments, selected.groups).percent))}>
                    {fmtPct(computeCoursePercent(selected.course, selected.assignments, selected.groups).percent)}
                  </span>
                  {scenarios.map(s => {
                    const p = computeCoursePercent(selected.course, selected.assignments, selected.groups, scenarioMaps[s.id]).percent
                    return (
                      <span key={s.id} className={cn('w-20 text-right text-xs font-bold tabular-nums', pctColor(p))}>
                        {fmtPct(p)}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
          </section>

          {/* ── Section 3: Outcome Comparison Panel ───────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-zinc-300">Outcome comparison</h2>
              {comparison.bestIdx >= 0 && (
                <Badge variant="success">
                  <Trophy size={10} className="mr-1" />
                  Best: {scenarios[comparison.bestIdx]?.name}
                </Badge>
              )}
            </div>

            <div className="rounded-xl bg-surface-800 border border-white/5 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-2xs font-semibold text-zinc-500 uppercase tracking-wider">
                    <th className="text-left font-semibold px-4 py-2.5">Course</th>
                    <th className="text-right font-semibold px-3 py-2.5 w-24">Real</th>
                    {scenarios.map((s, i) => (
                      <th key={s.id} className="text-right font-semibold px-3 py-2.5 w-24">
                        <span className="inline-flex items-center gap-1" style={{ color: s.color }}>
                          {comparison.bestIdx === i && <Crown size={10} />}
                          <span className="truncate max-w-[70px]">{s.name}</span>
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparison.rows.map(r => (
                    <tr key={r.course.id} className="border-b border-white/3 last:border-0">
                      <td className="px-4 py-2 text-zinc-300">
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: r.course.color ?? '#6366f1' }} />
                          <span className="truncate max-w-[220px]" title={r.course.name}>{r.course.name}</span>
                          {!r.course.isActive && <span className="text-2xs text-zinc-600">(past)</span>}
                        </div>
                      </td>
                      <td className={cn('px-3 py-2 text-right tabular-nums', pctColor(r.real))}>
                        {cell(r.real)}
                      </td>
                      {r.perScenario.map((p, i) => (
                        <td key={i} className={cn('px-3 py-2 text-right tabular-nums', pctColor(p))}>
                          {cell(p)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {/* Overall GPA row */}
                  <tr className="border-t border-white/10 bg-surface-900/40 font-semibold">
                    <td className="px-4 py-2.5 text-zinc-300">Overall GPA</td>
                    <td className={cn('px-3 py-2.5 text-right tabular-nums', gpaColor(comparison.realGpa))}>
                      {comparison.realGpa !== null ? comparison.realGpa.toFixed(2) : '—'}
                    </td>
                    {comparison.scenarioGpas.map((g, i) => (
                      <td key={i} className={cn('px-3 py-2.5 text-right tabular-nums',
                        gpaColor(g), comparison.bestIdx === i && 'underline decoration-2 underline-offset-2')}>
                        {g !== null ? g.toFixed(2) : '—'}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-2xs text-zinc-600 mt-2">
              GPA is a simple average across all synced courses, not credit-weighted — matching the Grade & GPA Calculator.
            </p>
          </section>
        </>
      )}
    </div>
  )
}

function fmtPct(p: number | null): string {
  return p === null ? '—' : `${Math.round(p)}%`
}
function cell(p: number | null): React.ReactNode {
  if (p === null) return '—'
  return `${Math.round(p)}% ${percentToLetter(Math.round(p))}`
}
