import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { BarChart2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useWidgetData } from '../WidgetDataContext'
import { WidgetLoading, WidgetEmpty } from '../WidgetStates'
import type { WidgetProps } from '../types'

const color = (p: number | null) =>
  p == null ? 'text-zinc-500' : p >= 90 ? 'text-green-400' : p >= 70 ? 'text-amber-400' : 'text-red-400'
const bar = (p: number | null) =>
  p == null ? 'bg-zinc-600' : p >= 90 ? 'bg-green-500' : p >= 70 ? 'bg-amber-500' : 'bg-red-500'

// Per-course current grade (LMS-official currentScore). `count` caps the list.
export default function GradesSummaryWidget({ config, editing }: WidgetProps) {
  const { courses, loading } = useWidgetData()
  const count = typeof config.count === 'number' ? config.count : 6

  const list = useMemo(() => courses.slice(0, count), [courses, count])

  if (loading) return <WidgetLoading />
  if (courses.length === 0)
    return <WidgetEmpty icon={<BarChart2 size={18} />} message="No courses synced." />

  return (
    <div className="h-full overflow-y-auto -mx-1">
      {list.map(c => {
        const pct = c.currentScore
        const inner = (
          <div className="flex items-center gap-2.5 px-1 py-1.5">
            <span className="w-[3px] h-7 rounded-full shrink-0" style={{ background: c.color ?? '#6366f1' }} />
            <div className="flex-1 min-w-0">
              <p className="t-body text-zinc-200 truncate">{c.name}</p>
              <div className="mt-1 h-1 rounded-full bg-surface-600 overflow-hidden">
                <div className={cn('h-full rounded-full', bar(pct))}
                  style={{ width: `${Math.max(0, Math.min(100, pct ?? 0))}%` }} />
              </div>
            </div>
            <span className={cn('tnum t-body shrink-0 w-10 text-right', color(pct))}>
              {pct == null ? '—' : `${pct.toFixed(0)}%`}
            </span>
          </div>
        )
        return editing
          ? <div key={c.id}>{inner}</div>
          : <Link key={c.id} to={`/courses/${c.id}`}
              className="block rounded-md hover:bg-surface-700/50 transition-colors duration-100">{inner}</Link>
      })}
    </div>
  )
}
