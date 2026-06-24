// ─── Ask engine ─────────────────────────────────────────────────────────────
// A fully-offline, deterministic natural-language parser for the Simulator's
// "Ask" tab. No external API (the app is offline-first) — it recognises a small
// set of intents, resolves the assignment a student names from the real graph of
// their synced work, then runs the SAME math engine (computeRipple /
// fastestGpaActions) the rest of the Simulator uses.
//
// Honest scope note: Canvas does not expose prerequisite edges between items
// (e.g. "Assignment 7 feeds Quiz 4"), so we never invent those. The real,
// data-backed relationship chain we compute is:
//   Assignment → its weighted Assignment Group → Course grade → Semester GPA → Cumulative GPA
// which is exactly what drives every answer below.

import { percentToLetter } from '../../lib/utils'
import {
  computeRipple, fastestGpaActions, computeCoursePercent, computeOverallGpa,
  type CourseBundle, type RippleResult, type GpaAction, type AssignmentWithGrade,
} from './simMath'

export type AskAnswerKind = 'ripple' | 'fastest' | 'current-gpa' | 'unknown'

export interface AskAnswer {
  kind:        AskAnswerKind
  headline:    string
  recommendation?: string   // one concrete next action, shown as a highlighted line
  // ripple
  ripple?:        RippleResult
  groupContext?:  string
  // fastest
  actions?:       GpaAction[]
  // current-gpa
  semesterGpa?:   number | null
  cumulativeGpa?: number | null
  // unknown / fallbacks
  suggestions?:   string[]
}

const SUGGESTIONS = [
  'What happens if I skip <assignment>?',
  'What if I get 90% on <assignment>?',
  "What's the fastest way to raise my GPA?",
  'What is my current GPA?',
]

// ── Score-intent extraction ────────────────────────────────────────────────────
type ScoreIntent =
  | { kind: 'zero'; text: string }
  | { kind: 'max';  text: string }
  | { kind: 'pct';   value: number; text: string }
  | { kind: 'raw';   value: number; text: string }   // explicit points or "n out of m"
  | { kind: 'num';   value: number; text: string }    // bare number — resolve vs points later
  | null

function extractScoreIntent(q: string): ScoreIntent {
  let m: RegExpMatchArray | null

  // "85/100" or "85 out of 100"
  m = q.match(/(\d+(?:\.\d+)?)\s*(?:\/|out of)\s*(\d+(?:\.\d+)?)/)
  if (m) return { kind: 'raw', value: parseFloat(m[1]), text: m[0] }

  // "90%" / "get 90 percent"
  m = q.match(/(\d{1,3}(?:\.\d+)?)\s*(?:%|percent)/)
  if (m) return { kind: 'pct', value: parseFloat(m[1]), text: m[0] }

  // "get/score/make/earn 80 (points)"
  m = q.match(/\b(?:get|got|score|scored|make|made|earn|earned)\s+(\d+(?:\.\d+)?)\s*(?:points|pts|marks)?\b/)
  if (m) return { kind: 'num', value: parseFloat(m[1]), text: m[0] }

  if ((m = q.match(/\b(ace|aced|perfect|full marks?|maximum|max out|nail(?:ed)?)\b/))) return { kind: 'max', text: m[0] }
  if ((m = q.match(/\b(skip|skipped|skipping|miss(?:ing|ed)?|fail(?:ed|ing)?|do(?:es)?n'?t submit|do not submit|not submit|drop(?:ped|ping)?|bomb(?:ed)?|zero|don'?t do|do nothing)\b/))) {
    return { kind: 'zero', text: m[0] }
  }
  return null
}

function intentVerb(si: ScoreIntent): 'skip' | 'ace' | 'score' {
  if (!si) return 'skip'
  if (si.kind === 'zero') return 'skip'
  if (si.kind === 'max') return 'ace'
  return 'score'
}

// Resolve the score intent to an actual point value for a given assignment.
function resolveScore(si: ScoreIntent, pts: number): number {
  if (!si) return 0
  const clamp = (n: number) => Math.max(0, Math.min(pts, n))
  switch (si.kind) {
    case 'zero': return 0
    case 'max':  return pts
    case 'pct':  return clamp((si.value / 100) * pts)
    case 'raw':  return clamp(si.value)
    case 'num':  return clamp(si.value <= pts ? si.value : (si.value <= 100 ? (si.value / 100) * pts : pts))
  }
}

