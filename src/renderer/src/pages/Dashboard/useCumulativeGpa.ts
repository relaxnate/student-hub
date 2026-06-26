import { useEffect, useState } from 'react'
import { api } from '../../lib/ipc'
import { computeCumulativeGpa } from '../../lib/gpa'
import type { Course } from '@shared/types/entities'

// Cumulative GPA for the dashboard stat (BUG-011).
//
// GPA is a cumulative academic metric, so it must span EVERY synced course
// (current + history) regardless of which course subset the dashboard is
// currently displaying. We therefore fetch `getAllIncludingInactive()` here —
// independently of `useDashboardData`, whose course list follows the page's
// active/history display filter. This keeps the dashboard GPA equal to the
// Grade & GPA Calculator's overall GPA.
//
// Re-fetches whenever a sync completes (`isSyncing` flips back to false) so the
// number stays fresh after new grades land.
export function useCumulativeGpa(isSyncing: boolean): number | null {
  const [gpa, setGpa] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const res = await api.courses.getAllIncludingInactive()
      if (cancelled || !res.ok) return
      setGpa(computeCumulativeGpa(res.data as Course[]))
    }
    load()
    return () => { cancelled = true }
  }, [isSyncing])

  return gpa
}
