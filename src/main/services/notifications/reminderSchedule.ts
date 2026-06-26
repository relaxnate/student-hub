// Pure, framework-free helpers for computing WHEN a reminder's OS notification
// should fire. No Electron, no DB — unit-testable in isolation.
//
// Anchoring rules (see Step-6.5-Research.md):
//  - A timed reminder fires at (date + time) − reminderMinutesBefore.
//  - An all-day reminder (time === null) is anchored to a default local time
//    (ALL_DAY_ANCHOR, 09:00) on its date, then minutesBefore is subtracted.
//  - Recurring reminders advance by day/week/month from the base date; the
//    "next" fire time is the first occurrence strictly after `now`.

import type { Reminder } from '@shared/types/entities'

export const ALL_DAY_ANCHOR_HHMM = '09:00'

const MINUTE_MS = 60_000

/** Local wall-clock instant for a 'YYYY-MM-DD' + 'HH:MM' (HH:MM defaults to the all-day anchor). */
function eventInstant(dateStr: string, timeStr: string | null): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = (timeStr ?? ALL_DAY_ANCHOR_HHMM).split(':').map(Number)
  // Constructing with local components yields a local-time instant (what the
  // user picked on their own calendar), which is the correct semantics here.
  return new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 9, mm ?? 0, 0, 0).getTime()
}

/** The fire instant for a single dated occurrence of a reminder. */
function fireInstant(reminder: Reminder, dateStr: string): number {
  return eventInstant(dateStr, reminder.time) - reminder.reminderMinutesBefore * MINUTE_MS
}

function pad2(n: number): string { return n < 10 ? `0${n}` : String(n) }

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/**
 * The next fire instant strictly after `now`, or null if the reminder has no
 * future occurrence (a non-repeating reminder whose only fire time has passed).
 * Iteration is bounded so an ancient daily base date can't loop unbounded.
 */
export function nextFireTime(reminder: Reminder, now: number): number | null {
  if (reminder.repeat === 'none') {
    const t = fireInstant(reminder, reminder.date)
    return t > now ? t : null
  }

  const [y, m, d] = reminder.date.split('-').map(Number)
  const cursor = new Date(y, (m ?? 1) - 1, d ?? 1)
  const MAX_ITER = 1200 // ~3y daily / plenty for weekly/monthly

  for (let i = 0; i < MAX_ITER; i++) {
    const t = fireInstant(reminder, toDateStr(cursor))
    if (t > now) return t
    switch (reminder.repeat) {
      case 'daily':   cursor.setDate(cursor.getDate() + 1); break
      case 'weekly':  cursor.setDate(cursor.getDate() + 7); break
      case 'monthly': cursor.setMonth(cursor.getMonth() + 1); break
    }
  }
  return null
}

/**
 * Expand a recurring reminder into the individual dates it occurs on within the
 * inclusive ['YYYY-MM-DD' .. 'YYYY-MM-DD'] window — used by the calendar to draw
 * a recurring reminder on every day it lands in the visible month. Non-repeating
 * reminders yield their single date when it falls in the window.
 */
export function occurrenceDatesInRange(reminder: Reminder, startDate: string, endDate: string): string[] {
  if (reminder.repeat === 'none') {
    return reminder.date >= startDate && reminder.date <= endDate ? [reminder.date] : []
  }
  const out: string[] = []
  const [y, m, d] = reminder.date.split('-').map(Number)
  const cursor = new Date(y, (m ?? 1) - 1, d ?? 1)
  const MAX_ITER = 1200
  for (let i = 0; i < MAX_ITER; i++) {
    const ds = toDateStr(cursor)
    if (ds > endDate) break
    if (ds >= startDate) out.push(ds)
    switch (reminder.repeat) {
      case 'daily':   cursor.setDate(cursor.getDate() + 1); break
      case 'weekly':  cursor.setDate(cursor.getDate() + 7); break
      case 'monthly': cursor.setMonth(cursor.getMonth() + 1); break
    }
  }
  return out
}
