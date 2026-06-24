// Smart Reminder Assistant — Calendar-tab panel.
// Loads the student's synced data, derives submission status per assignment, runs
// the offline reminder engine, and renders the resulting reminder objects as cards
// with priority color, a primary action, and dismiss/snooze. Dismiss/snooze/custom
// reminders + the grade-drop score snapshot persist in localStorage (renderer-only;
// no backend changes).

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, AlarmClock, X, Plus, ChevronRight, CheckCircle2 } from 'lucide-react'
import { api } from '../../lib/ipc'
import { cn } from '../../lib/utils'
import type { Assignment, Course, Grade, CalendarEvent } from '@shared/types/entities'
import {
  generateReminders, type Reminder, type ReminderPriority, type AssignmentInput,
  type SubmissionStatus, type CustomReminderInput,
} from './reminderEngine'

// ─── localStorage helpers ───────────────────────────────────────────────────────
function lsGet<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : fallback } catch { return fallback }
}
function lsSet<T>(key: string, value: T): void {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ }
}
const K = {
  dismissed: 'sh.rem.dismissed',
  snooze:    'sh.rem.snooze',
  custom:    'sh.rem.custom',
  scores:    'sh.rem.scores',
}

const PRIORITY_STYLE: Record<ReminderPriority, { dot: string; text: string; ring: string; label: string }> = {
  critical: { dot: 'bg-red-500',   text: 'text-red-400',   ring: 'border-red-500/30',   label: 'Critical' },
  high:     { dot: 'bg-amber-500', text: 'text-amber-400', ring: 'border-amber-500/25', label: 'High' },
  medium:   { dot: 'bg-blue-500',  text: 'text-blue-400',  ring: 'border-blue-500/20',  label: 'Medium' },
  low:      { dot: 'bg-zinc-500',  text: 'text-zinc-400',  ring: 'border-white/10',     label: 'Low' },
}

function deriveStatus(a: Assignment, grade: Grade | undefined, now: number): SubmissionStatus {
  if (grade) {
    if (grade.workflowState === 'graded' && grade.score !== null) return 'graded'
    if (grade.workflowState === 'submitted') return 'submitted'
    if (grade.isMissing) return 'missing'
    if (grade.isLate) return 'late'
  }
  if (a.dueAt !== null && a.dueAt < now) return 'missing'
  return 'upcoming'
}

