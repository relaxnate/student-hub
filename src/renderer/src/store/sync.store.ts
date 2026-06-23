import { create } from 'zustand'
import type { SyncProgress, IntegrationProvider } from '@shared/types/entities'

interface SyncEntry {
  integrationId: string
  provider:      IntegrationProvider
  phase:         string
  courseName?:   string
  courseIndex?:  number
  totalCourses?: number
}

interface SyncState {
  progress: Record<string, SyncEntry>
  errors:   Record<string, string>
  setProgress:   (p: SyncProgress) => void
  setError:      (integrationId: string, error: string) => void
  clearProgress: (integrationId: string) => void
  clearAll:      () => void
}

export const useSyncStore = create<SyncState>((set) => ({
  progress: {},
  errors:   {},

  setProgress: p => set(s => ({
    progress: {
      ...s.progress,
      [p.integrationId]: {
        integrationId: p.integrationId,
        provider:      p.provider,
        phase:         p.phase,
        courseName:    p.courseName,
        courseIndex:   p.courseIndex,
        totalCourses:  p.totalCourses,
      },
    },
    errors: { ...s.errors, [p.integrationId]: '' },
  })),

  setError: (integrationId, error) => set(s => ({
    errors: { ...s.errors, [integrationId]: error },
  })),

  clearProgress: integrationId => set(s => {
    const next = { ...s.progress }
    delete next[integrationId]
    return { progress: next }
  }),

  clearAll: () => set({ progress: {}, errors: {} }),
}))
