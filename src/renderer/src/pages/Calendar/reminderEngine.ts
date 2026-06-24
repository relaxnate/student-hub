// ─── Smart Reminder Assistant — engine ─────────────────────────────────────────
// A fully-offline, deterministic academic reminder engine. The feature was
// specced as an LLM assistant that returns a JSON array of reminder objects;
// Student Hub is offline-first (no LLM/API), so this is the faithful local
// equivalent: a pure function over the student's already-synced data that emits
// the exact same structured reminder objects, trigger logic, priority tiers,
// tone, dedup, and quiet-hours behavior. Tone copy is template-generated to match
// the spec's examples (lead with the fact, one clear action, no guilt-trips/filler).
//
// Renderer-only — reads data the Calendar page already fetches via IPC. No backend.

export type ReminderType =
  | 'DEADLINE' | 'MISSING' | 'GRADE_DROP' | 'STREAK_AT_RISK'
  | 'CONFLICT' | 'PREP_WINDOW' | 'LOW_ENGAGEMENT' | 'CUSTOM'

export type ReminderPriority = 'critical' | 'high' | 'medium' | 'low'

export interface Reminder {
  id: string
  type: ReminderType
  priority: ReminderPriority
  course: string | null
  title: string
  body: string
  action_label: string
  action_target: string | null   // app route path (hash router) or external URL
  time_context: string
  dismissible: boolean
  snoozeable: boolean
  snooze_options_minutes: number[]
  expires_at: string             // ISO 8601
  metadata: {
    assignment_id: string | null
    event_id: string | null
    grade_impact_points: number | null
    grade_impact_percent: number | null
  }
}

export type SubmissionStatus = 'submitted' | 'missing' | 'late' | 'graded' | 'upcoming'

export interface AssignmentInput {
  id: string
  courseId: string
  title: string
  dueAt: number | null
  pointsPossible: number | null
  status: SubmissionStatus
  score: number | null
}

export interface CourseInput {
  id: string
  name: string
  currentScore: number | null
  currentGrade: string | null
}

export interface EventInput {
  id: string
  title: string
  startAt: number
  endAt: number | null
  type: string        // 'assignment' | 'event' (Canvas) — best-effort
  courseId: string | null
}

export interface CustomReminderInput {
  id: string
  title: string
  remindAt: number
  assignmentId?: string | null
}

export interface ReminderSettings {
  leadTimeHours: number
  mutedCourses: string[]
  quietHours: { start: number; end: number } | null   // hour-of-day 0–23
}

export interface ReminderInput {
  now: number
  courses: CourseInput[]
  assignments: AssignmentInput[]
  events: EventInput[]
  custom: CustomReminderInput[]
  settings: ReminderSettings
  prevScores: Record<string, number>      // courseId → last-seen currentScore (GRADE_DROP)
  dismissedIds: string[]
  snoozedUntil: Record<string, number>     // reminderId → epoch ms until which it's hidden
}

const H = 3600_000
const DAY = 24 * H

// ─── Time helpers ───────────────────────────────────────────────────────────────
function fmtClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
function isSameDay(a: number, b: number): boolean {
  const d1 = new Date(a), d2 = new Date(b)
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate()
}
function humanDuration(ms: number): string {
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'}`
  const hrs = Math.round(ms / H)
  if (hrs < 48) return `${hrs} hour${hrs === 1 ? '' : 's'}`
  const days = Math.round(ms / DAY)
  return `${days} day${days === 1 ? '' : 's'}`
}
function dueContext(now: number, due: number): string {
  if (due >= now) {
    if (isSameDay(now, due)) return `Due at ${fmtClock(due)} today`
    return `Due in ${humanDuration(due - now)}`
  }
  return `${humanDuration(now - due)} overdue`
}

// ─── Quiet hours ─────────────────────────────────────────────────────────────────
function inQuietHours(now: number, q: ReminderSettings['quietHours']): boolean {
  if (!q) return false
  const hr = new Date(now).getHours()
  // Window may wrap midnight (e.g. 22→7).
  return q.start <= q.end ? hr >= q.start && hr < q.end : hr >= q.start || hr < q.end
}

// ─── Letter grade (for GRADE_DROP boundary detection) ───────────────────────────
function letter(pct: number): string {
  if (pct >= 90) return 'A'
  if (pct >= 80) return 'B'
  if (pct >= 70) return 'C'
  if (pct >= 60) return 'D'
  return 'F'
}

