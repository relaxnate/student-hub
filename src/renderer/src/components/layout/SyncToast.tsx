import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react'
import { useSyncStore } from '../../store/sync.store'
import { cn } from '../../lib/utils'
import type { IntegrationProvider } from '@shared/types/entities'

const PROVIDER_LABELS: Record<IntegrationProvider, string> = {
  'canvas':           'Canvas',
  'google-classroom': 'Google Classroom',
  'microsoft-teams':  'Teams',
  'moodle':           'Moodle',
  'blackboard':       'Blackboard',
  'schoology':        'Schoology',
  'google-calendar':  'Google Calendar',
  'outlook-calendar': 'Outlook',
}

const PHASE_LABELS: Record<string, string> = {
  courses:     'Loading courses',
  modules:     'Syncing modules',
  assignments: 'Syncing assignments',
  files:       'Indexing files',
  grades:      'Fetching grades',
  calendar:    'Syncing calendar',
}

interface ToastItem {
  id:      string
  type:    'progress' | 'success' | 'error'
  label:   string
  detail?: string
}

export function SyncToast() {
  const { progress, errors } = useSyncStore()
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [successes, setSuccesses] = useState<Map<string, number>>(new Map())

  // Track when progress entries clear (sync completed)
  useEffect(() => {
    // When an integrationId disappears from progress and had no error,
    // show a brief success toast
    const ids = Object.keys(progress)
    setSuccesses(prev => {
      const next = new Map(prev)
      // Add new tracking entries
      for (const id of ids) {
        if (!next.has(id)) next.set(id, Date.now())
      }
      return next
    })
  }, [progress])

  const toasts: ToastItem[] = []

  // Active syncs
  for (const [integId, prog] of Object.entries(progress)) {
    if (dismissed.has(integId)) continue
    const phaseName  = prog.courseName
      ? `${PHASE_LABELS[prog.phase] ?? prog.phase} · ${prog.courseName}`
      : PHASE_LABELS[prog.phase] ?? prog.phase
    toasts.push({
      id:     integId,
      type:   'progress',
      label:  `Syncing ${PROVIDER_LABELS[prog.provider] ?? prog.provider}`,
      detail: phaseName,
    })
  }

  // Errors (also covers "partial success" syncs — SyncEngine prefixes those
  // messages with "Synced with N issue(s):" so we can label them as a
  // warning rather than a hard failure, since most data still came through).
  for (const [integId, errMsg] of Object.entries(errors)) {
    if (!errMsg || dismissed.has(`err-${integId}`)) continue
    const isPartial = errMsg.startsWith('Synced with')
    toasts.push({
      id:     `err-${integId}`,
      type:   'error',
      label:  isPartial ? 'Synced with issues' : 'Sync failed',
      detail: errMsg,
    })
  }

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map(toast => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={cn(
              'flex items-start gap-3 px-4 py-3 rounded-xl shadow-xl pointer-events-auto',
              'min-w-[240px] max-w-[360px] border',
              toast.type === 'error'
                ? 'bg-red-950/90 border-red-700/40 backdrop-blur-sm'
                : 'bg-surface-800/95 border-white/10 backdrop-blur-sm'
            )}
          >
            {/* Icon */}
            <span className="shrink-0 mt-0.5">
              {toast.type === 'progress' && (
                <Loader2 size={14} className="animate-spin text-accent-400" />
              )}
              {toast.type === 'success' && (
                <CheckCircle2 size={14} className="text-green-400" />
              )}
              {toast.type === 'error' && (
                <AlertCircle size={14} className="text-red-400" />
              )}
            </span>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-zinc-200">{toast.label}</p>
              {toast.detail && (
                <p className={cn(
                  'text-xs text-zinc-500 mt-0.5',
                  // Progress details are short ("Syncing modules · Course X") and
                  // stay single-line. Error/partial details now include
                  // course + phase context and can be long, so let them wrap
                  // and scroll instead of silently clipping to one line —
                  // that context is exactly what you need to diagnose a 403.
                  toast.type === 'error' ? 'whitespace-pre-wrap max-h-32 overflow-y-auto' : 'truncate'
                )}>
                  {toast.detail}
                </p>
              )}
            </div>

            {/* Dismiss (errors only — progress toasts auto-clear) */}
            {toast.type === 'error' && (
              <button
                onClick={() => setDismissed(d => new Set([...d, toast.id]))}
                className="shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors"
              >
                <X size={12} />
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
