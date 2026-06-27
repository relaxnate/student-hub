// Builds a dynamic, data-rich system prompt for each AI conversation from the
// student's REAL synced Canvas data (Phase 2). Cached per conversation by the
// handler so it's built once per chat, not per message.
import {
  CourseRepository,
  AssignmentRepository,
} from '../database/repositories'
import { computeCumulativeGpa, percentToLetterGrade } from '@shared/lib/gpa'

const MASCOT_NAME = 'Byte'   // chosen from the reference photos (see vault)

const courseRepo     = new CourseRepository()
const assignmentRepo = new AssignmentRepository()

export function buildSystemPrompt(mascotName = MASCOT_NAME): string {
  const now = new Date()
  const today = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const active = courseRepo.getActive()
  const allCourses = courseRepo.getAll()
  const gpa = computeCumulativeGpa(allCourses)

  const courseLines = active.length
    ? active.map(c => {
        const pct = c.currentScore
        const grade = pct != null ? `${pct.toFixed(1)}% (${c.currentGrade ?? percentToLetterGrade(pct)})` : 'no grade yet'
        return `- ${c.name} [id: ${c.id}]: ${grade}`
      }).join('\n')
    : '- (no active courses synced)'

  const upcoming = assignmentRepo.getUpcoming(7 * 24 * 60 * 60 * 1000)
  const dueLines = upcoming.length
    ? upcoming.slice(0, 20).map(a => {
        const due = a.dueAt ? new Date(a.dueAt).toLocaleString() : 'no due date'
        return `- ${a.title} (${courseRepo.getById(a.courseId)?.name ?? a.courseId}) — ${a.pointsPossible ?? '?'} pts, due ${due}`
      }).join('\n')
    : '- (nothing due in the next 7 days)'

  const overdue = assignmentRepo.getOverdue()
  const missingLines = overdue.length
    ? overdue.slice(0, 15).map(a =>
        `- ${a.title} (${courseRepo.getById(a.courseId)?.name ?? a.courseId}) — ${a.pointsPossible ?? '?'} pts`).join('\n')
    : '- (no missing work — nice)'

  return `You are ${mascotName}, an AI academic assistant built into Student Hub, a desktop app that syncs with the student's real Canvas LMS data.

Today is ${today}.

The student's current academic situation:
Active courses:
${courseLines}

Due this week:
${dueLines}

Missing work:
${missingLines}

Current GPA: ${gpa != null ? gpa.toFixed(2) + ' (equal-weight 4.0 scale across all synced courses)' : 'not enough data yet'}

You have access to tools that look up more detailed information about any course, assignment, grade, module, or GPA scenario. Use them whenever the student asks about specifics — never guess at or invent grades, due dates, or assignment details; always call a tool to get the real numbers.

When you want to change a file, use the propose_file_edit tool. It only PROPOSES the change — the student must click Apply before anything is written. Never claim a file was edited; say you've proposed it.

You are helpful, honest, and encouraging without being falsely positive. Give practical, specific advice grounded in the student's real data. Keep answers concise and skimmable.`
}
