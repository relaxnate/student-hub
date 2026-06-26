import { Notification } from 'electron'
import { randomUUID } from 'crypto'
import { AssignmentRepository, ReminderRepository } from '../../database/repositories'
import { getDb } from '../../database'
import { getMainWindow } from '../../window'
import { IPC } from '@shared/ipc-channels'
import { nextFireTime } from './reminderSchedule'
import type { AppPreferences } from '@shared/types/ipc'
import type { Reminder } from '@shared/types/entities'

const assignments = new AssignmentRepository()
const reminders   = new ReminderRepository()

const HOUR_MS    = 60 * 60 * 1000
const DAY_MS     = 24 * HOUR_MS
// How long after a missed fire time we still fire a catch-up on startup, rather
// than silently swallowing it (avoids a notification storm for very old misses).
const CATCHUP_GRACE_MS = 60 * 60 * 1000

/**
 * Owns ALL desktop notifications (main process only).
 *  - Assignment due-soon / overdue reminders (legacy behavior, unchanged).
 *  - User-created calendar reminders with precise scheduling: a setTimeout is
 *    armed for anything firing within 24h, while the durable schedule lives in
 *    the scheduled_notifications table so a restart can recover pending fires.
 *    An hourly re-scan arms newly-near reminders and recovers from sleep/late
 *    timers; startup recovery fires recently-missed ones.
 */
export class NotificationService {
  private intervalId: ReturnType<typeof setInterval> | null = null
  // Armed near-future timers, keyed by reminder id (so edits/deletes can cancel).
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  private prefs: AppPreferences | null = null

  start(preferences: AppPreferences): void {
    this.prefs = preferences
    if (!preferences.notificationsEnabled) return
    if (!Notification.isSupported()) return

    this.checkAssignments(preferences)
    this.loadPendingReminders()

    // One periodic tick drives both assignment checks and reminder re-scans.
    this.intervalId = setInterval(() => {
      this.checkAssignments(preferences)
      this.rescanReminders()
    }, 30 * 60 * 1000)
  }

