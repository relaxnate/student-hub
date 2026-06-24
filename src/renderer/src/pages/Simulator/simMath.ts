// ─── Academic Outcome Simulator — calculation engine ───────────────────────────
// Pure, framework-free math. Deliberately replicates GpaCalculator.tsx's
// `computeCourse` / `percentToGPA` / overall-GPA logic EXACTLY so every number the
// Simulator shows matches the existing Grade & GPA Calculator (and therefore
// Canvas's own weighted math). No React here — unit-tested in isolation.

import type { Course, Assignment, Grade, AssignmentGroup } from '@shared/types/entities'

export type AssignmentWithGrade = Assignment & { grade?: Grade }

export interface CourseBundle {
  course:      Course
  assignments: AssignmentWithGrade[]
  groups:      AssignmentGroup[]
}

// ─── GPA scale (standard unweighted 4.0) — identical to GpaCalculator ──────────

export const GPA_SCALE: { min: number; points: number }[] = [
  { min: 97, points: 4.0 },
  { min: 93, points: 4.0 },
  { min: 90, points: 3.7 },
  { min: 87, points: 3.3 },
  { min: 83, points: 3.0 },
  { min: 80, points: 2.7 },
  { min: 77, points: 2.3 },
  { min: 73, points: 2.0 },
  { min: 70, points: 1.7 },
  { min: 67, points: 1.3 },
  { min: 63, points: 1.0 },
  { min: 60, points: 0.7 },
  { min: 0,  points: 0.0 },
]

export function percentToGPA(percent: number | null): number | null {
  if (percent === null) return null
  const tier = GPA_SCALE.find(t => percent >= t.min)
  return tier ? tier.points : 0.0
}

// ─── Effective score (override > real grade > skip) ────────────────────────────

function effectiveScore(a: AssignmentWithGrade, overrides: Map<string, number>): number | null {
  if (overrides.has(a.id)) return overrides.get(a.id)!
  if (a.grade && a.grade.workflowState === 'graded' && a.grade.score !== null && !a.grade.isExcused) {
    return a.grade.score
  }
  return null
}

// ─── Course percentage ─────────────────────────────────────────────────────────
// Mirrors GpaCalculator.computeCourse: when no usable graded/overridden
// assignments exist, falls back to the LMS-reported course.currentScore.

export interface CoursePercentResult {
  percent: number | null
  fromLms: boolean   // true when the result came from course.currentScore fallback
  weighted: boolean
}