export default function SmartReminders() {
  const navigate = useNavigate()
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [loading, setLoading]     = useState(true)
  const [snoozeOpen, setSnoozeOpen] = useState<string | null>(null)
  const [adding, setAdding]       = useState(false)
  const [customText, setCustomText] = useState('')

  // bump to re-run the engine after a dismiss/snooze/custom change
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick(t => t + 1), [])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const now = Date.now()
      const cRes = await api.courses.getAll()
      const courses: Course[] = cRes.ok ? cRes.data : []

      const [assignsByCourse, gradesByCourse] = await Promise.all([
        Promise.all(courses.map(c => api.assignments.getByCourse(c.id))),
        Promise.all(courses.map(c => api.grades.getByCourse(c.id))),
      ])
      const assignments: Assignment[] = assignsByCourse.flatMap((r: { ok: boolean; data: Assignment[] }) => r.ok ? r.data : [])
      const grades: Grade[] = gradesByCourse.flatMap((r: { ok: boolean; data: Grade[] }) => r.ok ? r.data : [])
      const gradeByAssignment = new Map(grades.map(g => [g.assignmentId, g]))

      const evRes = await api.calendar.getRange({ startMs: now - 7 * 86_400_000, endMs: now + 30 * 86_400_000 })
      const events: CalendarEvent[] = evRes.ok ? evRes.data : []

      const prefRes = await api.app.getPreferences()
      const leadTimeHours = prefRes.ok ? (prefRes.data.notificationAdvanceHours ?? 24) : 24

      const assignmentInputs: AssignmentInput[] = assignments.map(a => ({
        id: a.id, courseId: a.courseId, title: a.title, dueAt: a.dueAt,
        pointsPossible: a.pointsPossible,
        status: deriveStatus(a, gradeByAssignment.get(a.id), now),
        score: gradeByAssignment.get(a.id)?.score ?? null,
      }))

      const prevScores = lsGet<Record<string, number>>(K.scores, {})
      const result = generateReminders({
        now,
        courses: courses.map(c => ({ id: c.id, name: c.name, currentScore: c.currentScore, currentGrade: c.currentGrade })),
        assignments: assignmentInputs,
        events: events.map(e => ({ id: e.id, title: e.title, startAt: e.startAt, endAt: e.endAt, type: e.eventType, courseId: e.courseId })),
        custom: lsGet<CustomReminderInput[]>(K.custom, []),
        settings: { leadTimeHours, mutedCourses: [], quietHours: null },
        prevScores,
        dismissedIds: lsGet<string[]>(K.dismissed, []),
        snoozedUntil: lsGet<Record<string, number>>(K.snooze, {}),
      })

      // Update the score snapshot AFTER generating (so GRADE_DROP compares against
      // the previous sync, then remembers the current scores for next time).
      const nextScores: Record<string, number> = {}
      for (const c of courses) if (c.currentScore !== null) nextScores[c.id] = c.currentScore
      lsSet(K.scores, nextScores)

      if (!cancelled) { setReminders(result); setLoading(false) }
    }
    run()
    return () => { cancelled = true }
  }, [tick])

  const dismiss = (r: Reminder) => {
    const list = lsGet<string[]>(K.dismissed, [])
    lsSet(K.dismissed, [...new Set([...list, r.id])])
    setReminders(prev => prev.filter(x => x.id !== r.id))
  }
  const snooze = (r: Reminder, minutes: number) => {
    const map = lsGet<Record<string, number>>(K.snooze, {})
    map[r.id] = Date.now() + minutes * 60_000
    lsSet(K.snooze, map)
    setSnoozeOpen(null)
    setReminders(prev => prev.filter(x => x.id !== r.id))
  }
  const act = (r: Reminder) => {
    if (!r.action_target) { dismiss(r); return }
    if (r.action_target.startsWith('http')) api.app.openExternal(r.action_target)
    else navigate(r.action_target)
  }
  const addCustom = () => {
    const title = customText.trim()
    if (!title) return
    const list = lsGet<CustomReminderInput[]>(K.custom, [])
    list.push({ id: `${Date.now()}`, title, remindAt: Date.now() })
    lsSet(K.custom, list)
    setCustomText(''); setAdding(false); refresh()
  }

  const counts = useMemo(() => {
    const c = { critical: 0, high: 0, medium: 0, low: 0 } as Record<ReminderPriority, number>
    for (const r of reminders) c[r.priority]++
    return c
  }, [reminders])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2">
          <Bell size={14} className="text-accent-400" />
          <span className="text-sm font-semibold text-zinc-200">Smart Reminders</span>
          {reminders.length > 0 && (
            <span className="text-xs text-zinc-500">{reminders.length}</span>
          )}
        </div>
        <button onClick={() => setAdding(a => !a)} title="Add a custom reminder"
          className="text-zinc-500 hover:text-accent-400 transition-colors"><Plus size={15} /></button>
      </div>

      <AnimatePresence>
        {adding && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-white/5">
            <div className="p-3 flex gap-2">
              <input value={customText} onChange={e => setCustomText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addCustom() }}
                placeholder="Remind me to…" autoFocus
                className="flex-1 bg-surface-800 border border-white/10 rounded-md px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-accent-500" />
              <button onClick={addCustom} className="px-2.5 rounded-md bg-accent-500 hover:bg-accent-600 text-white text-xs">Add</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading ? (
          // Skeleton loaders (design-system: skeletons, not spinners)
          [0, 1, 2].map(i => (
            <div key={i} className="rounded-xl bg-surface-800 border border-white/5 p-3 animate-pulse">
              <div className="h-3 w-2/3 bg-surface-700 rounded mb-2" />
              <div className="h-2.5 w-full bg-surface-700 rounded mb-1.5" />
              <div className="h-2.5 w-4/5 bg-surface-700 rounded" />
            </div>
          ))
        ) : reminders.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-10 px-4">
            <CheckCircle2 size={22} className="text-green-400/80 mb-2" />
            <p className="text-sm text-zinc-300 font-medium">You're all caught up</p>
            <p className="text-xs text-zinc-600 mt-1">No deadlines, missing work, or conflicts need your attention right now.</p>
          </div>
        ) : (
          reminders.map((r, i) => {
            const ps = PRIORITY_STYLE[r.priority]
            return (
              <motion.div key={r.id}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.04, 0.2) }}
                className={cn('rounded-xl bg-surface-800 border p-3', ps.ring)}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', ps.dot)} />
                  <span className={cn('text-2xs font-semibold uppercase tracking-wider', ps.text)}>{ps.label}</span>
                  {r.course && <span className="text-2xs text-zinc-600 truncate">· {r.course}</span>}
                  <span className="text-2xs text-zinc-600 ml-auto shrink-0">{r.time_context}</span>
                </div>
                <p className="text-sm font-medium text-zinc-100 mb-1 leading-snug">{r.title}</p>
                <p className="text-xs text-zinc-400 leading-relaxed mb-2.5">{r.body}</p>

                <div className="flex items-center gap-1.5">
                  <button onClick={() => act(r)}
                    className="inline-flex items-center gap-1 px-2.5 h-7 rounded-md bg-accent-500/15 text-accent-400 hover:bg-accent-500/25 text-xs font-medium transition-colors">
                    {r.action_label} <ChevronRight size={12} />
                  </button>
                  {r.snoozeable && (
                    <div className="relative">
                      <button onClick={() => setSnoozeOpen(o => o === r.id ? null : r.id)} title="Snooze"
                        className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-surface-700 transition-colors">
                        <AlarmClock size={13} />
                      </button>
                      {snoozeOpen === r.id && (
                        <div className="absolute z-10 left-0 mt-1 bg-surface-700 border border-white/10 rounded-lg p-1 shadow-lg">
                          {r.snooze_options_minutes.map(m => (
                            <button key={m} onClick={() => snooze(r, m)}
                              className="block w-full text-left px-2.5 py-1 rounded text-xs text-zinc-300 hover:bg-surface-600 whitespace-nowrap">
                              {m < 60 ? `${m} min` : m < 1440 ? `${m / 60} hr` : `${m / 1440} day`}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {r.dismissible && (
                    <button onClick={() => dismiss(r)} title="Dismiss"
                      className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-surface-700 transition-colors ml-auto">
                      <X size={13} />
                    </button>
                  )}
                </div>
              </motion.div>
            )
          })
        )}
      </div>

      {!loading && reminders.length > 0 && (counts.critical > 0 || counts.high > 0) && (
        <div className="px-4 py-2 border-t border-white/5 text-2xs text-zinc-600 shrink-0">
          {counts.critical > 0 && <span className="text-red-400 font-medium">{counts.critical} critical</span>}
          {counts.critical > 0 && counts.high > 0 && ' · '}
          {counts.high > 0 && <span className="text-amber-400 font-medium">{counts.high} high</span>}
          {' need attention'}
        </div>
      )}
    </div>
  )
}
