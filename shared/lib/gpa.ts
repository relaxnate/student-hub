// Canonical GPA conversion — single source of truth shared by the renderer
// (Dashboard/Grades/GPA Calculator/Simulator via src/renderer/src/lib/gpa.ts,
// which re-exports this) AND the main process (AI Helper tools). Moved to
// @shared in Session 014 so the AI's get_gpa_summary / calculate_needed_score
// tools call the EXACT same math the UI shows — no drift (BUG-010/011/012).
//
// Scale: standard unweighted US 4.0 scale. Overall GPA: equal-weight average of
// per-course grade points (Canvas exposes no credit hours). `currentScore` is
// Canvas computed_current_score (already group-weighted + drops applied).

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
 * nearest whole number before tier lookup, null percentages are skipped, and the
 * result is the equal-weight average rounded to 2 decimals. null when none usable.
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
 * LMS `currentScore` is the source of truth (already applies weighting/drops);
 * we only fall back to a locally `recomputed` percentage under a what-if override
 * or when the LMS reported no score.
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
 * Cumulative GPA over a set of courses using each course's LMS-official
 * `currentScore`. Pass EVERY synced course (current + history) — GPA is
 * cumulative (BUG-011). Courses without a reported score are skipped.
 */
export function computeCumulativeGpa(
  courses: { currentScore: number | null }[],
): number | null {
  return computeOverallGpa(courses.map(c => c.currentScore))
}
