import { BrowserWindow } from 'electron'
import { getAdapter } from '../../integrations/registry'
import { TokenStore } from '../auth/TokenStore'
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
} from '../../database/repositories'
import { getDb } from '../../database'
import { IPC } from '@shared/ipc-channels'
import type { SyncProgress, Integration } from '@shared/types/entities'
import { TokenExpiredError, RateLimitError, APIError } from '../../integrations/base/errors'
import { logDebug } from '../../crash-logger'
import crypto from 'crypto'

const courses           = new CourseRepository()
const modules           = new ModuleRepository()
const items             = new ModuleItemRepository()
const assignments       = new AssignmentRepository()
const assignmentGroups  = new AssignmentGroupRepository()
const grades            = new GradeRepository()
const files             = new FileRepository()
const pages             = new PageRepository()
const quizzes           = new QuizRepository()
const tokens            = new TokenStore()

// Errors that mean "this specific course/phase is broken" rather than
// "the whole integration is broken". We log these and keep going so one
// course with restricted permissions (a very common real-world Canvas
// situation — e.g. a homeroom/advisory course with limited API access, or
// an institution that scopes personal-access-token permissions) doesn't
// take down the rest of the sync.
function isRecoverable(err: unknown): boolean {
  return !(err instanceof TokenExpiredError) && !(err instanceof RateLimitError)
}

