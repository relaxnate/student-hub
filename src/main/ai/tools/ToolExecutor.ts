// Executes AI tool calls as thin wrappers over existing repositories. Read-only
// tools run immediately and return formatted text. The single destructive tool
// (propose_file_edit) NEVER writes — it validates the path and returns a proposal
// the renderer renders as an Apply/Dismiss card; the write happens only on an
// explicit AI.APPLY_FILE_EDIT confirmation (see ai.handlers.ts).
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { getDb } from '../../database'
import {
  CourseRepository,
  AssignmentRepository,
  GradeRepository,
  ModuleRepository,
  ModuleItemRepository,
} from '../../database/repositories'
import { computeCumulativeGpa, percentToLetterGrade } from '@shared/lib/gpa'
import { isDestructiveTool } from './AcademicTools'

export interface ProposedFileEdit {
  filePath: string       // validated absolute path
  proposedContent: string
  reason: string
}

export interface ToolExecResult {
  content: string                 // text fed back to the model
  proposal?: ProposedFileEdit     // present only for propose_file_edit
}

const courseRepo     = new CourseRepository()
const assignmentRepo = new AssignmentRepository()
const gradeRepo      = new GradeRepository()
const moduleRepo     = new ModuleRepository()
const moduleItemRepo = new ModuleItemRepository()

export { isDestructiveTool }

export async function executeTool(name: string, argsJson: string): Promise<ToolExecResult> {
  let args: Record<string, unknown> = {}
  try { args = argsJson ? JSON.parse(argsJson) : {} } catch { args = {} }

  switch (name) {
    case 'get_courses':              return { content: getCourses() }
    case 'get_assignments':          return { content: getAssignments(String(args.courseId), !!args.includeFuture, !!args.includeGraded) }
    case 'get_grades':               return { content: getGrades(String(args.courseId)) }
    case 'get_gpa_summary':          return { content: getGpaSummary() }
    case 'get_upcoming_assignments': return { content: getUpcoming(Number(args.withinDays) || 7) }
    case 'get_missing_assignments':  return { content: getMissing() }
    case 'get_modules':              return { content: getModules(String(args.courseId)) }
    case 'calculate_needed_score':   return { content: calcNeeded(String(args.courseId), Number(args.targetGrade)) }
    case 'propose_file_edit':        return proposeFileEdit(args)
    default:                         return { content: `Unknown tool: ${name}` }
  }
}

// ─── Read-only tools ─────────────────────────────────────────────────────────
function courseName(id: string): string {
  return courseRepo.getById(id)?.name ?? id
}

function getCourses(): string {
  const courses = courseRepo.getActive()
  if (!courses.length) return 'No active courses are synced.'
  return courses.map(c => {
    const pct = c.currentScore
    return `- ${c.name} (${c.courseCode ?? 'no code'}) [id: ${c.id}]: ` +
      (pct != null ? `${pct.toFixed(1)}% (${c.currentGrade ?? percentToLetterGrade(pct)})` : 'no grade yet')
  }).join('\n')
}

function getAssignments(courseId: string, includeFuture: boolean, includeGraded: boolean): string {
  const course = courseRepo.getById(courseId)
  if (!course) return `No course found with id ${courseId}.`
  const assignments = assignmentRepo.getByCourse(courseId)
  const now = Date.now()
  const rows = assignments.filter(a => {
    const grade = gradeRepo.getByAssignment(a.id)
    const isGraded = grade?.score != null
    const isFuture = a.dueAt != null && a.dueAt > now
    if (isGraded && !includeGraded) return false
    if (isFuture && !includeFuture) return false
    return true
  })
  if (!rows.length) return `No matching assignments in ${course.name}.`
  return `Assignments in ${course.name}:\n` + rows.map(a => {
    const g = gradeRepo.getByAssignment(a.id)
    const due = a.dueAt ? new Date(a.dueAt).toLocaleDateString() : 'no due date'
    const score = g?.score != null ? `${g.score}/${a.pointsPossible ?? '?'}` : 'ungraded'
    return `- ${a.title} [id: ${a.id}] — ${a.pointsPossible ?? '?'} pts, due ${due}, ${score}`
  }).join('\n')
}