// ── Assignment resolution ──────────────────────────────────────────────────────
const STOP = new Set([
  'the','a','an','of','to','for','and','or','my','on','in','is','it','i','if','im',
  'what','happens','happen','will','would','do','does','dont','this','that','about',
  'get','got','score','make','earn','points','pts','marks','skip','fail','miss','submit',
  'drop','ace','raise','improve','boost','grade','gpa','assignment','quiz','exam','test','if',
])

function tokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length >= 2 && !STOP.has(t))
}
function numbers(s: string): string[] {
  return (s.toLowerCase().match(/\d+/g) ?? [])
}

interface Match { bundle: CourseBundle; assignment: AssignmentWithGrade; score: number }

function matchAssignment(qForMatch: string, bundles: CourseBundle[]): Match | null {
  const qLower = qForMatch.toLowerCase()
  const qToks  = new Set(tokens(qForMatch))
  const qNums  = new Set(numbers(qForMatch))
  let best: Match | null = null

  for (const bundle of bundles) {
    for (const a of bundle.assignments) {
      if (a.pointsPossible === null || a.pointsPossible <= 0) continue
      const titleLower = a.title.toLowerCase()
      let score = 0
      // Whole-title substring is the strongest signal.
      if (titleLower.length >= 3 && qLower.includes(titleLower)) score += 10 + titleLower.length
      // Distinctive token overlap.
      for (const t of tokens(a.title)) if (qToks.has(t)) score += 2
      // Number overlap (e.g. "Assignment 7" ↔ "...7").
      for (const n of numbers(a.title)) if (qNums.has(n)) score += 3

      if (score >= 2 && (!best || score > best.score ||
        (score === best.score && a.title.length > best.assignment.title.length))) {
        best = { bundle, assignment: a, score }
      }
    }
  }
  return best
}

// ── Phrasing ────────────────────────────────────────────────────────────────────
function pct(n: number | null): string { return n === null ? '—' : `${Math.round(n)}%` }
function gpa(n: number | null): string { return n === null ? '—' : n.toFixed(2) }

function rippleHeadline(r: RippleResult, verb: 'skip' | 'ace' | 'score'): string {
  const lb = percentToLetter(r.courseBefore === null ? null : Math.round(r.courseBefore))
  const la = percentToLetter(r.courseAfter === null ? null : Math.round(r.courseAfter))
  const scoreText = `${Math.round(r.simulatedScore)}/${r.pointsPossible ?? '—'}`
  // "this assignment" is a placeholder the caller swaps for the real title.
  const lead =
    verb === 'skip'  ? `If you skip this assignment (${scoreText})`
    : verb === 'ace' ? `If you ace this assignment (${scoreText})`
    : `If you score ${scoreText} on this assignment`

  const courseMove = r.courseBefore === null || r.courseAfter === null
    ? `${r.courseName}'s grade can't be recomputed from synced data`
    : `${r.courseName} goes ${pct(r.courseBefore)} → ${pct(r.courseAfter)} (${lb} → ${la})`

  const gpaMove = r.semesterGpaBefore === null
    ? ''
    : `, and your semester GPA goes ${gpa(r.semesterGpaBefore)} → ${gpa(r.semesterGpaAfter)} (${(r.semesterGpaDelta ?? 0) >= 0 ? '+' : ''}${r.semesterGpaDelta ?? 0})`

  const statusText = r.status === 'on-track' ? "You're still on track."
    : r.status === 'warning' ? 'Heads up — that pushes your GPA below 3.0.'
    : 'Warning — that drops your GPA below 2.0.'

  return `${lead}, ${courseMove}${gpaMove}. ${statusText}`
}

// A concrete next-action line tailored to the simulated outcome.
function rippleRecommendation(r: RippleResult, verb: 'skip' | 'ace' | 'score'): string {
  const cd = r.courseDelta ?? 0
  const gd = r.semesterGpaDelta
  if (verb === 'skip') {
    return cd <= -1
      ? `Don't skip it — submit whatever you have. A zero here costs about ${Math.abs(cd)}% on the course${gd ? ` and ${Math.abs(gd)} GPA points` : ''}.`
      : `Low impact, but turning it in still keeps your record clean.`
  }
  if (verb === 'ace') {
    return cd >= 1
      ? `High leverage — acing this adds ~${cd}% to the course. Block focused time for it before the due date.`
      : `Worth locking in, though it won't move your grade much.`
  }
  // explicit score
  if (cd > 0) return `Hitting that score lifts the course ~${cd}% — a realistic target worth pushing for.`
  if (cd < 0) return `That would pull the course down ~${Math.abs(cd)}%. Aim higher if you can.`
  return `That keeps your course grade about where it is now.`
}

