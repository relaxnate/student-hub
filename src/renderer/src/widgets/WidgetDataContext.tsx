import { createContext, useContext, type ReactNode } from 'react'
import { useDashboardData, type DashboardData } from '../pages/Dashboard/useDashboardData'
import { useCumulativeGpa } from '../pages/Dashboard/useCumulativeGpa'
import { useAppStore } from '../store/app.store'

// Shared data for all widgets on the canvas — fetched ONCE here and read by the
// data-driven widgets (UpcomingAssignments, GradesSummary, Today, QuickStats,
// SyncStatus) so we don't issue N parallel fetches per widget. Self-contained
// widgets (Clock, Quote, Notes, CustomImage) ignore it.

export interface WidgetData extends DashboardData {
  /** Cumulative GPA over ALL courses (current + history) — matches the Calculator. */
  gpa: number | null
}

const WidgetDataCtx = createContext<WidgetData | null>(null)

export function WidgetDataProvider({ children }: { children: ReactNode }) {
  const isSyncing = useAppStore(s => s.isSyncing)
  // Active courses for assignment-driven widgets; GPA is cumulative (all courses).
  const data = useDashboardData(isSyncing, false)
  const gpa  = useCumulativeGpa(isSyncing)
  return <WidgetDataCtx.Provider value={{ ...data, gpa }}>{children}</WidgetDataCtx.Provider>
}

export function useWidgetData(): WidgetData {
  const ctx = useContext(WidgetDataCtx)
  if (!ctx) throw new Error('useWidgetData must be used within a WidgetDataProvider')
  return ctx
}
