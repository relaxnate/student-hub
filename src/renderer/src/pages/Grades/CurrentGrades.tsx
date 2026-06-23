import { useEffect, useState, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  BarChart2, CheckCircle2, AlertCircle, Minus, TrendingUp,
  List, Table, Activity, SortAsc,
} from 'lucide-react'
import { api } from '../../lib/ipc'
import { cn, percentToLetter } from '../../lib/utils'
import { Badge, Spinner, EmptyState, SectionHeader } from '../../components/ui/Badge'
import { useWorkspaceStore } from '../../store/workspace.store'
import { useAppStore } from '../../store/app.store'
import type { Course, Assignment, Grade } from '@shared/types/entities'
import type { GradesLayout } from '@shared/types/ipc'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CourseSummary {
  course:         Course
  assignments:    (Assignment & { grade?: Grade })[]
  earnedPoints:   number
  totalPoints:    number
  officialPercent: number | null
  officialGrade:   string | null
  rawPercent:      number | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gradeColor(pct: number | null): string {
  if (pct === null) return 'text-zinc-500'
  if (pct >= 90) return 'text-green-400'
  if (pct >= 70) return 'text-amber-400'
  return 'text-red-400'
}

function gradeBg(pct: number | null): string {
  if (pct === null) return 'bg-zinc-600'
  if (pct >= 90) return 'bg-green-500'
  if (pct >= 70) return 'bg-amber-500'
  return 'bg-red-500'
}

// ─── Layout controls ──────────────────────────────────────────────────────────

const LAYOUT_OPTIONS: { value: GradesLayout; icon: React.ReactNode; label: string }[] = [
  { value: 'overview',   icon: <List size={14} />,     label: 'Overview'  },
  { value: 'table',      icon: <Table size={14} />,    label: 'Table'     },
  { value: 'analytics',  icon: <Activity size={14} />, label: 'Analytics' },
]

type GradesSortBy = 'name' | 'grade-high' | 'grade-low' | 'most-missing'
const SORT_OPTIONS: { value: GradesSortBy; label: string }[] = [
  { value: 'name',         label: 'Course name'    },
  { value: 'grade-high',   label: 'Grade: High'    },
  { value: 'grade-low',    label: 'Grade: Low'     },
  { value: 'most-missing', label: 'Most missing'   },
]

// ─── Overview / List layout — detailed course cards ───────────────────────────
// Restored original view: one card per course showing grade bar, stats, and
// the first 8 graded assignments with individual scores.

function OverviewLayout({ summaries }: { summaries: CourseSummary[] }) {
  const now = Date.now()

  return (
    <div className="space-y-4">
      {summaries.map((s, i) => {
        const displayPct = s.officialPercent ?? s.rawPercent
        const letter     = s.officialGrade ?? percentToLetter(displayPct)
        const isEstimate = s.officialPercent === null && s.rawPercent !== null
        const graded  = s.assignments.filter(a => a.grade?.workflowState === 'graded')
        const missing = s.assignments.filter(a =>
          a.dueAt && a.dueAt < now && (!a.grade || a.grade.workflowState === 'unsubmitted')
        )

        return (
          <motion.div key={s.course.id}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="rounded-xl bg-surface-800 border border-white/5 overflow-hidden">

            {/* Course header */}
            <div className="flex items-center gap-4 px-5 py-4 border-b border-white/5">
              <div className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center text-white font-bold text-sm"
                style={{ background: s.course.color ?? '#6366f1' }}>
                {letter !== '--' && letter !== 'N/A' ? letter : <BarChart2 size={16} />}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-100 truncate">{s.course.name}</p>
                <div className="flex items-center gap-2 text-xs text-zinc-500 mt-0.5">
                  {s.course.courseCode && <span>{s.course.courseCode}</span>}
                  {s.course.courseCode && s.course.term && <span className="text-zinc-700">·</span>}
                  {s.course.term && <span>{s.course.term}</span>}
                </div>
              </div>

              <div className="text-right shrink-0">
                {displayPct !== null ? (
                  <>
                    <p className={cn('text-2xl font-bold tabular-nums leading-none', gradeColor(displayPct))}>
                      {displayPct}%
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {isEstimate
                        ? `${s.earnedPoints.toFixed(1)} / ${s.totalPoints.toFixed(1)} pts`
                        : `${s.earnedPoints.toFixed(1)} / ${s.totalPoints.toFixed(1)} pts synced`}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-zinc-600">No grades yet</p>
                )}
              </div>
            </div>

            {/* Progress bar */}
            {displayPct !== null && (
              <div className="h-1 bg-surface-700">
                <motion.div
                  className={gradeBg(displayPct)}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(displayPct, 100)}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut', delay: i * 0.04 }}
                  style={{ height: '100%' }}
                />
              </div>
            )}

            {/* Stats row */}
            <div className="flex divide-x divide-white/5 px-5 py-3">
              {[
                { label: 'Graded',  value: graded.length,  icon: <CheckCircle2 size={12} className="text-green-400" /> },
                { label: 'Missing', value: missing.length, icon: <AlertCircle  size={12} className={missing.length > 0 ? 'text-red-400' : 'text-zinc-600'} /> },
                { label: 'Total',   value: s.assignments.length, icon: <TrendingUp  size={12} className="text-zinc-500" /> },
              ].map(stat => (
                <div key={stat.label} className="flex-1 flex items-center gap-1.5 px-3 first:pl-0 last:pr-0">
                  {stat.icon}
                  <span className="text-xs text-zinc-400">{stat.value} {stat.label.toLowerCase()}</span>
                </div>
              ))}
            </div>

            {/* Assignment rows (up to 8) */}
            {s.assignments.length > 0 && (
              <div className="border-t border-white/5">
                {s.assignments.slice(0, 8).map((a, idx) => {
                  const rowPct = a.grade?.score != null && a.pointsPossible
                    ? Math.round((a.grade.score / a.pointsPossible) * 100) : null
                  const isOverdue = a.dueAt && a.dueAt < now

                  return (
                    <div key={a.id} className={cn(
                      'flex items-center gap-3 px-5 py-2.5 hover:bg-white/3 transition-colors',
                      idx < Math.min(s.assignments.length, 8) - 1 && 'border-b border-white/3'
                    )}>
                      {!a.grade || a.grade.workflowState === 'unsubmitted'
                        ? (isOverdue
                          ? <AlertCircle  size={12} className="text-red-400 shrink-0" />
                          : <Minus        size={12} className="text-zinc-600 shrink-0" />)
                        : a.grade.workflowState === 'graded'
                          ? <CheckCircle2 size={12} className="text-green-400 shrink-0" />
                          : <CheckCircle2 size={12} className="text-blue-400 shrink-0" />}

                      <span className="flex-1 text-xs text-zinc-300 truncate">{a.title}</span>

                      {a.grade?.isLate    && <Badge variant="warning">Late</Badge>}
                      {a.grade?.isExcused && <Badge variant="info">Excused</Badge>}

                      <div className="text-right shrink-0 min-w-[80px]">
                        {a.grade?.workflowState === 'graded' && a.grade.score !== null ? (
                          <span className={cn('text-xs font-medium tabular-nums', gradeColor(rowPct))}>
                            {a.grade.score}/{a.pointsPossible}
                          </span>
                        ) : a.pointsPossible !== null ? (
                          <span className="text-xs text-zinc-600">--/{a.pointsPossible}</span>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
                {s.assignments.length > 8 && (
                  <p className="text-xs text-zinc-600 text-center py-2.5">
                    +{s.assignments.length - 8} more assignments
                  </p>
                )}
              </div>
            )}
          </motion.div>
        )
      })}
    </div>
  )
}

// ─── Table layout — course tiles ──────────────────────────────────────────────
// 2-column tile grid. Each tile shows the grade prominently; clicking navigates
// to the assignments tab pre-filtered to that course.

function TableLayout({ summaries }: { summaries: CourseSummary[] }) {
  const navigate = useNavigate()
  const now      = Date.now()

  return (
    <div className="grid grid-cols-2 gap-4">
      {summaries.map((s, i) => {
        const pct     = s.officialPercent ?? s.rawPercent
        const letter  = s.officialGrade ?? percentToLetter(pct)
        const graded  = s.assignments.filter(a => a.grade?.workflowState === 'graded').length
        const missing = s.assignments.filter(a =>
          a.dueAt && a.dueAt < now && (!a.grade || a.grade.workflowState === 'unsubmitted')
        ).length

        return (
          <motion.button
            key={s.course.id}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => navigate(`/assignments?course=${s.course.id}`)}
            className="text-left bg-surface-800 border border-white/5 rounded-xl overflow-hidden hover:border-white/20 hover:bg-surface-700/60 transition-all group cursor-pointer">

            <div className="h-1.5" style={{ background: s.course.color ?? '#6366f1' }} />

            <div className="p-5">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-zinc-100 group-hover:text-white leading-snug line-clamp-2 transition-colors">
                    {s.course.name}
                  </h3>
                  <p className="text-2xs text-zinc-500 mt-1">
                    {[s.course.courseCode, s.course.term].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={cn('text-3xl font-bold tabular-nums leading-none', gradeColor(pct))}>
                    {pct !== null ? `${pct}%` : '—'}
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5 font-medium">{letter}</p>
                </div>
              </div>

              {pct !== null && (
                <div className="h-1.5 bg-surface-600 rounded-full overflow-hidden mb-3">
                  <motion.div
                    className={cn('h-full rounded-full', gradeBg(pct))}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(pct, 100)}%` }}
                    transition={{ duration: 0.7, ease: 'easeOut', delay: i * 0.05 }}
                  />
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-2xs text-zinc-500">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 size={10} className="text-green-400" />
                    {graded} graded
                  </span>
                  {missing > 0 && (
                    <span className="flex items-center gap-1 text-red-400">
                      <AlertCircle size={10} />
                      {missing} missing
                    </span>
                  )}
                </div>
                <span className="text-2xs text-accent-400/60 group-hover:text-accent-400 transition-colors font-medium">
                  Assignments →
                </span>
              </div>

              {s.totalPoints > 0 && (
                <p className="text-2xs text-zinc-600 mt-2">
                  {s.earnedPoints.toFixed(1)} / {s.totalPoints.toFixed(1)} pts
                </p>
              )}
            </div>
          </motion.button>
        )
      })}
    </div>
  )
}


// ─── Analytics layout ─────────────────────────────────────────────────────────

function AnalyticsLayout({ summaries }: { summaries: CourseSummary[] }) {
  const now = Date.now()

  const allGraded = summaries.flatMap(s =>
    s.assignments.filter(a => a.grade?.workflowState === 'graded' && a.grade.score != null && a.pointsPossible)
  )

  const buckets: Record<string, number> = { 'A (90-100)': 0, 'B (80-89)': 0, 'C (70-79)': 0, 'D (60-69)': 0, 'F (<60)': 0 }
  for (const a of allGraded) {
    const pct = ((a.grade!.score!) / a.pointsPossible!) * 100
    if (pct >= 90)      buckets['A (90-100)']++
    else if (pct >= 80) buckets['B (80-89)']++
    else if (pct >= 70) buckets['C (70-79)']++
    else if (pct >= 60) buckets['D (60-69)']++
    else                buckets['F (<60)']++
  }
  const maxBucket = Math.max(...Object.values(buckets), 1)

  const bucketColors: Record<string, string> = {
    'A (90-100)': 'bg-green-500',
    'B (80-89)':  'bg-green-400',
    'C (70-79)':  'bg-amber-400',
    'D (60-69)':  'bg-amber-500',
    'F (<60)':    'bg-red-500',
  }

  const overallAvg = summaries.reduce((s, c) => s + (c.officialPercent ?? c.rawPercent ?? 0), 0)
    / (summaries.filter(s => s.officialPercent != null || s.rawPercent != null).length || 1)

  const totalMissing = summaries.flatMap(s => s.assignments).filter(a =>
    a.dueAt && a.dueAt < now && (!a.grade || a.grade.workflowState === 'unsubmitted')
  ).length

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Overall avg',   value: `${Math.round(overallAvg)}%`, color: gradeColor(overallAvg) },
          { label: 'Graded items',  value: String(allGraded.length),      color: 'text-green-400' },
          { label: 'Missing items', value: String(totalMissing),          color: totalMissing > 0 ? 'text-red-400' : 'text-zinc-400' },
        ].map(s => (
          <div key={s.label} className="bg-surface-800 border border-white/5 rounded-xl p-4 text-center">
            <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
            <p className="text-xs text-zinc-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Grade distribution bar chart */}
      <div className="bg-surface-800 border border-white/5 rounded-xl p-5">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Grade distribution</p>
        <div className="space-y-3">
          {Object.entries(buckets).map(([label, count]) => (
            <div key={label} className="flex items-center gap-3">
              <span className="text-xs text-zinc-400 w-24 shrink-0">{label}</span>
              <div className="flex-1 bg-surface-700 rounded-full h-2.5 overflow-hidden">
                <motion.div
                  className={cn('h-full rounded-full', bucketColors[label])}
                  initial={{ width: 0 }}
                  animate={{ width: `${(count / maxBucket) * 100}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }} />
              </div>
              <span className="text-xs text-zinc-500 w-5 text-right">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Per-course bar chart */}
      <div className="bg-surface-800 border border-white/5 rounded-xl p-5">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Course scores</p>
        <div className="space-y-3">
          {summaries.map(s => {
            const pct = s.officialPercent ?? s.rawPercent
            return (
              <div key={s.course.id} className="flex items-center gap-3">
                <span className="text-xs text-zinc-300 w-36 truncate shrink-0">{s.course.name}</span>
                <div className="flex-1 bg-surface-700 rounded-full h-2.5 overflow-hidden">
                  {pct !== null && (
                    <motion.div
                      className={gradeBg(pct)}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(pct, 100)}%` }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                      style={{ height: '100%' }} />
                  )}
                </div>
                <span className={cn('text-xs font-bold w-12 text-right', gradeColor(pct))}>
                  {pct !== null ? `${Math.round(pct)}%` : '—'}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CurrentGrades() {
  const [searchParams] = useSearchParams()
  const filterCourseId = searchParams.get('course')

  const ws          = useWorkspaceStore()
  const active      = ws.active()
  const layout      = active.pagePrefs.gradesLayout
  const showHistory = useAppStore(s => s.preferences?.showHistoryCourses ?? false)

  const [summaries, setSummaries] = useState<CourseSummary[]>([])
  const [loading,   setLoading]   = useState(true)
  const [sortBy,    setSortBy]    = useState<GradesSortBy>('name')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const cRes = await (showHistory ? api.courses.getAllIncludingInactive() : api.courses.getAll())
      if (!cRes.ok || cRes.data.length === 0) { setLoading(false); return }

      const built = await Promise.all(
        cRes.data.map(async (course: Course) => {
          const [aRes, gRes] = await Promise.all([
            api.assignments.getByCourse(course.id),
            api.grades.getByCourse(course.id),
          ])
          const gradeMap   = new Map((gRes.ok ? gRes.data : []).map((g: Grade) => [g.assignmentId, g]))
          const assignments = (aRes.ok ? aRes.data : []).map((a: Assignment) => ({
            ...a, grade: gradeMap.get(a.id) as Grade | undefined,
          }))
          const graded = assignments.filter((a: Assignment & { grade?: Grade }) =>
            a.grade?.workflowState === 'graded' && a.grade.score !== null &&
            a.pointsPossible !== null && a.pointsPossible > 0 && !a.grade.isExcused
          )
          const earnedPts = graded.reduce((s: number, a: Assignment & { grade?: Grade }) => s + (a.grade!.score ?? 0), 0)
          const totalPts  = graded.reduce((s: number, a: Assignment & { grade?: Grade }) => s + (a.pointsPossible ?? 0), 0)
          return {
            course,
            assignments,
            earnedPoints:    earnedPts,
            totalPoints:     totalPts,
            officialPercent: course.currentScore !== null ? Math.round(course.currentScore) : null,
            officialGrade:   course.currentGrade,
            rawPercent:      totalPts > 0 ? Math.round((earnedPts / totalPts) * 100) : null,
          } as CourseSummary
        })
      )
      setSummaries(built)
      setLoading(false)
    }
    load()
  }, [showHistory])

  const displayed = useMemo(() => {
    const base = filterCourseId
      ? summaries.filter(s => s.course.id === filterCourseId)
      : summaries
    switch (sortBy) {
      case 'grade-high':   return [...base].sort((a, b) => (b.officialPercent ?? b.rawPercent ?? -1) - (a.officialPercent ?? a.rawPercent ?? -1))
      case 'grade-low':    return [...base].sort((a, b) => (a.officialPercent ?? a.rawPercent ?? 101) - (b.officialPercent ?? b.rawPercent ?? 101))
      case 'most-missing': {
        const now = Date.now()
        return [...base].sort((a, b) => {
          const miss = (s: CourseSummary) => s.assignments.filter(x => x.dueAt && x.dueAt < now && (!x.grade || x.grade.workflowState === 'unsubmitted')).length
          return miss(b) - miss(a)
        })
      }
      default: return [...base].sort((a, b) => a.course.name.localeCompare(b.course.name))
    }
  }, [summaries, filterCourseId, sortBy])

  if (loading) return <div className="flex items-center justify-center h-full"><Spinner size={20} /></div>

  if (displayed.length === 0) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
          <SectionHeader title="Grades" subtitle="Your current courses, as reported by the LMS." />
          <EmptyState icon={<BarChart2 size={20} />} title="No active courses"
            description="Your current-semester grades will appear here after syncing." />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
        {/* Header + controls */}
        <div className="flex items-start justify-between gap-4">
          <SectionHeader title="Grades"
            subtitle={`${displayed.length} course${displayed.length !== 1 ? 's' : ''}`} />

          <div className="flex items-center gap-2 shrink-0">
            {/* Sort */}
            <div className="flex items-center gap-1.5">
              <SortAsc size={13} className="text-zinc-500" />
              <select value={sortBy} onChange={e => setSortBy(e.target.value as GradesSortBy)}
                className="bg-surface-700 border border-white/10 rounded-md text-xs text-zinc-300 px-2 py-1.5 focus:outline-none">
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* Layout toggle */}
            <div className="flex rounded-lg border border-white/10 overflow-hidden">
              {LAYOUT_OPTIONS.map(o => (
                <button key={o.value} onClick={() => ws.updatePagePrefs({ gradesLayout: o.value })}
                  title={o.label}
                  className={cn('px-2.5 py-1.5 transition-colors',
                    layout === o.value ? 'bg-accent-500/20 text-accent-400' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5')}>
                  {o.icon}
                </button>
              ))}
            </div>
          </div>
        </div>

        {layout === 'overview'  && <OverviewLayout  summaries={displayed} />}
        {layout === 'table'     && <TableLayout     summaries={displayed} />}
        {layout === 'analytics' && <AnalyticsLayout summaries={displayed} />}
      </div>
    </div>
  )
}