// ─── Main entry ──────────────────────────────────────────────────────────────────
export function generateReminders(input: ReminderInput): Reminder[] {
  const { now, courses, assignments, events, custom, settings, prevScores, dismissedIds, snoozedUntil } = input
  const courseById = new Map(courses.map(c => [c.id, c]))
  const muted = new Set(settings.mutedCourses)
  const out: Reminder[] = []

  const push = (r: Reminder) => out.push(r)

  // Total points per course (rough share-of-grade estimate when weights unknown).
  const coursePoints = new Map<string, number>()
  for (const a of assignments) {
    if (a.pointsPossible && a.pointsPossible > 0) {
      coursePoints.set(a.courseId, (coursePoints.get(a.courseId) ?? 0) + a.pointsPossible)
    }
  }
  const gradeSharePct = (a: AssignmentInput): number | null => {
    const total = coursePoints.get(a.courseId)
    if (!total || !a.pointsPossible) return null
    return Math.round((a.pointsPossible / total) * 1000) / 10  // approximate % of course grade
  }

  // ── DEADLINE — 72h / 24h / 6h / 1h windows, not yet submitted ─────────────────
  for (const a of assignments) {
    if (muted.has(a.courseId) || a.dueAt === null) continue
    if (a.status === 'submitted' || a.status === 'graded') continue   // already done → skip entirely
    const left = a.dueAt - now
    if (left <= 0) continue                                            // past due → MISSING handles it
    const lead = Math.max(settings.leadTimeHours, 1) * H
    if (left > Math.max(72 * H, lead)) continue                        // outside the lead window

    const course = courseById.get(a.courseId)
    const share = gradeSharePct(a)
    const worth = share != null ? ` and worth about ${share}% of your ${course?.name ?? 'course'} grade` : ''
    let window: '1h' | '6h' | '24h' | '72h'
    let priority: ReminderPriority
    if (left <= 1 * H)       { window = '1h';  priority = 'critical' }
    else if (left <= 6 * H)  { window = '6h';  priority = 'critical' }
    else if (left <= 24 * H) { window = '24h'; priority = 'high' }
    else                     { window = '72h'; priority = 'medium' }

    const body =
      window === '1h' || window === '6h'
        ? `${a.title} is due in ${humanDuration(left)}${worth}. You haven't submitted yet — open it now and upload what you have; a partial submission beats a zero.`
        : window === '24h'
          ? `${a.title} is due in ${humanDuration(left)}${worth}. Block out time today so you're not finishing it at the deadline.`
          : `${a.title} is due in ${humanDuration(left)}${worth}. Start it in the next day or two to keep it off your plate.`

    push({
      id: `deadline-${a.id}-${window}`,
      type: 'DEADLINE',
      priority,
      course: course?.name ?? null,
      title: priority === 'critical' ? `${a.title} due soon` : `Upcoming: ${a.title}`.slice(0, 60),
      body,
      action_label: 'Open Assignment',
      action_target: `/assignments/${a.id}`,
      time_context: dueContext(now, a.dueAt),
      dismissible: true,
      snoozeable: priority !== 'critical',
      snooze_options_minutes: [15, 60, 240],
      expires_at: new Date(a.dueAt).toISOString(),
      metadata: { assignment_id: a.id, event_id: null, grade_impact_points: a.pointsPossible, grade_impact_percent: share },
    })
  }

  // ── MISSING — past due, no submission. One per day. ───────────────────────────
  for (const a of assignments) {
    if (muted.has(a.courseId) || a.dueAt === null) continue
    if (a.status !== 'missing') continue
    const course = courseById.get(a.courseId)
    const share = gradeSharePct(a)
    const critical = share != null && share >= 10
    const pts = a.pointsPossible ? ` It's worth ${a.pointsPossible} points${share != null ? ` (~${share}% of the grade)` : ''}.` : ''
    push({
      id: `missing-${a.id}-${new Date(now).toISOString().slice(0, 10)}`,   // once per day
      type: 'MISSING',
      priority: critical ? 'critical' : 'high',
      course: course?.name ?? null,
      title: `Missing: ${a.title}`.slice(0, 60),
      body: `${a.title} in ${course?.name ?? 'your course'} is ${humanDuration(now - a.dueAt)} overdue.${pts} Submitting now may still earn partial credit — turn in what you have and message your instructor.`,
      action_label: 'Open Assignment',
      action_target: `/assignments/${a.id}`,
      time_context: dueContext(now, a.dueAt),
      dismissible: true,
      snoozeable: true,
      snooze_options_minutes: [60, 240, 1440],
      expires_at: new Date(now + DAY).toISOString(),
      metadata: { assignment_id: a.id, event_id: null, grade_impact_points: a.pointsPossible, grade_impact_percent: share },
    })
  }

  // ── GRADE_DROP — fell >5 pts or crossed a letter boundary since last sync ──────
  for (const c of courses) {
    if (muted.has(c.id) || c.currentScore === null) continue
    const prev = prevScores[c.id]
    if (prev === undefined) continue
    const dropped = prev - c.currentScore
    const crossed = letter(prev) !== letter(c.currentScore) && c.currentScore < prev
    if (dropped <= 5 && !crossed) continue
    const belowPassing = c.currentScore < 60
    push({
      id: `gradedrop-${c.id}-${Math.round(c.currentScore)}`,
      type: 'GRADE_DROP',
      priority: belowPassing ? 'critical' : crossed ? 'high' : 'medium',
      course: c.name,
      title: `${c.name} grade dropped`.slice(0, 60),
      body: `Your ${c.name} score moved from ${Math.round(prev)}% to ${Math.round(c.currentScore)}%${crossed ? ` (now a ${letter(c.currentScore)})` : ''}. Open the gradebook to see which assignment pulled it down and what you can still recover.`,
      action_label: 'View Grades',
      action_target: '/grades',
      time_context: 'Updated after the latest sync',
      dismissible: true,
      snoozeable: false,
      snooze_options_minutes: [],
      expires_at: new Date(now + 7 * DAY).toISOString(),
      metadata: { assignment_id: null, event_id: null, grade_impact_points: Math.round((c.currentScore - prev) * 10) / 10, grade_impact_percent: Math.round((c.currentScore - prev) * 10) / 10 },
    })
  }

  // ── PREP_WINDOW — high-stakes item within 48h & course score < 75% ────────────
  for (const a of assignments) {
    if (muted.has(a.courseId) || a.dueAt === null) continue
    if (a.status === 'submitted' || a.status === 'graded') continue
    const left = a.dueAt - now
    if (left <= 0 || left > 2 * DAY) continue
    const course = courseById.get(a.courseId)
    const share = gradeSharePct(a)
    const highStakes = (a.pointsPossible ?? 0) >= 100 || (share != null && share >= 20)
    if (!highStakes || course?.currentScore == null || course.currentScore >= 75) continue
    push({
      id: `prep-${a.id}`,
      type: 'PREP_WINDOW',
      priority: 'high',
      course: course.name,
      title: `Prep time: ${a.title}`.slice(0, 60),
      body: `${a.title} lands in ${humanDuration(left)} and you're at ${Math.round(course.currentScore)}% in ${course.name}. This one matters${share != null ? ` (~${share}% of the grade)` : ''} — schedule two focused study blocks before then.`,
      action_label: 'Open Assignment',
      action_target: `/assignments/${a.id}`,
      time_context: dueContext(now, a.dueAt),
      dismissible: true,
      snoozeable: true,
      snooze_options_minutes: [60, 240],
      expires_at: new Date(a.dueAt).toISOString(),
      metadata: { assignment_id: a.id, event_id: null, grade_impact_points: a.pointsPossible, grade_impact_percent: share },
    })
  }

  // ── STREAK_AT_RISK — consistent submitter, next item not started, window closing ─
  const graded = assignments.filter(a => a.status === 'graded' || a.status === 'submitted')
  const everDue = assignments.filter(a => a.dueAt !== null && a.dueAt < now)
  const submissionRate = everDue.length ? graded.length / everDue.length : 0
  if (submissionRate >= 0.8 && everDue.length >= 3) {
    const nextUp = assignments
      .filter(a => !muted.has(a.courseId) && a.dueAt !== null && a.status === 'upcoming' && a.dueAt - now > 0 && a.dueAt - now <= 2 * DAY)
      .sort((x, y) => (x.dueAt! - y.dueAt!))[0]
    if (nextUp) {
      const course = courseById.get(nextUp.courseId)
      push({
        id: `streak-${nextUp.id}`,
        type: 'STREAK_AT_RISK',
        priority: 'medium',
        course: course?.name ?? null,
        title: 'Keep your submit streak',
        body: `You've turned in everything so far. ${nextUp.title} in ${course?.name ?? 'your course'} is due in ${humanDuration(nextUp.dueAt! - now)} and isn't started yet — a short start now keeps the run going.`,
        action_label: 'Open Assignment',
        action_target: `/assignments/${nextUp.id}`,
        time_context: dueContext(now, nextUp.dueAt!),
        dismissible: true,
        snoozeable: true,
        snooze_options_minutes: [60, 240, 1440],
        expires_at: new Date(nextUp.dueAt!).toISOString(),
        metadata: { assignment_id: nextUp.id, event_id: null, grade_impact_points: nextUp.pointsPossible, grade_impact_percent: gradeSharePct(nextUp) },
      })
    }
  }

  // ── CONFLICT — two events overlap in time ──────────────────────────────────────
  const sorted = [...events].filter(e => e.endAt && e.endAt > e.startAt).sort((a, b) => a.startAt - b.startAt)
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1]
    if (b.startAt < (a.endAt ?? a.startAt) && a.startAt >= now - DAY) {
      // Protect the academically heavier one: an assignment-linked event over a plain one.
      const protect = a.type === 'assignment' ? a : b.type === 'assignment' ? b : a
      const other   = protect === a ? b : a
      push({
        id: `conflict-${a.id}-${b.id}`,
        type: 'CONFLICT',
        priority: 'medium',
        course: null,
        title: 'Calendar conflict',
        body: `"${a.title}" (${fmtClock(a.startAt)}) and "${b.title}" (${fmtClock(b.startAt)}) overlap. Protect "${protect.title}" — it carries more academic weight; reschedule "${other.title}" if you can.`,
        action_label: 'View Calendar',
        action_target: '/calendar',
        time_context: isSameDay(now, a.startAt) ? `Today at ${fmtClock(a.startAt)}` : `Starts ${fmtClock(a.startAt)}`,
        dismissible: true,
        snoozeable: true,
        snooze_options_minutes: [60, 240],
        expires_at: new Date(b.endAt ?? b.startAt).toISOString(),
        metadata: { assignment_id: null, event_id: a.id, grade_impact_points: null, grade_impact_percent: null },
      })
    }
  }

  // ── LOW_ENGAGEMENT — course has upcoming work but no recent graded activity ─────
  // (Approximation: module-progression history isn't synced, so we proxy "stalled"
  //  as a course with upcoming assignments and no graded work yet this term.)
  for (const c of courses) {
    if (muted.has(c.id)) continue
    const courseAssignments = assignments.filter(a => a.courseId === c.id)
    const hasUpcoming = courseAssignments.some(a => a.status === 'upcoming')
    const hasGraded = courseAssignments.some(a => a.status === 'graded' || a.status === 'submitted')
    if (hasUpcoming && !hasGraded && courseAssignments.length >= 3) {
      push({
        id: `lowengage-${c.id}-${new Date(now).toISOString().slice(0, 10)}`,
        type: 'LOW_ENGAGEMENT',
        priority: 'low',
        course: c.name,
        title: `Get a head start in ${c.name}`.slice(0, 60),
        body: `${c.name} has work coming up and nothing turned in yet. Knocking out the first item this week keeps it from piling up.`,
        action_label: 'View Course',
        action_target: '/grades',
        time_context: 'This week',
        dismissible: true,
        snoozeable: true,
        snooze_options_minutes: [1440],
        expires_at: new Date(now + 3 * DAY).toISOString(),
        metadata: { assignment_id: null, event_id: null, grade_impact_points: null, grade_impact_percent: null },
      })
    }
  }

  // ── CUSTOM — student-defined, with Canvas context if it references an assignment ─
  for (const cr of custom) {
    if (cr.remindAt > now) continue   // not yet time
    const linked = cr.assignmentId ? assignments.find(a => a.id === cr.assignmentId) : undefined
    const course = linked ? courseById.get(linked.courseId) : undefined
    let body = `You set a reminder: "${cr.title}".`
    if (linked && linked.dueAt) {
      const share = gradeSharePct(linked)
      body = `You asked to be reminded about "${cr.title}". ${linked.title} is ${dueContext(now, linked.dueAt).toLowerCase()}${share != null ? ` and worth about ${share}% of your ${course?.name ?? 'course'} grade` : ''}. This is the right time.`
    }
    push({
      id: `custom-${cr.id}`,
      type: 'CUSTOM',
      priority: 'medium',
      course: course?.name ?? null,
      title: cr.title.slice(0, 60),
      body,
      action_label: linked ? 'Open Assignment' : 'Dismiss',
      action_target: linked ? `/assignments/${linked.id}` : null,
      time_context: linked?.dueAt ? dueContext(now, linked.dueAt) : 'Now',
      dismissible: true,
      snoozeable: true,
      snooze_options_minutes: [15, 60, 240],
      expires_at: new Date(now + DAY).toISOString(),
      metadata: { assignment_id: linked?.id ?? null, event_id: null, grade_impact_points: null, grade_impact_percent: null },
    })
  }

  // ── Filter: dismissed, snoozed, quiet hours; sort by priority then time ─────────
  const dismissed = new Set(dismissedIds)
  const quiet = inQuietHours(now, settings.quietHours)
  const rank: Record<ReminderPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 }

  return out
    .filter(r => !dismissed.has(r.id))
    .filter(r => !(snoozedUntil[r.id] && snoozedUntil[r.id] > now))
    .filter(r => {
      if (!quiet) return true
      // During quiet hours, only let critical reminders through whose deadline is
      // within the quiet window (genuinely time-sensitive).
      return r.priority === 'critical' && new Date(r.expires_at).getTime() - now <= 8 * H
    })
    .sort((a, b) => rank[a.priority] - rank[b.priority] || new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime())
}
