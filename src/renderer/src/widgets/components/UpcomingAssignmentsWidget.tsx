import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { CalendarCheck2 } from 'lucide-react'
import { useWidgetData } from '../WidgetDataContext'
import { WidgetLoading, WidgetEmpty } from '../WidgetStates'
import type { WidgetProps } from '../types'

// Upcoming (not-yet-due, still pending) assignments. `count` config caps the list.
export default function UpcomingAssignmentsWidget({ config, editing }: WidgetProps) {
  const { assignments, loading } = useWidgetData()
  const count = typeof config.count === 'number' ? config.count : 6

  const upcoming = useMemo(() => {
    const now = Date.now()
    return assignments
      .filter(a => a.dueAt && a.dueAt >= now &&
        (!a.grade || a.grade.workflowState === 'unsubmitted'))
      .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0))
      .slice(0, count)
  }, [assignments, count])

  if (loading) return <WidgetLoading />
  if (upcoming.length === 0)
    return <WidgetEmpty icon={<CalendarCheck2 size={18} />} message="Nothing due ahead — you're clear." />

  return (
    <div className="h-full overflow-y-auto -mx-1">
      <div className="divide-y divide-white/[0.05]">
        {upcoming.map(a => {
          const row = (
            <div className="flex items-center gap-2.5 px-1 py-2">
              <span className="w-0.5 self-stretch rounded-full shrink-0"
                style={{ background: a.course?.color ?? '#6366f1' }} />
              <div className="flex-1 min-w-0">
                <p className="t-body text-zinc-200 truncate">{a.title}</p>
                <p className="t-caption text-zinc-500 truncate">{a.course?.name}</p>
              </div>
              {a.dueAt && (
                <span className="tnum t-caption text-zinc-400 shrink-0">{format(a.dueAt, 'MMM d')}</span>
              )}
            </div>
          )
          return editing
            ? <div key={a.id}>{row}</div>
            : <Link key={a.id} to={`/assignments/${a.id}`}
                className="block hover:bg-surface-700/50 transition-colors duration-100">{row}</Link>
        })}
      </div>
    </div>
  )
}