function getGrades(courseId: string): string {
  const course = courseRepo.getById(courseId)
  if (!course) return `No course found with id ${courseId}.`
  const grades = gradeRepo.getByCourse(courseId).filter(g => g.score != null)
  if (!grades.length) return `No graded work yet in ${course.name}.`
  const header = `Grades in ${course.name}` +
    (course.currentScore != null ? ` (overall ${course.currentScore.toFixed(1)}% / ${course.currentGrade ?? percentToLetterGrade(course.currentScore)}):` : ':')
  return header + '\n' + grades.map(g => {
    const a = assignmentRepo.getById(g.assignmentId)
    const pct = g.score != null && g.pointsPossible ? ((g.score / g.pointsPossible) * 100).toFixed(0) : '—'
    return `- ${a?.title ?? g.assignmentId}: ${g.score}/${g.pointsPossible ?? '?'} (${pct}%)`
  }).join('\n')
}

function getGpaSummary(): string {
  const all = courseRepo.getAll()
  const gpa = computeCumulativeGpa(all)
  const active = courseRepo.getActive()
  const lines = active.map(c =>
    `- ${c.name}: ${c.currentScore != null ? `${c.currentScore.toFixed(1)}% (${c.currentGrade ?? percentToLetterGrade(c.currentScore)})` : 'no grade'}`)
  return `Cumulative GPA (all ${all.length} synced courses, equal-weight 4.0 scale): ${gpa != null ? gpa.toFixed(2) : 'not enough data'}\n` +
    `Active courses:\n${lines.join('\n')}`
}

function getUpcoming(withinDays: number): string {
  const ms = withinDays * 24 * 60 * 60 * 1000
  const upcoming = assignmentRepo.getUpcoming(ms)
  if (!upcoming.length) return `Nothing due in the next ${withinDays} days.`
  return `Due in the next ${withinDays} days:\n` + upcoming.map(a => {
    const due = a.dueAt ? new Date(a.dueAt).toLocaleString() : '?'
    return `- ${a.title} (${courseName(a.courseId)}) — ${a.pointsPossible ?? '?'} pts, due ${due}`
  }).join('\n')
}

function getMissing(): string {
  const overdue = assignmentRepo.getOverdue()
  if (!overdue.length) return 'No missing/overdue unsubmitted assignments. 🎉'
  return `Missing (past due, unsubmitted):\n` + overdue.map(a => {
    const due = a.dueAt ? new Date(a.dueAt).toLocaleDateString() : '?'
    return `- ${a.title} (${courseName(a.courseId)}) — ${a.pointsPossible ?? '?'} pts, was due ${due}`
  }).join('\n')
}

function getModules(courseId: string): string {
  const course = courseRepo.getById(courseId)
  if (!course) return `No course found with id ${courseId}.`
  const modules = moduleRepo.getByCourse(courseId)
  if (!modules.length) return `No modules synced for ${course.name}.`
  return `Modules in ${course.name}:\n` + modules.map(m => {
    const items = moduleItemRepo.getByModule(m.id)
    const itemList = items.slice(0, 12).map(it => `    • ${it.title} (${it.type})`).join('\n')
    return `- ${m.name} (${items.length} items)` + (itemList ? `\n${itemList}` : '')
  }).join('\n')
}

