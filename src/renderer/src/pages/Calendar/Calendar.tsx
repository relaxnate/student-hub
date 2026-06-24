import { useEffect, useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import {
  startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay,
  addMonths, subMonths, startOfWeek, endOfWeek, format, isToday
} from 'date-fns'
import { api } from '../../lib/ipc'
import { cn, getDueUrgency } from '../../lib/utils'
import { Spinner, SectionHeader } from '../../components/ui/Badge'
import SmartReminders from './SmartReminders'
import type { Assignment, Course, CalendarEvent } from '@shared/types/entities'

interface DayEvent {
  id: string; title: string; color: string; type: 'assignment' | 'event'; urgent: boolean
}

export default function Calendar() {
  const [viewDate, setViewDate] = useState(new Date())
  const [courses, setCourses] = useState<Course[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)

  useEffect(() => {
    const load = async () => {
      const courseResult = await api.courses.getAll()
      if (!courseResult.ok) { setLoading(false); return }
      setCourses(courseResult.data)
      const allA = await Promise.all(courseResult.data.map((c: Course) => api.assignments.getByCourse(c.id)))
      setAssignments(allA.flatMap((r: { ok: boolean; data: Assignment[] }) => r.ok ? r.data : []))
      const evResult = await api.calendar.getRange({
        startMs: startOfMonth(viewDate).getTime(),
        endMs: endOfMonth(viewDate).getTime(),
      })
      setEvents(evResult.ok ? evResult.data : [])
      setLoading(false)
    }
    load()
  }, [viewDate])

  const eventMap = useMemo(() => {
    const courseMap = new Map(courses.map(c => [c.id, c]))
    const map = new Map<string, DayEvent[]>()
    for (const a of assignments) {
      if (!a.dueAt) continue
      const key = format(new Date(a.dueAt), 'yyyy-MM-dd')
      const course = courseMap.get(a.courseId)
      const urgency = getDueUrgency(a.dueAt)
      map.set(key, [...(map.get(key) ?? []), {
        id: a.id, title: a.title, color: course?.color ?? '#6366f1',
        type: 'assignment', urgent: urgency === 'urgent' || urgency === 'overdue'
      }])
    }
    for (const e of events) {
      const key = format(new Date(e.startAt), 'yyyy-MM-dd')
      map.set(key, [...(map.get(key) ?? []), { id: e.id, title: e.title, color: '#3b82f6', type: 'event', urgent: false }])
    }
    return map
  }, [assignments, events, courses])

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewDate), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(viewDate), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [viewDate])

  const selectedDayEvents = selectedDay ? eventMap.get(format(selectedDay, 'yyyy-MM-dd')) ?? [] : []

  if (loading) return <div className="flex items-center justify-center h-full"><Spinner size={20} /></div>

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-3 flex items-center justify-between shrink-0 border-b border-white/5">
        <SectionHeader title={format(viewDate, 'MMMM yyyy')} />
        <div className="flex items-center gap-1">
          <button onClick={() => setViewDate(d => subMonths(d, 1))} className="w-8 h-8 rounded-md flex items-center justify-center text-zinc-400 hover:text-zinc-200 hover:bg-surface-700 transition-colors"><ChevronLeft size={16} /></button>
          <button onClick={() => setViewDate(new Date())} className="px-3 h-8 rounded-md text-xs text-zinc-400 hover:text-zinc-200 hover:bg-surface-700 transition-colors">Today</button>
          <button onClick={() => setViewDate(d => addMonths(d, 1))} className="w-8 h-8 rounded-md flex items-center justify-center text-zinc-400 hover:text-zinc-200 hover:bg-surface-700 transition-colors"><ChevronRight size={16} /></button>
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-7 mb-1">
            {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
              <div key={d} className="py-1.5 text-center text-xs font-medium text-zinc-600">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-surface-700 rounded-xl overflow-hidden">
            {calendarDays.map(day => {
              const key = format(day, 'yyyy-MM-dd')
              const dayEvents = eventMap.get(key) ?? []
              const inMonth = isSameMonth(day, viewDate)
              const isSelected = selectedDay && isSameDay(day, selectedDay)
              return (
                <button key={key} onClick={() => setSelectedDay(isSameDay(day, selectedDay ?? new Date(0)) ? null : day)}
                  className={cn('min-h-[72px] p-2 text-left transition-colors bg-surface-800', !inMonth && 'opacity-30', isSelected ? 'bg-accent-500/15' : 'hover:bg-surface-700')}>
                  <span className={cn('inline-flex items-center justify-center w-6 h-6 rounded-full text-xs mb-1', isToday(day) ? 'bg-accent-500 text-white font-semibold' : 'text-zinc-400')}>
                    {format(day, 'd')}
                  </span>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 2).map(e => (
                      <div key={e.id} className="flex items-center gap-1 rounded px-1 py-0.5" style={{ background: `${e.color}22` }}>
                        <div className="w-1 h-1 rounded-full shrink-0" style={{ background: e.color }} />
                        <span className="text-2xs truncate" style={{ color: e.color }}>{e.title}</span>
                      </div>
                    ))}
                    {dayEvents.length > 2 && <p className="text-2xs text-zinc-600 pl-1">+{dayEvents.length - 2} more</p>}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
        {/* Right rail: selected-day detail (when a day is picked) stacked above the
            always-present Smart Reminders panel. */}
        <div className="w-[320px] shrink-0 border-l border-white/5 flex flex-col overflow-hidden">
          {selectedDay && (
            <div className="p-4 border-b border-white/5 shrink-0 max-h-[45%] overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-zinc-200">{format(selectedDay, 'EEEE, MMMM d')}</p>
                <button onClick={() => setSelectedDay(null)}
                  className="text-zinc-600 hover:text-zinc-300 transition-colors"><X size={14} /></button>
              </div>
              {selectedDayEvents.length === 0 ? (
                <p className="text-xs text-zinc-600">Nothing due or scheduled.</p>
              ) : (
                <div className="space-y-2">
                  {selectedDayEvents.map(e => (
                    <div key={e.id} className="p-2.5 rounded-lg border text-xs" style={{ borderColor: `${e.color}33`, background: `${e.color}11` }}>
                      <p className="font-medium" style={{ color: e.color }}>{e.title}</p>
                      <p className="text-zinc-500 mt-0.5 capitalize">{e.type}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex-1 overflow-hidden">
            <SmartReminders />
          </div>
        </div>
      </div>
    </div>
  )
}
