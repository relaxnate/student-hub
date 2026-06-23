import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatDistanceToNow, format, isToday, isTomorrow, isPast } from 'date-fns'

// ─── Class name helper ────────────────────────────────────────────────────────
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** Format a unix ms timestamp as a human-readable due date label. */
export function formatDueDate(ms: number | null): string {
  if (!ms) return 'No due date'
  const date = new Date(ms)
  if (isToday(date))    return `Today at ${format(date, 'h:mm a')}`
  if (isTomorrow(date)) return `Tomorrow at ${format(date, 'h:mm a')}`
  return format(date, 'MMM d, yyyy · h:mm a')
}

/** Returns a label like "Due in 2 days" or "Overdue by 3 hours". */
export function formatRelativeDue(ms: number | null): string {
  if (!ms) return ''
  const date = new Date(ms)
  if (isPast(date)) {
    return `Overdue by ${formatDistanceToNow(date)}`
  }
  return `Due ${formatDistanceToNow(date, { addSuffix: true })}`
}

/** Returns the urgency level of an upcoming assignment. */
export function getDueUrgency(ms: number | null): 'overdue' | 'urgent' | 'soon' | 'future' | 'none' {
  if (!ms) return 'none'
  const diff = ms - Date.now()
  if (diff < 0)                     return 'overdue'
  if (diff < 24 * 60 * 60 * 1000)  return 'urgent'
  if (diff < 48 * 60 * 60 * 1000)  return 'soon'
  return 'future'
}

// ─── Score / grade helpers ────────────────────────────────────────────────────

/** Calculate the percentage score from score / pointsPossible. */
export function calcPercent(score: number | null, possible: number | null): number | null {
  if (score === null || !possible || possible === 0) return null
  return Math.round((score / possible) * 100)
}

/** Turn a percentage into a letter grade (US standard). */
export function percentToLetter(percent: number | null): string {
  if (percent === null) return '—'
  if (percent >= 93) return 'A'
  if (percent >= 90) return 'A−'
  if (percent >= 87) return 'B+'
  if (percent >= 83) return 'B'
  if (percent >= 80) return 'B−'
  if (percent >= 77) return 'C+'
  if (percent >= 73) return 'C'
  if (percent >= 70) return 'C−'
  if (percent >= 67) return 'D+'
  if (percent >= 63) return 'D'
  if (percent >= 60) return 'D−'
  return 'F'
}

// ─── File size formatting ─────────────────────────────────────────────────────
export function formatFileSize(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 ** 2)   return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3)   return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

// ─── Unique ID ────────────────────────────────────────────────────────────────
export function uid(): string {
  return Math.random().toString(36).slice(2, 9)
}