function calcNeeded(courseId: string, targetGrade: number): string {
  const course = courseRepo.getById(courseId)
  if (!course) return `No course found with id ${courseId}.`
  if (!Number.isFinite(targetGrade)) return 'Provide a numeric target grade (e.g. 90).'
  const assignments = assignmentRepo.getByCourse(courseId)
  let earned = 0, gradedPossible = 0, totalPossible = 0
  for (const a of assignments) {
    if (!a.pointsPossible) continue
    totalPossible += a.pointsPossible
    const g = gradeRepo.getByAssignment(a.id)
    if (g?.score != null) { earned += g.score; gradedPossible += a.pointsPossible }
  }
  const remaining = totalPossible - gradedPossible
  if (totalPossible === 0) return `${course.name} has no point-bearing assignments to compute from.`
  if (remaining <= 0) {
    const final = (earned / totalPossible) * 100
    return `All work in ${course.name} is graded — the grade is already settled at ${final.toFixed(1)}%. No remaining assignments to affect it.`
  }
  const targetPoints = (targetGrade / 100) * totalPossible
  const neededPoints = targetPoints - earned
  const neededPct = (neededPoints / remaining) * 100
  const note = '(flat points model — ignores any Canvas group weighting)'
  if (neededPct <= 0) return `Good news: you've already secured a ${targetGrade}% in ${course.name} regardless of remaining work. ${note}`
  if (neededPct > 100) return `Reaching ${targetGrade}% in ${course.name} is no longer mathematically possible — you'd need ${neededPct.toFixed(1)}% on the remaining ${remaining} pts. ${note}`
  return `To hit ${targetGrade}% in ${course.name}, you need to average ${neededPct.toFixed(1)}% across the remaining ${remaining} ungraded points. ${note}`
}

// ─── Destructive tool (proposal only) ────────────────────────────────────────
function proposeFileEdit(args: Record<string, unknown>): ToolExecResult {
  const filePath = String(args.filePath ?? '')
  const proposedContent = String(args.proposedContent ?? '')
  const reason = String(args.reason ?? '')
  const check = validateWritePath(filePath)
  if (!check.ok) {
    return { content: `Cannot propose that edit: ${check.error}` }
  }
  return {
    content: `Proposed an edit to "${path.basename(check.resolved!)}" and shown it to the student for approval. ` +
      `It has NOT been written — wait for them to click Apply. Do not claim the file was changed.`,
    proposal: { filePath: check.resolved!, proposedContent, reason },
  }
}

// ─── File-path security (shared with the APPLY handler) ──────────────────────
/**
 * A write is allowed ONLY inside the configured Obsidian vault or the app's
 * managed files dir (userData/files). No `..` traversal; the resolved absolute
 * path must sit under an allowed root. Returns the resolved path on success.
 */
export function validateWritePath(filePath: string): { ok: boolean; resolved?: string; error?: string } {
  if (!filePath || typeof filePath !== 'string') return { ok: false, error: 'No file path given.' }
  if (filePath.includes('..')) return { ok: false, error: 'Path traversal ("..") is not allowed.' }

  const resolved = path.resolve(filePath)
  const roots = allowedWriteRoots()
  if (roots.length === 0) {
    return { ok: false, error: 'No allowed directory is configured. Set an Obsidian vault path in Settings first.' }
  }
  const within = roots.some(root => {
    const rel = path.relative(root, resolved)
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
  })
  if (!within) {
    return { ok: false, error: 'That path is outside the allowed folders (your vault or Student Hub managed files).' }
  }
  return { ok: true, resolved }
}

function allowedWriteRoots(): string[] {
  const roots: string[] = []
  // Managed files dir under userData.
  try {
    const managed = path.join(app.getPath('userData'), 'files')
    fs.mkdirSync(managed, { recursive: true })
    roots.push(path.resolve(managed))
  } catch { /* ignore */ }
  // Configured Obsidian vault path from preferences.
  try {
    const row = getDb().prepare(`SELECT value FROM preferences WHERE key = 'obsidianVaultPath'`).get() as
      { value: string } | undefined
    if (row?.value) {
      const parsed = (() => { try { return JSON.parse(row.value) } catch { return row.value } })()
      if (typeof parsed === 'string' && parsed.trim()) roots.push(path.resolve(parsed))
    }
  } catch { /* ignore */ }
  return roots
}