function groupContextFor(m: Match): string | undefined {
  if (!m.bundle.course.applyGroupWeights || !m.assignment.assignmentGroupId) return undefined
  const g = m.bundle.groups.find(gr => gr.id === m.assignment.assignmentGroupId)
  return g ? `${g.name} (${g.groupWeight}% of grade)` : undefined
}

// ── Main entry ──────────────────────────────────────────────────────────────────
export function parseQuestion(question: string, bundles: CourseBundle[]): AskAnswer {
  const q = question.trim().toLowerCase()
  if (!q) return { kind: 'unknown', headline: 'Ask me about your grades.', suggestions: SUGGESTIONS }

  const fastestIntent =
    /(fastest|quickest|best way|highest impact)/.test(q) && /(gpa|grade)/.test(q) ||
    /(how (can|do|to) (i )?)?(raise|boost|improve|increase|bump|lift).*(gpa|grade)/.test(q)

  const scoreIntent = extractScoreIntent(q)
  const qForMatch   = scoreIntent ? q.replace(scoreIntent.text, ' ') : q
  const matched     = matchAssignment(qForMatch, bundles)

  const rippleWords = /(what if|what happens|happen|skip|fail|miss|submit|drop|ace|perfect|impact|affect|score|get |bomb|if i)/.test(q)
    || scoreIntent !== null

  // 1) Ripple — an assignment is named and there's a what-if signal.
  if (matched && rippleWords && !(fastestIntent && !scoreIntent)) {
    const pts   = matched.assignment.pointsPossible ?? 0
    const score = resolveScore(scoreIntent, pts)
    const r = computeRipple(bundles, matched.assignment.id, score)
    if (r) {
      const verb = intentVerb(scoreIntent)
      // overwrite the generic "this assignment" with the resolved title
      const headline = rippleHeadline({ ...r }, verb)
        .replace('this assignment', `“${matched.assignment.title}”`)
      return {
        kind: 'ripple',
        headline,
        recommendation: rippleRecommendation(r, verb),
        ripple: r,
        groupContext: groupContextFor(matched),
      }
    }
  }

  // 2) Fastest way to raise GPA.
  if (fastestIntent) {
    const actions = fastestGpaActions(bundles)
    const headline = actions.length === 0
      ? 'Your active courses have no missing or low-scoring assignments left to recover — you’re maxed out.'
      : `The fastest way to raise your GPA: tackle these ${actions.length} item${actions.length !== 1 ? 's' : ''}. Completing #1 (“${actions[0].assignmentTitle}”) adds about +${actions[0].gpaGain.toFixed(2)} to your semester GPA.`
    return {
      kind: 'fastest',
      headline,
      recommendation: actions.length
        ? `Start with “${actions[0].assignmentTitle}” in ${actions[0].courseName} — it's your single highest-impact move (+${actions[0].gpaGain.toFixed(2)} GPA).`
        : undefined,
      actions,
    }
  }

  // 3) Current GPA status.
  if (/(my|current|semester|cumulative).*(gpa)|gpa.*(now|currently)|what.*gpa/.test(q)) {
    const active = bundles.filter(b => b.course.isActive)
    const semesterGpa   = computeOverallGpa(active.map(b => computeCoursePercent(b.course, b.assignments, b.groups).percent))
    const cumulativeGpa = computeOverallGpa(bundles.map(b => computeCoursePercent(b.course, b.assignments, b.groups).percent))
    // Surface the lowest active course as the highest-leverage place to focus.
    const lowest = active
      .map(b => ({ name: b.course.name, pct: computeCoursePercent(b.course, b.assignments, b.groups).percent }))
      .filter((x): x is { name: string; pct: number } => x.pct !== null)
      .sort((a, b) => a.pct - b.pct)[0]
    return {
      kind: 'current-gpa',
      headline: `Your semester GPA is ${gpa(semesterGpa)} and your cumulative GPA is ${gpa(cumulativeGpa)}.`,
      recommendation: lowest
        ? `${lowest.name} is your lowest active course at ${Math.round(lowest.pct)}% — lifting it has the biggest effect on your GPA.`
        : undefined,
      semesterGpa, cumulativeGpa,
    }
  }

  // 4) Couldn't resolve — be helpful.
  const hint = rippleWords && !matched
    ? "I couldn't find an assignment matching that. Try its exact name."
    : "I couldn't parse that question yet."
  return { kind: 'unknown', headline: hint, suggestions: SUGGESTIONS }
}
