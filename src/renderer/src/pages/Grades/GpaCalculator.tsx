// Grade & GPA Calculator
// Shows ALL synced courses across all years (including past/inactive ones) so
// students can review historical grades and compute a cumulative GPA.
// Data source: api.courses.getAllIncludingInactive()  (NOT getAll, which is active-only)

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Calculator, ChevronDown, ChevronRight, ArrowLeft, RotateCcw,
  Percent, Clock, GraduationCap,
} from 'lucide-react'
import { api } from '../../lib/ipc'
import { cn, formatDueDate, percentToLetter } from '../../lib/utils'
import { Badge, Spinner, EmptyState, SectionHeader } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import type { Course, Assignment, Grade, AssignmentGroup } from '@shared/types/entities'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AssignmentWithGrade = Assignment & { grade?: Grade }

interface CourseData {
  assignments: AssignmentWithGrade[]
  groups: AssignmentGroup[]
}

interface CourseComputed {
  percent: number | null
  letter: string
  gpa: number | null
  earned: number
  possible: number
  weighted: boolean
  hasOverride: boolean
}

// ---------------------------------------------------------------------------
// GPA scale (standard unweighted 4.0)
// ---------------------------------------------------------------------------

const GPA_SCALE: { min: number; points: number; label: string }[] = [
  { min: 97, points: 4.0, label: 'A+' },
  { min: 93, points: 4.0, label: 'A'  },
  { min: 90, points: 3.7, label: 'A-' },
  { min: 87, points: 3.3, label: 'B+' },
  { min: 83, points: 3.0, label: 'B'  },
  { min: 80, points: 2.7, label: 'B-' },
  { min: 77, points: 2.3, label: 'C+' },
  { min: 73, points: 2.0, label: 'C'  },
  { min: 70, points: 1.7, label: 'C-' },
  { min: 67, points: 1.3, label: 'D+' },
  { min: 63, points: 1.0, label: 'D'  },
  { min: 60, points: 0.7, label: 'D-' },
  { min: 0,  points: 0.0, label: 'F'  },
]

function percentToGPA(percent: number | null): number | null {
  if (percent === null) return null
  const tier = GPA_SCALE.find(t => percent >= t.min)
  return tier ? tier.points : 0.0
}

type RiskLevel = 'green' | 'yellow' | 'red' | 'none'

function gpaRisk(gpa: number | null): RiskLevel {
  if (gpa === null) return 'none'
  if (gpa >= 3.0) return 'green'
  if (gpa >= 2.0) return 'yellow'
  return 'red'
}

const RISK_STYLES: Record<RiskLevel, { text: string; bg: string; ring: string; label: string }> = {
  green:  { text: 'text-green-400', bg: 'bg-green-500',  ring: 'ring-green-500/30',  label: 'On track' },
  yellow: { text: 'text-amber-400', bg: 'bg-amber-500',  ring: 'ring-amber-500/30',  label: 'Could improve' },
  red:    { text: 'text-red-400',   bg: 'bg-red-500',    ring: 'ring-red-500/30',    label: 'At risk — talk to an advisor' },
  none:   { text: 'text-zinc-500',  bg: 'bg-zinc-600',   ring: 'ring-white/10',      label: 'No data yet' },
}

// ---------------------------------------------------------------------------
// Year grouping
// ---------------------------------------------------------------------------

function getCourseYear(course: Course): string {
  if (course.term) {
    const m = course.term.match(/(19|20)\d{2}/)
    if (m) return m[0]
  }
  if (course.startDate) return String(new Date(course.startDate).getFullYear())
  if (course.endDate)   return String(new Date(course.endDate).getFullYear())
  return 'Other'
}

// ---------------------------------------------------------------------------
// Score math
// ---------------------------------------------------------------------------

function getEffectiveScore(a: AssignmentWithGrade, whatIf: Map<string, number>): number | null {
  if (whatIf.has(a.id)) return whatIf.get(a.id)!
  if (a.grade && a.grade.workflowState === 'graded' && a.grade.score !== null && !a.grade.isExcused) {
    return a.grade.score
  }
  return null
}

