import { useMemo } from 'react'
import { isToday } from 'date-fns'
import { BookOpen, CalendarClock, AlertTriangle, TrendingUp } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useWidgetData } from '../WidgetDataContext'
import { WidgetLoading } from '../WidgetStates'
import type { WidgetProps } from '../types'

export default function QuickStatsWidget(_props: WidgetProps) {
  const { courses, assignments, gpa, loading } = useWidgetData()

  const { dueThisWeek, missing } = useMemo(() => {
    const now = Date.now()
    const weekAhead = now + 7 * 86400_000
    const isPending = (a: typeof assignments[number]) =>
      !a.grade || a.grade.workflowState === 'unsubmitted'
    const due = assignments.filter(a =>
      a.dueAt && a.dueAt >= now && a.dueAt <= weekAhead && isPending(a)).length
      + assignments.filter(a => a.dueAt && isToday(a.dueAt) && isPending(a) && a.dueAt < now).length
    const miss = assignments.filter(a =>
      a.dueAt && a.dueAt < now && !isToday(a.dueAt) && isPending(a)).length
    return { dueThisWeek: due, missing: miss }
  }, [assignments])

  if (loading) return <WidgetLoading rows={2} />

  const stats = [
    { label: 'Courses',  value: courses.length, icon: <BookOpen size={13} /> },
    { label: 'Due / wk', value: dueThisWeek,     icon: <CalendarClock size={13} /> },
    { label: 'Missing',  value: missing,         icon: <AlertTriangle size={13} />, danger: missing > 0 },
    { label: 'GPA',      value: gpa == null ? '—' : gpa.toFixed(2), icon: <TrendingUp size={13} /> },
  ]

  return (
    <div className="h-full grid grid-cols-2 gap-2 content-center">
      {stats.map(s => (
        <div key={s.label} className="min-w-0">
          <div className={cn('flex items-center gap-1 mb-0.5', s.danger ? 'text-red-400' : 'text-zinc-500')}>
            {s.icon}<span className="t-micro uppercase tracking-wide truncate">{s.label}</span>
          </div>
          <p className={cn('tnum t-heading', s.danger ? 'text-red-400' : 'text-zinc-100')}>{s.value}</p>
        </div>
      ))}
    </div>
  )
}
