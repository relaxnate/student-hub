import { ipcMain, shell } from 'electron'
import { IPC } from '@shared/ipc-channels'
import {
  CourseRepository,
  ModuleRepository,
  ModuleItemRepository,
  AssignmentRepository,
  AssignmentGroupRepository,
  GradeRepository,
  FileRepository,
  PageRepository,
  QuizRepository,
  WhatIfScoreRepository,
} from '../database/repositories'
import type { CalendarRangePayload, GetPageByUrlPayload, SetWhatIfScorePayload } from '@shared/types/ipc'
import { getDb } from '../database'

const courseRepo          = new CourseRepository()
const moduleRepo          = new ModuleRepository()
const moduleItemRepo      = new ModuleItemRepository()
const assignmentRepo      = new AssignmentRepository()
const assignmentGroupRepo = new AssignmentGroupRepository()
const gradeRepo           = new GradeRepository()
const fileRepo            = new FileRepository()
const pageRepo            = new PageRepository()
const quizRepo            = new QuizRepository()
const whatIfRepo          = new WhatIfScoreRepository()

export function registerDataHandlers(): void {
  // ─── Courses ─────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.COURSES.GET_ALL, () => {
    try { return { ok: true, data: courseRepo.getActive() } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  // Returns every synced course regardless of is_active status.
  // Used exclusively by the Grade & GPA Calculator so past-semester
  // courses appear in the historical year view.
  ipcMain.handle(IPC.COURSES.GET_ALL_INCLUDING_INACTIVE, () => {
    try { return { ok: true, data: courseRepo.getAll() } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.COURSES.GET_BY_ID, (_event, id: string) => {
    try {
      const course = courseRepo.getById(id)
      return course ? { ok: true, data: course } : { ok: false, error: `Course ${id} not found` }
    } catch (err) { return { ok: false, error: String(err) } }
  })

  // ─── Modules ─────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.MODULES.GET_BY_COURSE, (_event, courseId: string) => {
    try { return { ok: true, data: moduleRepo.getByCourse(courseId) } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.MODULES.GET_ITEMS, (_event, moduleId: string) => {
    try { return { ok: true, data: moduleItemRepo.getByModule(moduleId) } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  // ─── Assignments ─────────────────────────────────────────────────────────

  ipcMain.handle(IPC.ASSIGNMENTS.GET_BY_COURSE, (_event, courseId: string) => {
    try { return { ok: true, data: assignmentRepo.getByCourse(courseId) } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.ASSIGNMENTS.GET_BY_ID, (_event, id: string) => {
    try {
      const a = assignmentRepo.getById(id)
      return a ? { ok: true, data: a } : { ok: false, error: `Assignment ${id} not found` }
    } catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.ASSIGNMENTS.GET_UPCOMING, () => {
    try { return { ok: true, data: assignmentRepo.getUpcoming(7 * 24 * 60 * 60 * 1000) } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.ASSIGNMENTS.GET_OVERDUE, () => {
    try { return { ok: true, data: assignmentRepo.getOverdue() } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  // ─── Grades ──────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.GRADES.GET_BY_COURSE, (_event, courseId: string) => {
    try { return { ok: true, data: gradeRepo.getByCourse(courseId) } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.GRADES.GET_BY_ASSIGNMENT, (_event, assignmentId: string) => {
    try { return { ok: true, data: gradeRepo.getByAssignment(assignmentId) ?? null } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  // ─── Assignment Groups ─────────────────────────────────────────────────

  ipcMain.handle(IPC.ASSIGNMENT_GROUPS.GET_BY_COURSE, (_event, courseId: string) => {
    try { return { ok: true, data: assignmentGroupRepo.getByCourse(courseId) } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  // ─── Pages ───────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.PAGES.GET_BY_COURSE, (_event, courseId: string) => {
    try { return { ok: true, data: pageRepo.getByCourse(courseId) } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.PAGES.GET_BY_ID, (_event, id: string) => {
    try {
      const p = pageRepo.getById(id)
      return p ? { ok: true, data: p } : { ok: false, error: `Page ${id} not found` }
    } catch (err) { return { ok: false, error: String(err) } }
  })

  // Module items of type "Page" reference a page by (courseId, url) rather
  // than a content id — see ModuleItem.pageUrl.
  ipcMain.handle(IPC.PAGES.GET_BY_URL, (_event, payload: GetPageByUrlPayload) => {
    try {
      const p = pageRepo.getByCourseAndUrl(payload.courseId, payload.url)
      return p ? { ok: true, data: p } : { ok: false, error: `Page "${payload.url}" not found` }
    } catch (err) { return { ok: false, error: String(err) } }
  })

  // ─── Quizzes ─────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.QUIZZES.GET_BY_COURSE, (_event, courseId: string) => {
    try { return { ok: true, data: quizRepo.getByCourse(courseId) } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.QUIZZES.GET_BY_ID, (_event, id: string) => {
    try {
      const q = quizRepo.getById(id)
      return q ? { ok: true, data: q } : { ok: false, error: `Quiz ${id} not found` }
    } catch (err) { return { ok: false, error: String(err) } }
  })

  // ─── What-If Scores (Grade & GPA Calculator) ───────────────────────────
  // Purely local scratchpad values — never sent to the LMS.

  ipcMain.handle(IPC.WHATIF.GET_ALL, () => {
    try { return { ok: true, data: whatIfRepo.getAll() } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.WHATIF.SET, (_event, payload: SetWhatIfScorePayload) => {
    try { return { ok: true, data: whatIfRepo.set(payload.assignmentId, payload.hypotheticalScore) } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.WHATIF.CLEAR_COURSE, (_event, courseId: string) => {
    try { whatIfRepo.clearByCourse(courseId); return { ok: true, data: null } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.WHATIF.CLEAR_ALL, () => {
    try { whatIfRepo.clearAll(); return { ok: true, data: null } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  // ─── Files ───────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.FILES.GET_BY_COURSE, (_event, courseId: string) => {
    try { return { ok: true, data: fileRepo.getByCourse(courseId) } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  // Open a file: use local cached copy if available, otherwise open the LMS URL in the browser
  ipcMain.handle(IPC.FILES.OPEN, async (_event, fileId: string) => {
    try {
      const db  = getDb()
      const row = db.prepare(`SELECT local_path, url FROM files WHERE id = ?`).get(fileId) as
        { local_path: string | null; url: string | null } | undefined

      if (!row) return { ok: false, error: 'File not found' }

      if (row.local_path) {
        const err = await shell.openPath(row.local_path)
        if (err) return { ok: false, error: err }
        return { ok: true, data: null }
      } else if (row.url) {
        await shell.openExternal(row.url)
        return { ok: true, data: null }
      }
      return { ok: false, error: 'File has no local path or URL' }
    } catch (err) { return { ok: false, error: String(err) } }
  })

  // Reveal a locally-downloaded file in the OS file explorer
  ipcMain.handle(IPC.FILES.REVEAL_IN_EXPLORER, (_event, fileId: string) => {
    try {
      const db  = getDb()
      const row = db.prepare(`SELECT local_path FROM files WHERE id = ?`).get(fileId) as
        { local_path: string | null } | undefined

      if (!row?.local_path) return { ok: false, error: 'File is not downloaded locally' }
      shell.showItemInFolder(row.local_path)
      return { ok: true, data: null }
    } catch (err) { return { ok: false, error: String(err) } }
  })

  // ─── Calendar ────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.CALENDAR.GET_RANGE, (_event, payload: CalendarRangePayload) => {
    try {
      const rows = getDb().prepare(`
        SELECT * FROM calendar_events
        WHERE start_at >= ? AND start_at <= ?
        ORDER BY start_at ASC
      `).all(payload.startMs, payload.endMs)
      return { ok: true, data: rows }
    } catch (err) { return { ok: false, error: String(err) } }
  })
}