// Some "errors" aren't actually problems — they're the LMS telling us a
// feature is turned off entirely (Pages/Quizzes disabled for a course) or
// that the institution has scoped this Personal Access Token's permissions
// below what's needed for a given endpoint (Files/Calendar 403s are common
// when a school restricts API token scope below the student's normal
// browser-session permissions). There is no code fix for either of these —
// they reflect a real, intentional restriction set by the school or
// instructor — so we don't want them clogging up the sync-issues toast
// every single sync. We still log them to the console for debugging, just
// not into partialErrors/the user-facing toast.
function isExpectedRestriction(err: unknown): boolean {
  if (!(err instanceof APIError)) return false

  // Canvas returns 404 (not 403) when a course feature like Pages or
  // Quizzes has been disabled entirely — the endpoint doesn't "not exist",
  // it's just switched off, so this isn't really a missing-resource error.
  if (err.statusCode === 404 && /disabled for this (course|page)/i.test(err.body)) {
    return true
  }

  // Any 403 from Canvas means the institution's PAT scope policy (or course
  // configuration) blocks this endpoint for student tokens. The body format
  // varies by Canvas version and instance:
  //   {"status":"unauthorized"}                          ← many school districts
  //   {"errors":[{"message":"not authorized ..."}]}      ← older Canvas instances
  //   "You are not authorized to perform that action"    ← some Canvas LMS versions
  // All are equally unfixable from the student side — only a Canvas admin can
  // change PAT scope policies — so we treat every 403 as an expected restriction
  // rather than alarming the user with a red toast they can't act on.
  if (err.statusCode === 403) {
    return true
  }

  return false
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export class SyncEngine {
  private activeSyncIds = new Set<string>()

  async syncIntegration(
    integration: Integration,
    window: BrowserWindow
  ): Promise<{ success: boolean; error?: string }> {
    if (this.activeSyncIds.has(integration.id)) {
      return { success: false, error: 'Sync already in progress for this integration' }
    }

    this.activeSyncIds.add(integration.id)

    const logId = crypto.randomUUID()
    const db    = getDb()
    db.prepare(`
      INSERT INTO sync_log (id, integration_id, started_at, status)
      VALUES (?, ?, ?, 'running')
    `).run(logId, integration.id, Date.now())

    const emit = (progress: SyncProgress) =>
      window.webContents.send(IPC.SYNC.PROGRESS, progress)

    let coursesSynced = 0, assignmentsSynced = 0, modulesSynced = 0, filesSynced = 0
    let gradesSynced = 0, gradesSkipped = 0

    // Failures that are specific to one course/phase. We keep syncing
    // everything else and report these at the end instead of aborting.
    // Expected restrictions (see isExpectedRestriction above) are
    // deliberately NOT added here — they're not actionable issues.
    const partialErrors: string[] = []

    try {
      const adapter = getAdapter(integration.id)
      if (!adapter) throw new Error('No adapter registered — please reconnect this integration')

      const stored = tokens.load(integration.id)
      if (!stored) throw new Error('No stored tokens — please reconnect this integration')

      // Refresh access token if it has expired
      if (adapter.isTokenExpired() && stored.refreshToken) {
        const fresh       = await adapter.refreshAccessToken(stored.refreshToken)
        const newExpiresAt = fresh.expiresIn ? Date.now() + fresh.expiresIn * 1000 : null
        adapter.setTokens(fresh.accessToken, fresh.refreshToken, newExpiresAt)
        tokens.save(integration.id, {
          accessToken:  fresh.accessToken,
          refreshToken: fresh.refreshToken,
          expiresAt:    newExpiresAt,
        })
      } else {
        adapter.setTokens(stored.accessToken, stored.refreshToken, stored.expiresAt)
      }

      // ── Phase 1: Courses ────────────────────────────────────────────────
      // If this fails, there's nothing else we can do — let it throw to
      // the outer catch.
      emit({ integrationId: integration.id, provider: integration.provider,
        phase: 'courses', courseId: null, courseName: null,
        itemsProcessed: 0, itemsTotal: null })

      const syncedCourses = await adapter.fetchCourses()
      syncedCourses.forEach(c => { c.integrationId = integration.id })
      courses.saveMany(syncedCourses)
      courses.assignMissingColors()
      // Defensive: mark any course this integration previously had that the
      // current sync didn't return (e.g. a dropped class) as inactive, so it
      // disappears from the active-only views. Courses still returned keep
      // whatever is_active value normalizeCourse() just computed for them.
      courses.reconcileActive(integration.id, syncedCourses.map(c => c.id))
      coursesSynced = syncedCourses.length

      // ── Phase 2–7: Per-course data ───────────────────────────────────────
      // Each course — and each phase within a course — is isolated. A 403
      // on one course's /modules endpoint (e.g. a restricted or
      // administrative course) should not prevent every other course's
      // modules, assignments, and grades from syncing.
      for (const course of syncedCourses) {
        const extId = course.externalId

        // Historical/completed courses (course.isActive === false, i.e. the
        // student's enrollment_state for this course is no longer 'active')
        // already have their final grade captured above via
        // computed_current_score/computed_current_grade from Canvas's
        // enrollment data — that's the authoritative final grade for a
        // finished course, identical to what the student sees on their
        // Canvas grades page. There's no need to pull modules, assignments,
        // files, pages, or quizzes for a course that's already over: it
        // multiplies sync time and API calls for every past semester a
        // student has, and old/archived courses are disproportionately
        // likely to have restricted or pruned endpoints. The Grade & GPA
        // Calculator already falls back to course.currentScore for any
        // course with no synced assignment data, so historical GPA still
        // works correctly with just this course-level record.
        if (!course.isActive) {
          continue
        }

        // Modules
        try {
          emit({ integrationId: integration.id, provider: integration.provider,
            phase: 'modules', courseId: course.id, courseName: course.name,
            itemsProcessed: 0, itemsTotal: null })

          const syncedModules = await adapter.fetchModules(course.id, extId)
          modules.saveMany(syncedModules)
          modulesSynced += syncedModules.length

          for (const mod of syncedModules) {
            try {
              const syncedItems = await adapter.fetchModuleItems(
                mod.id, course.id, extId, mod.externalId
              )
              items.saveMany(syncedItems)
            } catch (err) {
              if (!isRecoverable(err)) throw err
              if (isExpectedRestriction(err)) {
                console.info(`[SyncEngine] ${course.name} — "${mod.name}" items restricted (expected): ${errMsg(err)}`)
              } else {
                partialErrors.push(`${course.name} — "${mod.name}" items: ${errMsg(err)}`)
              }
            }
          }
        } catch (err) {
          if (!isRecoverable(err)) throw err
          if (isExpectedRestriction(err)) {
            console.info(`[SyncEngine] ${course.name} — modules restricted (expected): ${errMsg(err)}`)
          } else {
            partialErrors.push(`${course.name} — modules: ${errMsg(err)}`)
          }
        }

        // Assignment Groups (needed before assignments so assignmentGroupId
        // foreign keys resolve, and to power weighted grade math)
        try {
          const syncedGroups = await adapter.fetchAssignmentGroups(course.id, extId)
          assignmentGroups.saveMany(syncedGroups)
        } catch (err) {
          if (!isRecoverable(err)) throw err
          if (isExpectedRestriction(err)) {
            console.info(`[SyncEngine] ${course.name} — assignment groups restricted (expected): ${errMsg(err)}`)
          } else {
            partialErrors.push(`${course.name} — assignment groups: ${errMsg(err)}`)
          }
        }

        // Assignments + attachments
        try {
          emit({ integrationId: integration.id, provider: integration.provider,
            phase: 'assignments', courseId: course.id, courseName: course.name,
            itemsProcessed: 0, itemsTotal: null })

          const { assignments: syncedAssignments, attachments } =
            await adapter.fetchAssignments(course.id, extId)
          assignments.saveMany(syncedAssignments)
          assignmentsSynced += syncedAssignments.length

          if (attachments.length > 0) {
            const upsert = db.prepare(`
              INSERT INTO assignment_attachments
                (id, assignment_id, file_id, url, filename, content_type, size, synced_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET url = excluded.url, synced_at = excluded.synced_at
            `)
            db.transaction(() => {
              for (const a of attachments) {
                upsert.run(a.id, a.assignmentId, a.fileId, a.url,
                  a.filename, a.contentType, a.size, Date.now())
              }
            })()
          }
        } catch (err) {
          if (!isRecoverable(err)) throw err
          if (isExpectedRestriction(err)) {
            console.info(`[SyncEngine] ${course.name} — assignments restricted (expected): ${errMsg(err)}`)
          } else {
            partialErrors.push(`${course.name} — assignments: ${errMsg(err)}`)
          }
        }

        // Grades
        try {
          const syncedGrades = await adapter.fetchGrades(course.id, extId)
          const { saved, skipped } = grades.saveMany(syncedGrades)
          gradesSynced  += saved
          gradesSkipped += skipped
          logDebug(
            `[SyncEngine] ${course.name}: grades fetched=${syncedGrades.length} ` +
            `stored=${saved} skipped=${skipped}`
          )
          if (syncedGrades.length === 0) {
            logDebug(`[SyncEngine] ${course.name}: Canvas returned zero grade submissions`)
          }
        } catch (err) {
          if (!isRecoverable(err)) throw err
          if (isExpectedRestriction(err)) {
            console.info(`[SyncEngine] ${course.name} — grades restricted (expected): ${errMsg(err)}`)
          } else {
            partialErrors.push(`${course.name} — grades: ${errMsg(err)}`)
          }
        }

        // Files
        try {
          emit({ integrationId: integration.id, provider: integration.provider,
            phase: 'files', courseId: course.id, courseName: course.name,
            itemsProcessed: 0, itemsTotal: null })

          const syncedFiles = await adapter.fetchFiles(course.id, extId)
          files.saveMany(syncedFiles)
          filesSynced += syncedFiles.length
        } catch (err) {
          if (!isRecoverable(err)) throw err
          if (isExpectedRestriction(err)) {
            console.info(`[SyncEngine] ${course.name} — files restricted (expected): ${errMsg(err)}`)
          } else {
            partialErrors.push(`${course.name} — files: ${errMsg(err)}`)
          }
        }

        // Pages (stored via PageRepository — body is available offline)
        try {
          const syncedPages = await adapter.fetchPages(course.id, extId)
          pages.saveMany(syncedPages)
        } catch (err) {
          if (!isRecoverable(err)) throw err
          if (isExpectedRestriction(err)) {
            console.info(`[SyncEngine] ${course.name} — pages restricted/disabled (expected): ${errMsg(err)}`)
          } else {
            partialErrors.push(`${course.name} — pages: ${errMsg(err)}`)
          }
        }

        // Quizzes
        try {
          const syncedQuizzes = await adapter.fetchQuizzes(course.id, extId)
          quizzes.saveMany(syncedQuizzes)
        } catch (err) {
          if (!isRecoverable(err)) throw err
          if (isExpectedRestriction(err)) {
            console.info(`[SyncEngine] ${course.name} — quizzes restricted/disabled (expected): ${errMsg(err)}`)
          } else {
            partialErrors.push(`${course.name} — quizzes: ${errMsg(err)}`)
          }
        }
      }

      // ── Phase 8: Calendar ────────────────────────────────────────────────
      try {
        emit({ integrationId: integration.id, provider: integration.provider,
          phase: 'calendar', courseId: null, courseName: null,
          itemsProcessed: 0, itemsTotal: null })

        const syncedEvents = await adapter.fetchCalendarEvents(integration.id, null, null)
        if (syncedEvents.length > 0) {
          const upsertEvent = db.prepare(`
            INSERT INTO calendar_events
              (id, integration_id, course_id, external_id, title, description,
               start_at, end_at, all_day, event_type, assignment_id, location, synced_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(integration_id, external_id) DO UPDATE SET
              title = excluded.title, start_at = excluded.start_at, synced_at = excluded.synced_at
          `)
          db.transaction(() => {
            for (const e of syncedEvents) {
              upsertEvent.run(e.id, e.integrationId, e.courseId, e.externalId, e.title,
                e.description, e.startAt, e.endAt, e.allDay ? 1 : 0,
                e.eventType, e.assignmentId, e.location, Date.now())
            }
          })()
        }
      } catch (err) {
        if (!isRecoverable(err)) throw err
        if (isExpectedRestriction(err)) {
          console.info(`[SyncEngine] Calendar restricted (expected): ${errMsg(err)}`)
        } else {
          partialErrors.push(`Calendar: ${errMsg(err)}`)
        }
      }

      // ── Finalize ─────────────────────────────────────────────────────────
      logDebug(
        `[SyncEngine] ${integration.id} done: courses=${coursesSynced} ` +
        `assignments=${assignmentsSynced} grades=${gradesSynced} (skipped ${gradesSkipped}) ` +
        `modules=${modulesSynced} files=${filesSynced} issues=${partialErrors.length}`
      )
      const status = partialErrors.length > 0 ? 'partial' : 'success'
      const combinedErrorMessage = partialErrors.length > 0
        ? `Synced with ${partialErrors.length} issue(s): ${partialErrors.join('; ')}`
        : null

      db.prepare(`
        UPDATE sync_log
        SET status = ?, completed_at = ?,
            courses_synced = ?, assignments_synced = ?, modules_synced = ?, files_synced = ?,
            error_message = ?
        WHERE id = ?
      `).run(status, Date.now(), coursesSynced, assignmentsSynced, modulesSynced, filesSynced,
        combinedErrorMessage, logId)

      db.prepare(`UPDATE integrations SET last_synced_at = ? WHERE id = ?`)
        .run(Date.now(), integration.id)

      // Surface partial issues as a (non-fatal) toast so the user knows
      // exactly which course/phase had trouble and why — but still mark
      // the sync complete since everything else came through. Expected
      // restrictions (disabled features, scoped-out token permissions)
      // never reach partialErrors in the first place, so this toast now
      // only fires for genuinely actionable problems.
      if (combinedErrorMessage) {
        window.webContents.send(IPC.SYNC.ERROR, {
          integrationId: integration.id,
          error: combinedErrorMessage,
        })
        console.warn(`[SyncEngine] Partial sync for ${integration.id}: ${combinedErrorMessage}`)
      }

      window.webContents.send(IPC.SYNC.COMPLETE, { integrationId: integration.id })
      return { success: true, error: combinedErrorMessage ?? undefined }

    } catch (err) {
      // A non-recoverable error (expired/invalid token, rate limit, or a
      // failure in Phase 1 itself) — we genuinely couldn't complete the sync.
      const message = errMsg(err)
      console.error(`[SyncEngine] Sync failed for ${integration.id}:`, message)

      db.prepare(`
        UPDATE sync_log SET status = 'error', completed_at = ?, error_message = ? WHERE id = ?
      `).run(Date.now(), message, logId)

      window.webContents.send(IPC.SYNC.ERROR, { integrationId: integration.id, error: message })

      if (err instanceof TokenExpiredError) {
        return { success: false, error: 'Session expired — please reconnect this integration.' }
      }
      if (err instanceof RateLimitError) {
        return { success: false, error: `Rate limited by the LMS — try again in a minute. (${message})` }
      }
      return { success: false, error: message }

    } finally {
      this.activeSyncIds.delete(integration.id)
    }
  }

  isSyncing(integrationId: string): boolean {
    return this.activeSyncIds.has(integrationId)
  }
}
