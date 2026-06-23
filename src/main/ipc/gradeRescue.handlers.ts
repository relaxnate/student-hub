import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import {
  CourseRepository,
  AssignmentRepository,
  GradeRepository,
  AssignmentGroupRepository,
} from '../database/repositories'
import type { Course, Assignment, Grade, AssignmentGroup } from '@shared/types/entities'
import type { GradeRescueReport, RescueAction, RescueRiskLevel } from '@shared/types/ipc'

const courseRepo = new CourseRepository()
const assignRepo  = new AssignmentRepository()
const gradeRepo   = new GradeRepository()
const groupRepo   = new AssignmentGroupRepository()

export function registerGradeRescueHandlers(): void {
  ipcMain.handle(IPC.GRADE_RESCUE.GET_ALL, () => {
    try {
      const courses = courseRepo.getActive()
      const reports = courses.map(c => computeRescue(c))
      return { ok: true, data: reports }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
}

// ─── Core computation ─────────────────────────────────────────────────────────

function computeRescue(course: Course): GradeRescueReport {
  const now = Date.now()

  const allAssignments = assignRepo.getByCourse(course.id)
  const allGrades      = gradeRepo.getByCourse(course.id)
  const groups         = groupRepo.getByCourse(course.id)

  const gradeMap = new Map<string, Grade>(allGrades.map(g => [g.assignmentId, g]))
  const groupMap = new Map<string, AssignmentGroup>(groups.map(g => [g.id, g]))

  const noData = (reason: string): GradeRescueReport => ({
    courseId: course.id, courseName: course.name,
    riskLevel: 'insufficient_data',
    currentGrade: null, projectedPessimistic: null, projectedOptimistic: null,
    minScoreToPass: null, minScoreForC: null, minScoreForB: null,
    topActions: [], totalUnsubmitted: 0, totalMissing: 0,
    insufficientDataReason: reason,
  })

  // Only consider published assignments with a real point value
  const scorable = allAssignments.filter(
    a => a.isPublished && a.gradingType !== 'not_graded' && (a.pointsPossible ?? 0) > 0
  )
  if (scorable.length === 0) return noData('No gradable assignments found for this course')

  // Split into graded vs unsubmitted (skip excused)
  const graded:       Assignment[] = []
  const unsubmitted:  Assignment[] = []

  for (const a of scorable) {
    const g = gradeMap.get(a.id)
    if (g?.workflowState === 'excused') continue
    if (g?.workflowState === 'graded' && g.score != null) graded.push(a)
    else                                                    unsubmitted.push(a)
  }

  if (graded.length === 0) {
    return noData('No assignments have been graded yet — check back once your first grade appears')
  }

  const useWeighted = course.applyGroupWeights && groups.length > 0

  // ── Current grade ──────────────────────────────────────────────────────────
  const currentGrade = useWeighted
    ? calcWeighted(scorable, gradeMap, groupMap, groups, 'current')
    : flatGrade(graded, gradeMap)

  if (currentGrade === null) return noData('Could not compute a current grade percentage')

  // ── Projections ────────────────────────────────────────────────────────────
  const pessimistic = useWeighted
    ? (calcWeighted(scorable, gradeMap, groupMap, groups, 'pessimistic') ?? currentGrade)
    : flatProjection(graded, unsubmitted, gradeMap, 'pessimistic')

  const optimistic = useWeighted
    ? (calcWeighted(scorable, gradeMap, groupMap, groups, 'optimistic') ?? currentGrade)
    : flatProjection(graded, unsubmitted, gradeMap, 'optimistic')

  // ── Minimum scores for grade targets (flat approximation) ─────────────────
  // Even for weighted courses this gives a useful "what do I need on average"
  const totalEarned    = graded.reduce((s, a) => s + (gradeMap.get(a.id)?.score ?? 0), 0)
  const gradedPossible = graded.reduce((s, a) => s + (a.pointsPossible ?? 0), 0)
  const unsubPossible  = unsubmitted.reduce((s, a) => s + (a.pointsPossible ?? 0), 0)
  const totalPossible  = gradedPossible + unsubPossible

  const minScoreFor = (target: number): number | null => {
    if (unsubPossible <= 0) return null
    const needed = (target / 100) * totalPossible - totalEarned
    const pct    = (needed / unsubPossible) * 100
    // > 100 means impossible; we cap at 101 so the UI can distinguish "impossible"
    return Math.max(0, Math.min(101, Math.round(pct * 10) / 10))
  }

  // ── Impact scores & ranked actions ────────────────────────────────────────
  const totalCoursePossible = scorable.reduce((s, a) => s + (a.pointsPossible ?? 0), 0)

  // Pre-compute total possible points per group (for weighted impact math)
  const groupTotals = new Map<string, number>()
  if (useWeighted) {
    for (const a of scorable) {
      if (a.assignmentGroupId) {
        groupTotals.set(
          a.assignmentGroupId,
          (groupTotals.get(a.assignmentGroupId) ?? 0) + (a.pointsPossible ?? 0)
        )
      }
    }
  }

  const actions: RescueAction[] = unsubmitted.map(a => {
    const group = a.assignmentGroupId ? groupMap.get(a.assignmentGroupId) : undefined
    const pts   = a.pointsPossible ?? 0

    // base contribution = fraction of the final grade this assignment is worth at 100%
    let baseContribution: number
    if (useWeighted && group && group.groupWeight > 0) {
      const gt = groupTotals.get(group.id) ?? 0
      baseContribution = gt > 0 ? (group.groupWeight / 100) * (pts / gt) : 0
    } else {
      baseContribution = totalCoursePossible > 0 ? pts / totalCoursePossible : 0
    }

    const isOverdue = a.dueAt != null && a.dueAt < now
    const isSoon    = !isOverdue && a.dueAt != null && (a.dueAt - now) < 48 * 60 * 60 * 1000
    const urgency   = isOverdue ? 'overdue' as const : isSoon ? 'soon' as const : 'upcoming' as const
    const urgencyFactor = isOverdue ? 1.5 : isSoon ? 1.3 : 1.0

    return {
      assignmentId:   a.id,
      assignmentName: a.title,
      category:       group?.name ?? 'General',
      pointsPossible: pts,
      gradeImpact:    Math.round(baseContribution * 1000) / 10,  // 1 decimal, in %
      urgency,
      impactScore:    baseContribution * urgencyFactor * 100,
    }
  })

  actions.sort((a, b) => b.impactScore - a.impactScore)

  // ── Risk level ─────────────────────────────────────────────────────────────
  let riskLevel: RescueRiskLevel
  if      (currentGrade >= 80 && pessimistic >= 70) riskLevel = 'safe'
  else if (currentGrade < 60  || pessimistic < 40)  riskLevel = 'critical'
  else                                               riskLevel = 'warning'

  const missing = unsubmitted.filter(a => a.dueAt != null && a.dueAt < now)

  return {
    courseId:              course.id,
    courseName:            course.name,
    riskLevel,
    currentGrade:          round1(currentGrade),
    projectedPessimistic:  round1(pessimistic),
    projectedOptimistic:   round1(optimistic),
    minScoreToPass:        minScoreFor(60),
    minScoreForC:          minScoreFor(70),
    minScoreForB:          minScoreFor(80),
    topActions:            actions.slice(0, 3),
    totalUnsubmitted:      unsubmitted.length,
    totalMissing:          missing.length,
    insufficientDataReason: null,
  }
}

// ─── Grade math helpers ───────────────────────────────────────────────────────

function flatGrade(
  graded: Assignment[],
  gradeMap: Map<string, Grade>
): number | null {
  const earned   = graded.reduce((s, a) => s + (gradeMap.get(a.id)?.score ?? 0), 0)
  const possible = graded.reduce((s, a) => s + (a.pointsPossible ?? 0), 0)
  return possible > 0 ? (earned / possible) * 100 : null
}

function flatProjection(
  graded: Assignment[],
  unsubmitted: Assignment[],
  gradeMap: Map<string, Grade>,
  mode: 'pessimistic' | 'optimistic'
): number {
  const earned         = graded.reduce((s, a) => s + (gradeMap.get(a.id)?.score ?? 0), 0)
  const gradedPossible = graded.reduce((s, a) => s + (a.pointsPossible ?? 0), 0)
  const unsubPossible  = unsubmitted.reduce((s, a) => s + (a.pointsPossible ?? 0), 0)
  const totalPossible  = gradedPossible + unsubPossible
  if (totalPossible === 0) return 0
  const totalEarned = mode === 'optimistic' ? earned + unsubPossible : earned
  return (totalEarned / totalPossible) * 100
}

// Weighted average across assignment groups.
// mode='current'     → only graded assignments count; groups with no grades are excluded
// mode='pessimistic' → all assignments count; unsubmitted score 0
// mode='optimistic'  → all assignments count; unsubmitted score 100%
function calcWeighted(
  scorable:  Assignment[],
  gradeMap:  Map<string, Grade>,
  groupMap:  Map<string, AssignmentGroup>,
  groups:    AssignmentGroup[],
  mode:      'current' | 'pessimistic' | 'optimistic'
): number | null {
  let weightedSum = 0
  let totalWeight = 0

  for (const group of groups) {
    const groupAs = scorable.filter(a => a.assignmentGroupId === group.id)
    if (groupAs.length === 0) continue

    let earned  = 0
    let possible = 0
    let hasData  = false

    for (const a of groupAs) {
      const grade    = gradeMap.get(a.id)
      const pts      = a.pointsPossible ?? 0
      const isGraded = grade?.workflowState === 'graded' && grade.score != null

      if (mode === 'current') {
        if (isGraded) { earned += grade!.score!; possible += pts; hasData = true }
      } else {
        possible += pts; hasData = true
        if      (isGraded)             earned += grade!.score!
        else if (mode === 'optimistic') earned += pts
        // pessimistic: unsubmitted earns 0
      }
    }

    if (hasData && possible > 0) {
      weightedSum += group.groupWeight * (earned / possible)
      totalWeight += group.groupWeight
    }
  }

  return totalWeight > 0 ? (weightedSum / totalWeight) * 100 : null
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