export function computeCoursePercent(
  course: Course,
  assignments: AssignmentWithGrade[],
  groups: AssignmentGroup[],
  overrides: Map<string, number> = new Map(),
): CoursePercentResult {
  const usable = assignments
    .map(a => ({ a, score: effectiveScore(a, overrides) }))
    .filter((x): x is { a: AssignmentWithGrade; score: number } =>
      x.score !== null && x.a.pointsPossible !== null && x.a.pointsPossible! > 0)

  if (usable.length === 0) {
    return {
      percent:  course.currentScore !== null ? course.currentScore : null,
      fromLms:  true,
      weighted: false,
    }
  }

  const earned   = usable.reduce((s, x) => s + x.score, 0)
  const possible = usable.reduce((s, x) => s + x.a.pointsPossible!, 0)

  if (course.applyGroupWeights && groups.length > 0) {
    const byGroup = new Map<string, { earned: number; possible: number }>()
    for (const { a, score } of usable) {
      if (!a.assignmentGroupId) continue
      const g = byGroup.get(a.assignmentGroupId) ?? { earned: 0, possible: 0 }
      g.earned   += score
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
    return { percent, fromLms: false, weighted: true }
  }

  const percent = possible > 0 ? (earned / possible) * 100 : null
  return { percent, fromLms: false, weighted: false }
}

// ─── Overall GPA ────────────────────────────────────────────────────────────────
// Simple (non-credit-weighted) average of per-course GPAs, rounded to 2 dp —
// identical to GpaCalculator's overallGPA.

export function computeOverallGpa(percents: (number | null)[]): number | null {
  const pts = percents
    .map(p => percentToGPA(p === null ? null : Math.round(p)))
    .filter((g): g is number => g !== null)
  if (!pts.length) return null
  return Math.round((pts.reduce((s, g) => s + g, 0) / pts.length) * 100) / 100
}

// Convenience: GPA across a set of bundles given an optional per-course override map.
export function gpaForBundles(
  bundles: CourseBundle[],
  overridesByCourse: Map<string, Map<string, number>> = new Map(),
): number | null {
  return computeOverallGpa(
    bundles.map(b =>
      computeCoursePercent(b.course, b.assignments, b.groups, overridesByCourse.get(b.course.id) ?? new Map()).percent
    )
  )
}

// ─── Ripple Effect ──────────────────────────────────────────────────────────────
// What happens to course grade → semester GPA → cumulative GPA if a single
// assignment scores `simulatedScore`.

export type RippleStatus = 'on-track' | 'warning' | 'at-risk'

export interface RippleResult {
  courseId:            string
  courseName:          string
  pointsPossible:      number | null
  simulatedScore:      number
  courseBefore:        number | null
  courseAfter:         number | null
  courseDelta:         number | null
  semesterGpaBefore:   number | null
  semesterGpaAfter:    number | null
  semesterGpaDelta:    number | null
  cumulativeGpaBefore: number | null
  cumulativeGpaAfter:  number | null
  cumulativeGpaDelta:  number | null
  status:              RippleStatus
  lowConfidence:       boolean   // true when the course grade is LMS-derived (no synced graded items)
}

function rippleStatus(gpa: number | null): RippleStatus {
  if (gpa === null) return 'on-track'
  if (gpa >= 3.0) return 'on-track'
  if (gpa >= 2.0) return 'warning'
  return 'at-risk'
}

export function computeRipple(
  bundles: CourseBundle[],
  targetAssignmentId: string,
  simulatedScore: number,
): RippleResult | null {
  const target = bundles.find(b => b.assignments.some(a => a.id === targetAssignmentId))
  if (!target) return null
  const targetAssignment = target.assignments.find(a => a.id === targetAssignmentId)!

  // Baseline course percents computed once and reused.
  const baseline = new Map<string, number | null>()
  for (const b of bundles) {
    baseline.set(b.course.id, computeCoursePercent(b.course, b.assignments, b.groups).percent)
  }

  const before = computeCoursePercent(target.course, target.assignments, target.groups)
  const after  = computeCoursePercent(
    target.course, target.assignments, target.groups,
    new Map([[targetAssignmentId, simulatedScore]]),
  )

  const activeBundles = bundles.filter(b => b.course.isActive)

  const withTarget = (set: CourseBundle[], newPercent: number | null) =>
    set.map(b => (b.course.id === target.course.id ? newPercent : baseline.get(b.course.id) ?? null))

  const semesterGpaBefore   = computeOverallGpa(activeBundles.map(b => baseline.get(b.course.id) ?? null))
  const semesterGpaAfter    = computeOverallGpa(withTarget(activeBundles, after.percent))
  const cumulativeGpaBefore = computeOverallGpa(bundles.map(b => baseline.get(b.course.id) ?? null))
  const cumulativeGpaAfter  = computeOverallGpa(withTarget(bundles, after.percent))

  const sub = (a: number | null, b: number | null): number | null =>
    a === null || b === null ? null : Math.round((a - b) * 100) / 100

  // The semester GPA drives the status (the student's current-term standing).
  const statusBasis = target.course.isActive ? semesterGpaAfter : cumulativeGpaAfter

  return {
    courseId:            target.course.id,
    courseName:          target.course.name,
    pointsPossible:      targetAssignment.pointsPossible,
    simulatedScore,
    courseBefore:        before.percent,
    courseAfter:         after.percent,
    courseDelta:         before.percent === null || after.percent === null
                           ? null
                           : Math.round((after.percent - before.percent) * 10) / 10,
    semesterGpaBefore,
    semesterGpaAfter,
    semesterGpaDelta:    sub(semesterGpaAfter, semesterGpaBefore),
    cumulativeGpaBefore,
    cumulativeGpaAfter,
    cumulativeGpaDelta:  sub(cumulativeGpaAfter, cumulativeGpaBefore),
    status:              rippleStatus(statusBasis),
    lowConfidence:       before.fromLms,
  }
}

// ─── "Fastest way to raise my GPA" ──────────────────────────────────────────────
// Ranks missing (ungraded) and low-scoring assignments by the semester-GPA gain
// from completing them (→100%) or improving them (→90%).

export type ActionKind = 'missing' | 'improve'

export interface GpaAction {
  assignmentId:   string
  assignmentTitle: string
  courseName:     string
  kind:           ActionKind
  currentScore:   number | null
  pointsPossible: number
  targetScore:    number
  gpaGain:        number   // semester-GPA points gained, rounded to 2 dp
}

const IMPROVE_THRESHOLD_PCT = 80   // graded below this counts as "low-scoring"
const IMPROVE_TARGET_FRAC   = 0.90 // improve a low score to 90%

export function fastestGpaActions(bundles: CourseBundle[], limit = 8): GpaAction[] {
  const activeBundles = bundles.filter(b => b.course.isActive)
  const baseline = new Map<string, number | null>()
  for (const b of activeBundles) {
    baseline.set(b.course.id, computeCoursePercent(b.course, b.assignments, b.groups).percent)
  }
  const baseSem = computeOverallGpa([...baseline.values()])
  const actions: GpaAction[] = []

  for (const b of activeBundles) {
    for (const a of b.assignments) {
      if (a.pointsPossible === null || a.pointsPossible <= 0) continue
      const g = a.grade
      if (g?.isExcused) continue

      const graded = !!g && g.workflowState === 'graded' && g.score !== null
      const pct = graded ? (g!.score! / a.pointsPossible) * 100 : null

      let kind: ActionKind | null = null
      let target = 0
      if (!graded) {
        // Ungraded / not yet submitted → opportunity to complete it for full marks.
        kind = 'missing'
        target = a.pointsPossible
      } else if (pct !== null && pct < IMPROVE_THRESHOLD_PCT) {
        const t = IMPROVE_TARGET_FRAC * a.pointsPossible
        if (t <= g!.score!) continue   // already at/above the improve target
        kind = 'improve'
        target = t
      }
      if (!kind) continue

      const newCoursePct = computeCoursePercent(
        b.course, b.assignments, b.groups, new Map([[a.id, target]]),
      ).percent
      const newSem = computeOverallGpa(
        activeBundles.map(x => (x.course.id === b.course.id ? newCoursePct : baseline.get(x.course.id) ?? null)),
      )
      const gain = Math.round(((newSem ?? 0) - (baseSem ?? 0)) * 100) / 100
      if (gain <= 0) continue

      actions.push({
        assignmentId:   a.id,
        assignmentTitle: a.title,
        courseName:     b.course.name,
        kind,
        currentScore:   graded ? g!.score! : null,
        pointsPossible: a.pointsPossible,
        targetScore:    Math.round(target * 100) / 100,
        gpaGain:        gain,
      })
    }
  }

  return actions.sort((x, y) => y.gpaGain - x.gpaGain).slice(0, limit)
}