function computeCourse(
  course: Course,
  data: CourseData | undefined,
  whatIf: Map<string, number>,
): CourseComputed {
  const assignments = data?.assignments ?? []
  const groups       = data?.groups ?? []

  const usable = assignments
    .map(a => ({ a, score: getEffectiveScore(a, whatIf) }))
    .filter((x): x is { a: AssignmentWithGrade; score: number } =>
      x.score !== null && x.a.pointsPossible !== null && x.a.pointsPossible! > 0)

  const hasOverride = assignments.some(a => whatIf.has(a.id))

  if (usable.length === 0) {
    // Fall back to Canvas-reported score when no local assignment data is
    // available or no assignments are graded yet.
    const fallbackPct = course.currentScore !== null ? course.currentScore : null
    return {
      percent: fallbackPct,
      letter:  percentToLetter(fallbackPct !== null ? Math.round(fallbackPct) : null),
      gpa:     percentToGPA(fallbackPct !== null ? Math.round(fallbackPct) : null),
      earned: 0, possible: 0, weighted: false, hasOverride,
    }
  }

  const earned   = usable.reduce((s, x) => s + x.score, 0)
  const possible = usable.reduce((s, x) => s + x.a.pointsPossible!, 0)

  if (course.applyGroupWeights && groups.length > 0) {
    const byGroup = new Map<string, { earned: number; possible: number }>()
    for (const { a, score } of usable) {
      if (!a.assignmentGroupId) continue
      const g = byGroup.get(a.assignmentGroupId) ?? { earned: 0, possible: 0 }
      g.earned += score
      g.possible += a.pointsPossible!
      byGroup.set(a.assignmentGroupId, g)
    }
    let weightedSum = 0, weightTotal = 0
    for (const group of groups) {
      const g = byGroup.get(group.id)
      if (g && g.possible > 0) {
        weightedSum += (g.earned / g.possible) * group.groupWeight
        weightTotal += group.groupWeight
      }
    }
    const percent = weightTotal > 0
      ? (weightedSum / weightTotal) * 100
      : (possible > 0 ? (earned / possible) * 100 : null)
    return {
      percent,
      letter: percentToLetter(percent !== null ? Math.round(percent) : null),
      gpa:    percentToGPA(percent !== null ? Math.round(percent) : null),
      earned, possible, weighted: true, hasOverride,
    }
  }

  const percent = possible > 0 ? (earned / possible) * 100 : null
  return {
    percent,
    letter: percentToLetter(percent !== null ? Math.round(percent) : null),
    gpa:    percentToGPA(percent !== null ? Math.round(percent) : null),
    earned, possible, weighted: false, hasOverride,
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function GpaCalculator() {
  const [searchParams] = useSearchParams()
  const preselectCourseId = searchParams.get('course')

  const [courses,          setCourses]          = useState<Course[]>([])
  const [courseDataMap,    setCourseDataMap]     = useState<Record<string, CourseData>>({})
  const [whatIf,           setWhatIf]            = useState<Map<string, number>>(new Map())
  const [loading,          setLoading]           = useState(true)
  const [view,             setView]              = useState<'overview' | 'detail'>('overview')
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null)
  const [gpaRevealed,      setGpaRevealed]       = useState(false)
  const [expandedYears,    setExpandedYears]     = useState<Set<string>>(new Set())

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    const load = async () => {
      setLoading(true)

      // Fetch ALL courses (including past/inactive) so the year history is complete
      const [cRes, wRes] = await Promise.all([
        api.courses.getAllIncludingInactive(),
        api.whatIf.getAll(),
      ])

      const loadedCourses = cRes.ok ? cRes.data : []
      setCourses(loadedCourses)

      if (wRes.ok) {
        const map = new Map<string, number>()
        for (const w of wRes.data) {
          if (w.hypotheticalScore !== null) map.set(w.assignmentId, w.hypotheticalScore)
        }
        setWhatIf(map)
      }

      // Load assignments + grades + groups for every course in parallel
      const entries = await Promise.all(
        loadedCourses.map(async course => {
          const [aRes, gRes, grpRes] = await Promise.all([
            api.assignments.getByCourse(course.id),
            api.grades.getByCourse(course.id),
            api.assignmentGroups.getByCourse(course.id),
          ])
          const gradeMap = new Map((gRes.ok ? gRes.data : []).map(g => [g.assignmentId, g]))
          const assignments = (aRes.ok ? aRes.data : []).map(a => ({
            ...a,
            grade: gradeMap.get(a.id),
          }))
          return [
            course.id,
            { assignments, groups: grpRes.ok ? grpRes.data : [] },
          ] as const
        })
      )
      setCourseDataMap(Object.fromEntries(entries))

      // Expand the most recent year by default
      const years = Array.from(new Set(loadedCourses.map(getCourseYear)))
        .sort((a, b) => (b === 'Other' ? -1 : a === 'Other' ? 1 : Number(b) - Number(a)))
      if (years.length > 0) setExpandedYears(new Set([years[0]]))

      // Pre-select a course if linked from CourseDetail
      if (preselectCourseId && loadedCourses.some(c => c.id === preselectCourseId)) {
        setSelectedCourseId(preselectCourseId)
        setView('detail')
      }

      setLoading(false)
    }
    load()
  }, [])

  // -- What-if editing ---------------------------------------------------------

  function schedulePersist(assignmentId: string, value: number | null) {
    if (saveTimers.current[assignmentId]) clearTimeout(saveTimers.current[assignmentId])
    saveTimers.current[assignmentId] = setTimeout(() => {
      api.whatIf.set({ assignmentId, hypotheticalScore: value })
    }, 400)
  }

  function handleScoreInput(assignmentId: string, raw: string) {
    const trimmed = raw.trim()
    if (trimmed === '') {
      setWhatIf(prev => { const n = new Map(prev); n.delete(assignmentId); return n })
      schedulePersist(assignmentId, null)
      return
    }
    const num = parseFloat(trimmed)
    if (Number.isNaN(num)) return
    setWhatIf(prev => { const n = new Map(prev); n.set(assignmentId, num); return n })
    schedulePersist(assignmentId, num)
  }

  function handleResetAssignment(assignmentId: string) {
    if (saveTimers.current[assignmentId]) clearTimeout(saveTimers.current[assignmentId])
    setWhatIf(prev => { const n = new Map(prev); n.delete(assignmentId); return n })
    api.whatIf.set({ assignmentId, hypotheticalScore: null })
  }

  async function handleResetCourse(courseId: string) {
    const ids = (courseDataMap[courseId]?.assignments ?? []).map(a => a.id)
    setWhatIf(prev => { const n = new Map(prev); ids.forEach(id => n.delete(id)); return n })
    await api.whatIf.clearCourse(courseId)
  }

  async function handleResetAll() {
    setWhatIf(new Map())
    await api.whatIf.clearAll()
  }

  // -- Derived data ------------------------------------------------------------

  const computedByCourse = useMemo(() => {
    const map = new Map<string, CourseComputed>()
    for (const c of courses) map.set(c.id, computeCourse(c, courseDataMap[c.id], whatIf))
    return map
  }, [courses, courseDataMap, whatIf])

  const overallGPA = useMemo(() => {
    const pts = courses
      .map(c => computedByCourse.get(c.id)?.gpa)
      .filter((g): g is number => g !== null && g !== undefined)
    if (!pts.length) return null
    return Math.round((pts.reduce((s, g) => s + g, 0) / pts.length) * 100) / 100
  }, [courses, computedByCourse])

  // Courses grouped by year, newest year first
  const coursesByYear = useMemo(() => {
    const groups = new Map<string, Course[]>()
    for (const c of courses) {
      const year = getCourseYear(c)
      if (!groups.has(year)) groups.set(year, [])
      groups.get(year)!.push(c)
    }
    for (const list of groups.values()) list.sort((a, b) => a.name.localeCompare(b.name))
    return Array.from(groups.entries()).sort(([a], [b]) =>
      a === 'Other' ? 1 : b === 'Other' ? -1 : Number(b) - Number(a)
    )
  }, [courses])

  const hasAnyOverride  = whatIf.size > 0
  const selectedCourse  = selectedCourseId ? courses.find(c => c.id === selectedCourseId) ?? null : null
  const risk            = RISK_STYLES[gpaRisk(overallGPA)]

  const toggleYear = (year: string) =>
    setExpandedYears(prev => {
      const n = new Set(prev)
      n.has(year) ? n.delete(year) : n.add(year)
      return n
    })

  const goToCourse = (courseId: string) => {
    setSelectedCourseId(courseId)
    setView('detail')
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Spinner size={20} /></div>
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        {view === 'overview' ? (
          <>
            <SectionHeader title="Grade & GPA Calculator"
              subtitle="Every synced course, past and present — edit hypothetical scores to see how your grades and GPA would change." />

            {courses.length === 0 ? (
              <EmptyState icon={<Calculator size={20} />} title="No courses synced yet"
                description="Sync your courses to start using the Grade & GPA Calculator." />
            ) : (
              <>
                {/* GPA summary card */}
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className={cn('rounded-2xl bg-surface-800 border p-6 ring-1',
                    risk.ring, 'border-white/5')}>
                  <div className="flex items-start justify-between gap-6 flex-wrap">
                    <div className="flex items-center gap-5">
                      <div className={cn('w-16 h-16 rounded-2xl flex items-center justify-center shrink-0',
                        gpaRevealed ? risk.bg + '/15' : 'bg-surface-700')}>
                        <GraduationCap size={26} className={gpaRevealed ? risk.text : 'text-zinc-500'} />
                      </div>
                      <div>
                        <p className="text-xs text-zinc-500 mb-1">Overall GPA (4.0 scale)</p>
                        {gpaRevealed ? (
                          <>
                            <p className={cn('text-4xl font-bold tabular-nums leading-none', risk.text)}>
                              {overallGPA !== null ? overallGPA.toFixed(2) : '--'}
                            </p>
                            <p className={cn('text-xs font-medium mt-1.5', risk.text)}>{risk.label}</p>
                          </>
                        ) : (
                          <p className="text-2xl font-semibold text-zinc-600">Press Calculate</p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      {!gpaRevealed ? (
                        <Button variant="primary" size="md" icon={<Calculator size={14} />}
                          onClick={() => setGpaRevealed(true)}>
                          Calculate GPA
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" icon={<RotateCcw size={12} />}
                          disabled={!hasAnyOverride} onClick={handleResetAll}>
                          Reset all what-if edits
                        </Button>
                      )}
                      {gpaRevealed && (
                        <p className="text-2xs text-zinc-600 max-w-[220px] text-right">
                          Live · simple average across all courses, not credit-weighted
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Color legend */}
                  {gpaRevealed && (
                    <div className="flex items-center gap-4 mt-5 pt-4 border-t border-white/5 text-2xs text-zinc-500">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-green-500" /> 3.0+ On track
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500" /> 2.0-2.99 Could improve
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-red-500" /> &lt;2.0 At risk
                      </span>
                    </div>
                  )}

                  {/* Per-course chips */}
                  {gpaRevealed && courses.length > 0 && (
                    <div className="flex gap-2 mt-4 pt-4 border-t border-white/5 overflow-x-auto pb-1">
                      {courses.map(c => {
                        const comp = computedByCourse.get(c.id)
                        return (
                          <button key={c.id} onClick={() => goToCourse(c.id)}
                            className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-700/60 border border-white/5 hover:border-white/20 transition-colors">
                            <span className="w-2 h-2 rounded-full shrink-0"
                              style={{ background: c.color ?? '#6366f1' }} />
                            <span className="text-xs text-zinc-300 max-w-[140px] truncate">{c.name}</span>
                            <span className="text-xs font-semibold text-zinc-400 tabular-nums">
                              {comp?.percent !== null && comp?.percent !== undefined
                                ? `${Math.round(comp.percent)}%` : '--'}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </motion.div>

                {/* Year groups */}
                <div className="space-y-3">
                  {coursesByYear.map(([year, yearCourses]) => {
                    const isExpanded = expandedYears.has(year)
                    return (
                      <div key={year}
                        className="rounded-xl bg-surface-800 border border-white/5 overflow-hidden">
                        <button onClick={() => toggleYear(year)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/3 transition-colors">
                          <span className="text-zinc-500 shrink-0">
                            {isExpanded
                              ? <ChevronDown size={14} />
                              : <ChevronRight size={14} />}
                          </span>
                          <span className="flex-1 text-sm font-semibold text-zinc-200">{year}</span>
                          <span className="text-xs text-zinc-600">
                            {yearCourses.length} course{yearCourses.length !== 1 ? 's' : ''}
                          </span>
                        </button>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                              className="overflow-hidden border-t border-white/5">
                              {yearCourses.map((c, idx) => {
                                const comp    = computedByCourse.get(c.id)
                                const percent = comp?.percent ?? null
                                return (
                                  <button key={c.id} onClick={() => goToCourse(c.id)}
                                    className={cn(
                                      'w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/3 transition-colors',
                                      idx < yearCourses.length - 1 && 'border-b border-white/3'
                                    )}>
                                    <div className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-white text-2xs font-bold"
                                      style={{ background: c.color ?? '#6366f1' }}>
                                      {comp?.letter && comp.letter !== '--'
                                        ? comp.letter : <Percent size={12} />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm text-zinc-200 truncate">{c.name}</p>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        {c.courseCode && (
                                          <p className="text-2xs text-zinc-600">{c.courseCode}</p>
                                        )}
                                        {c.isActive && <Badge variant="info">In progress</Badge>}
                                        {comp?.hasOverride && <Badge variant="accent">What-if edited</Badge>}
                                      </div>
                                    </div>
                                    <span className={cn(
                                      'text-sm font-semibold tabular-nums shrink-0',
                                      percent === null ? 'text-zinc-600' :
                                      percent >= 90 ? 'text-green-400' :
                                      percent >= 70 ? 'text-amber-400' : 'text-red-400'
                                    )}>
                                      {percent !== null ? `${Math.round(percent)}%` : 'No grades'}
                                    </span>
                                    <ChevronRight size={14} className="text-zinc-600 shrink-0" />
                                  </button>
                                )
                              })}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </>
        ) : selectedCourse ? (
          <CourseDetailView
            course={selectedCourse}
            data={courseDataMap[selectedCourse.id]}
            computed={computedByCourse.get(selectedCourse.id)}
            whatIf={whatIf}
            onBack={() => setView('overview')}
            onScoreChange={handleScoreInput}
            onResetAssignment={handleResetAssignment}
            onResetCourse={() => handleResetCourse(selectedCourse.id)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <p className="text-sm text-zinc-500">Course not found.</p>
            <Button variant="ghost" onClick={() => setView('overview')} icon={<ArrowLeft size={14} />}>
              Back to overview
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Course detail view (assignment-by-assignment what-if editor)
// ---------------------------------------------------------------------------

interface CourseDetailViewProps {
  course: Course
  data: CourseData | undefined
  computed: CourseComputed | undefined
  whatIf: Map<string, number>
  onBack: () => void
  onScoreChange: (assignmentId: string, raw: string) => void
  onResetAssignment: (assignmentId: string) => void
  onResetCourse: () => void
}

function CourseDetailView({
  course, data, computed, whatIf,
  onBack, onScoreChange, onResetAssignment, onResetCourse,
}: CourseDetailViewProps) {
  const assignments     = data?.assignments ?? []
  const groups          = data?.groups ?? []
  const percent         = computed?.percent ?? null
  const letter          = computed?.letter ?? '--'
  const officialDiffers = course.currentScore !== null &&
    (percent === null || Math.round(course.currentScore) !== Math.round(percent))

  const now    = Date.now()
  const sorted = [...assignments].sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity))

  // Group by assignment group when weighted
  const sections: { group: AssignmentGroup | null; items: AssignmentWithGrade[] }[] = []
  if (course.applyGroupWeights && groups.length > 0) {
    const byGroup  = new Map<string, AssignmentWithGrade[]>()
    const ungrouped: AssignmentWithGrade[] = []
    for (const a of sorted) {
      if (a.assignmentGroupId) {
        if (!byGroup.has(a.assignmentGroupId)) byGroup.set(a.assignmentGroupId, [])
        byGroup.get(a.assignmentGroupId)!.push(a)
      } else {
        ungrouped.push(a)
      }
    }
    for (const g of [...groups].sort((a, b) => a.position - b.position)) {
      sections.push({ group: g, items: byGroup.get(g.id) ?? [] })
    }
    if (ungrouped.length > 0) sections.push({ group: null, items: ungrouped })
  } else {
    sections.push({ group: null, items: sorted })
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <button onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
        <ArrowLeft size={12} /> Back to Grade & GPA Calculator
      </button>

      {/* Course header */}
      <div className="rounded-2xl bg-surface-800 border border-white/5 overflow-hidden">
        <div className="h-2" style={{ background: course.color ?? '#6366f1' }} />
        <div className="p-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-zinc-100 mb-1">{course.name}</h1>
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              {course.courseCode && <span>{course.courseCode}</span>}
              {course.term && <><span>·</span><span>{course.term}</span></>}
              {!course.isActive && <><span>·</span><Badge variant="default">Past</Badge></>}
              {course.applyGroupWeights && (
                <><span>·</span>
                  <span className="flex items-center gap-1">
                    <Percent size={11} /> Weighted grading
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className={cn('text-3xl font-bold tabular-nums leading-none',
              percent === null ? 'text-zinc-600' :
              percent >= 90 ? 'text-green-400' : percent >= 70 ? 'text-amber-400' : 'text-red-400')}>
              {percent !== null ? `${Math.round(percent)}%` : '--'}
            </p>
            <p className="text-sm text-zinc-400 mt-0.5">{letter}</p>
            {officialDiffers && (
              <p className="text-2xs text-zinc-600 mt-1">
                LMS reports {Math.round(course.currentScore!)}% · {course.currentGrade ?? '--'}
              </p>
            )}
          </div>
        </div>
        <div className="px-6 pb-4 flex items-center justify-between">
          <p className="text-xs text-zinc-600">
            {computed ? `${computed.earned.toFixed(1)} / ${computed.possible.toFixed(1)} pts` : '--'}
          </p>
          {computed?.hasOverride && (
            <Button variant="ghost" size="sm" icon={<RotateCcw size={12} />} onClick={onResetCourse}>
              Reset this course's what-if edits
            </Button>
          )}
        </div>
      </div>

      {/* Assignment sections */}
      {assignments.length === 0 ? (
        <EmptyState icon={<Calculator size={20} />} title="No assignments yet"
          description="This course has no synced assignments." />
      ) : (
        sections.map((section, sIdx) => (
          <section key={section.group?.id ?? `ungrouped-${sIdx}`}>
            {section.group && (
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-zinc-300">{section.group.name}</h2>
                <span className="text-xs text-zinc-600">{section.group.groupWeight}% of grade</span>
              </div>
            )}
            {!section.group && course.applyGroupWeights && sections.length > 1 && (
              <h2 className="text-sm font-semibold text-zinc-500 mb-2">Uncategorized</h2>
            )}
            <div className="rounded-xl bg-surface-800 border border-white/5 overflow-hidden">
              {section.items.length === 0 ? (
                <p className="text-xs text-zinc-600 px-5 py-3">No assignments in this category.</p>
              ) : (
                section.items.map((a, i) => {
                  const isFuture      = a.dueAt !== null && a.dueAt > now
                  const isOverridden  = whatIf.has(a.id)
                  const effectiveScore = getEffectiveScore(a, whatIf)
                  const realGraded    = a.grade?.workflowState === 'graded' &&
                    a.grade.score !== null && !a.grade.isExcused
                  const displayValue  = isOverridden
                    ? String(whatIf.get(a.id))
                    : realGraded ? String(a.grade!.score) : ''
                  const rowPercent    = a.pointsPossible && effectiveScore !== null
                    ? Math.round((effectiveScore / a.pointsPossible) * 100) : null

                  return (
                    <div key={a.id}
                      className={cn('flex items-center gap-3 px-5 py-3',
                        i < section.items.length - 1 && 'border-b border-white/3')}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-zinc-200 truncate">{a.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-2xs text-zinc-600 flex items-center gap-1">
                            <Clock size={10} />{formatDueDate(a.dueAt)}
                          </p>
                          {isFuture && <Badge variant="info">Upcoming</Badge>}
                          {a.grade?.isExcused && <Badge variant="default">Excused</Badge>}
                          {a.grade?.isMissing && !isFuture && <Badge variant="danger">Missing</Badge>}
                          {isOverridden && <Badge variant="accent">What-if</Badge>}
                        </div>
                      </div>

                      {rowPercent !== null && (
                        <span className={cn('text-xs font-medium tabular-nums w-10 text-right shrink-0',
                          rowPercent >= 90 ? 'text-green-400' :
                          rowPercent >= 70 ? 'text-amber-400' : 'text-red-400')}>
                          {rowPercent}%
                        </span>
                      )}

                      <div className="flex items-center gap-1.5 shrink-0">
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          disabled={!a.pointsPossible}
                          value={displayValue}
                          placeholder={a.pointsPossible ? '--' : 'N/A'}
                          onChange={e => onScoreChange(a.id, e.target.value)}
                          className="w-16 h-7 px-2 rounded-md bg-surface-700 border border-white/10 text-xs
                                     text-zinc-200 text-right tabular-nums focus:outline-none
                                     focus:ring-1 focus:ring-accent-500 disabled:opacity-40 disabled:cursor-not-allowed"
                        />
                        <span className="text-2xs text-zinc-600 w-14">/{a.pointsPossible ?? '--'} pts</span>
                        {isOverridden && (
                          <button onClick={() => onResetAssignment(a.id)} title="Reset to real grade"
                            className="text-zinc-600 hover:text-zinc-300 transition-colors p-1">
                            <RotateCcw size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </section>
        ))
      )}
    </motion.div>
  )
}