  stop(): void {
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null }
    for (const t of this.timers.values()) clearTimeout(t)
    this.timers.clear()
  }

  // ─── Reminders: public scheduling API (called by the IPC handlers) ─────────

  /** (Re)schedule a single reminder after it is created or edited. */
  scheduleReminder(reminder: Reminder): void {
    this.cancelTimer(reminder.id)
    // Drop any stale unfired schedule rows for this reminder; we recompute below.
    try {
      getDb().prepare(`DELETE FROM scheduled_notifications WHERE reminder_id = ? AND fired_at IS NULL`).run(reminder.id)
    } catch { /* table may not exist on a very old DB — ignore */ }

    if (!this.prefs?.notificationsEnabled || !Notification.isSupported()) return

    const now  = Date.now()
    const fire = nextFireTime(reminder, now)
    if (fire === null) return

    this.persistSchedule(reminder.id, fire)
    if (fire - now <= DAY_MS) this.armTimer(reminder, fire)
  }

  /** Cancel any pending notification for a reminder being deleted. */
  unscheduleReminder(reminderId: string): void {
    this.cancelTimer(reminderId)
    // scheduled_notifications rows cascade-delete with the reminder via FK, but
    // clear them defensively in case this is called without a row delete.
    try {
      getDb().prepare(`DELETE FROM scheduled_notifications WHERE reminder_id = ?`).run(reminderId)
    } catch { /* ignore */ }
  }

  // ─── Reminders: internal ───────────────────────────────────────────────────

  /** Startup recovery: fire recently-missed reminders, then arm upcoming ones. */
  private loadPendingReminders(): void {
    const now   = Date.now()
    const today = isoDate(new Date())
    let active: Reminder[]
    try { active = reminders.getActiveForScheduling(today) } catch { return }

    for (const r of active) {
      const fire = nextFireTime(r, now)
      // Catch up on a fire time we missed very recently while the app was closed.
      const lastFire = nextFireTime(r, now - DAY_MS)
      if (lastFire !== null && lastFire <= now && now - lastFire <= CATCHUP_GRACE_MS && !this.alreadyFired(r.id, lastFire)) {
        this.fireReminder(r, lastFire)
      }
      if (fire !== null) {
        this.persistSchedule(r.id, fire)
        if (fire - now <= DAY_MS) this.armTimer(r, fire)
      }
    }
    this.cleanupOldSchedules()
  }

  /** Hourly-ish re-scan: arm reminders that have come within 24h; recover late timers. */
  private rescanReminders(): void {
    if (!this.prefs?.notificationsEnabled || !Notification.isSupported()) return
    const now   = Date.now()
    const today = isoDate(new Date())
    let active: Reminder[]
    try { active = reminders.getActiveForScheduling(today) } catch { return }

    for (const r of active) {
      const fire = nextFireTime(r, now)
      if (fire === null) continue
      this.persistSchedule(r.id, fire)
      if (fire - now <= DAY_MS && !this.timers.has(r.id)) this.armTimer(r, fire)
    }
    this.cleanupOldSchedules()
  }

  private armTimer(reminder: Reminder, fireAt: number): void {
    const delay = Math.max(0, fireAt - Date.now())
    this.cancelTimer(reminder.id)
    const handle = setTimeout(() => {
      this.timers.delete(reminder.id)
      // Re-read the reminder in case it was edited/deleted since arming.
      const fresh = (() => { try { return reminders.getById(reminder.id) } catch { return undefined } })()
      if (!fresh) return
      this.fireReminder(fresh, fireAt)
      // Arm the following occurrence for repeating reminders.
      const next = nextFireTime(fresh, Date.now())
      if (next !== null) {
        this.persistSchedule(fresh.id, next)
        if (next - Date.now() <= DAY_MS) this.armTimer(fresh, next)
      }
    }, delay)
    this.timers.set(reminder.id, handle)
  }

  private cancelTimer(reminderId: string): void {
    const t = this.timers.get(reminderId)
    if (t) { clearTimeout(t); this.timers.delete(reminderId) }
  }

  private fireReminder(reminder: Reminder, fireAt: number): void {
    if (!Notification.isSupported()) return
    if (this.alreadyFired(reminder.id, fireAt)) return

    const body = reminder.time
      ? `At ${formatClock(reminder.time)}${reminder.reminderMinutesBefore > 0 ? ` · in ${humanizeMinutes(reminder.reminderMinutesBefore)}` : ''}`
      : 'All day'

    const notification = new Notification({ title: reminder.title, body })
    notification.on('click', () => {
      const win = getMainWindow()
      if (win) {
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
        win.webContents.send(IPC.NOTIFICATIONS.NAVIGATE, { route: '/calendar' })
      }
    })
    notification.show()

    this.markFired(reminder.id, fireAt)
  }

  // ─── scheduled_notifications table helpers ─────────────────────────────────

  private persistSchedule(reminderId: string, scheduledAt: number): void {
    try {
      getDb().prepare(`
        INSERT INTO scheduled_notifications (id, reminder_id, scheduled_at, fired_at, created_at)
        VALUES (?, ?, ?, NULL, ?)
        ON CONFLICT(reminder_id, scheduled_at) DO NOTHING
      `).run(randomUUID(), reminderId, scheduledAt, Date.now())
    } catch { /* ignore */ }
  }

  private alreadyFired(reminderId: string, scheduledAt: number): boolean {
    try {
      const row = getDb().prepare(
        `SELECT fired_at FROM scheduled_notifications WHERE reminder_id = ? AND scheduled_at = ?`
      ).get(reminderId, scheduledAt) as { fired_at: number | null } | undefined
      return !!row && row.fired_at !== null
    } catch { return false }
  }

  private markFired(reminderId: string, scheduledAt: number): void {
    try {
      getDb().prepare(`
        INSERT INTO scheduled_notifications (id, reminder_id, scheduled_at, fired_at, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(reminder_id, scheduled_at) DO UPDATE SET fired_at = excluded.fired_at
      `).run(randomUUID(), reminderId, scheduledAt, Date.now(), Date.now())
    } catch { /* ignore */ }
  }

  private cleanupOldSchedules(): void {
    try {
      // Drop fired rows older than 7 days — they've served their de-dupe purpose.
      getDb().prepare(`DELETE FROM scheduled_notifications WHERE fired_at IS NOT NULL AND fired_at < ?`)
        .run(Date.now() - 7 * DAY_MS)
    } catch { /* ignore */ }
  }

  // ─── Assignments (legacy behavior — unchanged) ─────────────────────────────

  private checkAssignments(prefs: AppPreferences): void {
    if (!Notification.isSupported()) return

    const advanceMs = prefs.notificationAdvanceHours * 60 * 60 * 1000
    const upcoming  = assignments.getUpcoming(advanceMs)
    const overdue   = assignments.getOverdue()

    const db = getDb()
    const alreadyNotified = new Set<string>(
      (db.prepare(`SELECT value FROM preferences WHERE key = 'notified_assignment_ids'`).get() as
        { value?: string } | undefined)?.value?.split(',') ?? []
    )

    const toNotify = [
      ...upcoming.filter(a => !alreadyNotified.has(a.id)),
      ...overdue.filter(a  => !alreadyNotified.has(a.id)),
    ].slice(0, 5)

    for (const assignment of toNotify) {
      const isOverdue = assignment.dueAt !== null && assignment.dueAt < Date.now()
      new Notification({
        title: isOverdue ? `Overdue: ${assignment.title}` : `Due soon: ${assignment.title}`,
        body: isOverdue
          ? 'This assignment is past its due date.'
          : `Due ${new Date(assignment.dueAt!).toLocaleString()}`,
        urgency: isOverdue ? 'critical' : 'normal',
      }).show()
      alreadyNotified.add(assignment.id)
    }

    if (toNotify.length > 0) {
      db.prepare(`
        INSERT INTO preferences (key, value) VALUES ('notified_assignment_ids', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run([...alreadyNotified].join(','))
    }
  }
}

// ─── small formatting helpers ────────────────────────────────────────────────

function isoDate(d: Date): string {
  const p = (n: number) => (n < 10 ? `0${n}` : String(n))
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12  = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m < 10 ? `0${m}` : m} ${ampm}`
}

function humanizeMinutes(mins: number): string {
  if (mins <= 0) return 'now'
  if (mins < 60) return `${mins} min`
  if (mins < 60 * 24) { const h = Math.round(mins / 60); return `${h} hour${h === 1 ? '' : 's'}` }
  const d = Math.round(mins / (60 * 24)); return `${d} day${d === 1 ? '' : 's'}`
}
