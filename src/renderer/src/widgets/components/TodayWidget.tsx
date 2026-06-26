import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { format, isToday } from 'date-fns'
import { CheckCircle2 } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { useWidgetData } from '../WidgetDataContext'
import { WidgetLoading } from '../WidgetStates'
import type { WidgetProps } from '../types'

// Today's pending work + anything overdue. Mirrors the DashboardHome "Today" rail.
export default function TodayWidget({ editing }: WidgetProps) {
  const { assignments, loading } = useWidgetData()

  const { overdue, today } = useMemo(() => {
    const now = Date.now()
    const isPending = (a: typeof assignments[number]) =>
      !a.grade || a.grade.workflowState === 'unsubmitted'
    return {
      overdue: assignments
        .filter(a => a.dueAt && a.dueAt < now && !isToday(a.dueAt) && isPending(a))
        .sort((a, b) => (b.dueAt ?? 0) - (a.dueAt ?? 0)),
      today: assignments
        .filter(a => a.dueAt && isToday(a.dueAt) && isPending(a))
        .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0)),
    }
  }, [assignments])

  if (loading) return <WidgetLoading />

  if (overdue.length === 0 && today.length === 0) {
    return (
      <div className="h-full flex items-center gap-2.5">
        <CheckCircle2 size={18} className="text-green-400 shrink-0" />
        <div>
          <p className="t-body text-zinc-200">You're clear for today</p>
          <p className="t-caption text-zinc-500">Nothing due — nice work.</p>
        </div>
      </div>
    )
  }

  const render = (a: typeof assignments[number], isOverdue: boolean) => {
    const inner = (
      <div className="flex items-center gap-2.5 px-1 py-2">
        <span className="w-0.5 self-stretch rounded-full shrink-0"
          style={{ background: a.course?.color ?? '#6366f1' }} />
        <div className="flex-1 min-w-0">
          <p className="t-body text-zinc-200 truncate">{a.title}</p>
          <p className="t-caption text-zinc-500 truncate">{a.course?.name}</p>
        </div>
        {isOverdue
          ? <Badge variant="danger">Overdue</Badge>
          : a.dueAt && <span className="tnum t-caption text-zinc-400 shrink-0">{format(a.dueAt, 'h:mm a')}</span>}
      </div>
    )
    return editing
      ? <div key={a.id}>{inner}</div>
      : <Link key={a.id} to={`/assignments/${a.id}`}
          className="block hover:bg-surface-700/50 transition-colors duration-100">{inner}</Link>
  }

  return (
    <div className="h-full overflow-y-auto -mx-1">
      <div className="divide-y divide-white/[0.05]">
        {overdue.map(a => render(a, true))}
        {today.map(a => render(a, false))}
      </div>
    </div>
  )
}
