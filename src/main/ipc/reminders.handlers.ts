import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { IPC } from '@shared/ipc-channels'
import { ReminderRepository } from '../database/repositories'
import { NotificationService } from '../services/notifications/NotificationService'
import { occurrenceDatesInRange } from '../services/notifications/reminderSchedule'
import type { Reminder, ReminderOccurrence, CreateReminderInput, ReminderRepeat } from '@shared/types/entities'

const reminders = new ReminderRepository()

interface RangePayload { startDate: string; endDate: string }

const VALID_REPEATS: ReminderRepeat[] = ['none', 'daily', 'weekly', 'monthly']

function sanitizeInput(input: CreateReminderInput, existing?: Reminder): Reminder {
  const now = Date.now()
  const repeat = VALID_REPEATS.includes(input.repeat as ReminderRepeat) ? (input.repeat as ReminderRepeat) : 'none'
  return {
    id:                    existing?.id ?? `reminder-${randomUUID()}`,
    title:                 (input.title ?? '').trim() || 'Untitled reminder',
    date:                  input.date,
    time:                  input.time && input.time.length ? input.time : null,
    reminderMinutesBefore: Number.isFinite(input.reminderMinutesBefore as number) ? Math.max(0, Math.floor(input.reminderMinutesBefore as number)) : 15,
    color:                 input.color ?? '#6366f1',
    repeat,
    courseId:              input.courseId ?? null,
    assignmentId:          input.assignmentId ?? null,
    createdAt:             existing?.createdAt ?? now,
    updatedAt:             now,
  }
}

/**
 * Register reminder IPC. The NotificationService instance is shared with app.ts
 * so create/update/delete immediately (re)schedule or cancel OS notifications.
 */
export function registerReminderHandlers(notifications: NotificationService): void {
  // Expanded occurrences within a date window — what the calendar draws.
  ipcMain.handle(IPC.REMINDERS.GET_RANGE, (_e, payload: RangePayload) => {
    try {
      // Pull base rows whose date <= endDate (a recurring row dated before the
      // window can still land inside it), then expand each within the window.
      const all = reminders.getAll().filter(r => r.date <= payload.endDate)
      const occurrences: ReminderOccurrence[] = []
      for (const r of all) {
        for (const d of occurrenceDatesInRange(r, payload.startDate, payload.endDate)) {
          occurrences.push({ ...r, occurrenceDate: d })
        }
      }
      return { ok: true, data: occurrences }
    } catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.REMINDERS.GET_ALL, () => {
    try { return { ok: true, data: reminders.getAll() } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.REMINDERS.CREATE, (_e, input: CreateReminderInput) => {
    try {
      const reminder = sanitizeInput(input)
      reminders.create(reminder)
      notifications.scheduleReminder(reminder)
      return { ok: true, data: reminder }
    } catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.REMINDERS.UPDATE, (_e, payload: CreateReminderInput & { id: string }) => {
    try {
      const existing = reminders.getById(payload.id)
      if (!existing) return { ok: false, error: 'Reminder not found' }
      const reminder = sanitizeInput(payload, existing)
      reminders.update(reminder)
      notifications.scheduleReminder(reminder)
      return { ok: true, data: reminder }
    } catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.REMINDERS.DELETE, (_e, id: string) => {
    try {
      notifications.unscheduleReminder(id)
      reminders.remove(id)
      return { ok: true, data: null }
    } catch (err) { return { ok: false, error: String(err) } }
  })
}
