// Canonical GPA conversion — single source of truth for the renderer.
//
// Background (BUG-010): the dashboards used to estimate GPA with a wrong LINEAR
// formula `(percent / 100) * 4.0`, which mis-scales every grade that isn't an
// exact tier boundary (e.g. 85% → 3.4 instead of 3.0, 90% → 3.6 instead of 3.7).
// The CORRECT conversion uses the standard letter-grade breakpoint table and was
// already implemented (independently) in `Grades/GpaCalculator.tsx` and
// `Simulator/simMath.ts`. This module centralizes that logic so the dashboard,
// calculator, simulator and history can all share ONE implementation and never
// drift apart again.
//
// Scale: standard unweighted US 4.0 scale.
// Overall GPA: a SIMPLE (equal-weight) average of per-course grade points. The
// Canvas REST API does not expose credit hours, so credit-hour weighting is not
// possible from synced data — equal weighting is the documented, intentional
// assumption (see Decisions Log). `course.currentScore` is Canvas's own
// `computed_current_score`, which already accounts for assignment-group weighting
// and drops, so each per-course percentage is authoritative before conversion.

export const GPA_SCALE: { min: number; points: number; label: string }[] = [
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

/** Convert a course percentage (0–100) to a 4.0 grade-point value. null → null. */
export function percentToGPA(percent: number | null): number | null {
  if (percent === null) return null
  const tier = GPA_SCALE.find(t => percent >= t.min)
  return tier ? tier.points : 0.0
}

/** The letter label for a percentage (e.g. 88 → "B+"). null → "—". */
export function percentToLetterGrade(percent: number | null): string {
  if (percent === null) return '—'
  const tier = GPA_SCALE.find(t => percent >= t.min)
  return tier ? tier.label : 'F'
}

/**
 * Overall GPA across a set of course percentages. Percentages are rounded to the
 * nearest whole number before tier lookup (matching GpaCalculator/simMath), null
 * percentages are skipped, and the result is the equal-weight average rounded to
 * 2 decimal places. Returns null when no course has a usable percentage.
 */
export function computeOverallGpa(percents: (number | null)[]): number | null {
  const pts = percents
    .map(p => percentToGPA(p === null ? null : Math.round(p)))
    .filter((g): g is number => g !== null)
  if (!pts.length) return null
  return Math.round((pts.reduce((s, g) => s + g, 0) / pts.length) * 100) / 100
}

/**
 * The single authoritative rule for a course's effective percentage (BUG-012).
 *
 * The LMS-reported `currentScore` (Canvas `computed_current_score`) is the source
 * of truth: it already applies assignment-group weighting, dropped-lowest rules
 * and late/excused policies that the app cannot always replicate from the synced
 * assignment rows. So every surface (Dashboard, Grades, the GPA Calculator) shows
 * that number by default, and they stay consistent.
 *
 * We only fall back to a locally `recomputed` percentage when:
 *   - the student is running a what-if scenario (`hasOverride`) — the whole point
 *     is to recompute with hypothetical scores; or
 *   - the LMS never reported a score (`currentScore === null`) but enough
 *     assignments are graded locally to estimate one.
 *
 * Returns null when neither source has a usable value.
 */
export function effectiveCoursePercent(
  currentScore: number | null,
  recomputed: number | null,
  hasOverride = false,
): number | null {
  if (hasOverride) return recomputed
  if (currentScore !== null) return currentScore
  return recomputed
}

/**
 * Cumulative GPA over a set of courses, using each course's LMS-official
 * `currentScore`. Pass EVERY synced course (current + history) — GPA is a
 * cumulative metric and must not depend on which subset a page is displaying
 * (BUG-011). Courses without a reported score are skipped.
 */
export function computeCumulativeGpa(
  courses: { currentScore: number | null }[],
): number | null {
  return computeOverallGpa(courses.map(c => c.currentScore))
}
