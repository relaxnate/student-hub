import { Notification, app } from 'electron'
import { AssignmentRepository } from '../../database/repositories'
import { getDb } from '../../database'
import type { AppPreferences } from '@shared/types/ipc'

const assignments = new AssignmentRepository()

/**
 * Schedules desktop notifications for upcoming and overdue assignments.
 * Called once on startup and then on a timer based on the user's preferences.
 */
export class NotificationService {
  private intervalId: ReturnType<typeof setInterval> | null = null

  start(preferences: AppPreferences): void {
    if (!preferences.notificationsEnabled) return

    this.check(preferences)

    // Re-check periodically (every 30 minutes is a reasonable balance)
    const intervalMs = 30 * 60 * 1000
    this.intervalId  = setInterval(() => this.check(preferences), intervalMs)
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  private check(prefs: AppPreferences): void {
    if (!Notification.isSupported()) return

    const advanceMs  = prefs.notificationAdvanceHours * 60 * 60 * 1000
    const upcoming   = assignments.getUpcoming(advanceMs)
    const overdue    = assignments.getOverdue()

    // Fire one notification per assignment due in the next window
    // that hasn't already been notified (tracked in the DB preferences table)
    const db = getDb()
    const alreadyNotified = new Set<string>(
      (db.prepare(`SELECT value FROM preferences WHERE key = 'notified_assignment_ids'`).get() as
        { value?: string } | undefined)?.value?.split(',') ?? []
    )

    const toNotify = [
      ...upcoming.filter(a => !alreadyNotified.has(a.id)),
      ...overdue.filter(a  => !alreadyNotified.has(a.id)),
    ].slice(0, 5)  // Cap at 5 simultaneous notifications

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

    // Persist the updated notified set
    if (toNotify.length > 0) {
      db.prepare(`
        INSERT INTO preferences (key, value) VALUES ('notified_assignment_ids', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run([...alreadyNotified].join(','))
    }
  }
}
