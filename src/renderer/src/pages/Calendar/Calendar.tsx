import { useEffect, useState, useMemo, useCallback } from 'react'
import { ChevronLeft, ChevronRight, X, Plus, Bell, BookOpen, Repeat } from 'lucide-react'
import {
  startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay,
  addMonths, subMonths, startOfWeek, endOfWeek, format, isToday
} from 'date-fns'
import { api } from '../../lib/ipc'
import { cn, getDueUrgency } from '../../lib/utils'
import { Skeleton, SectionHeader } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import SmartReminders from './SmartReminders'
import ReminderDialog from './ReminderDialog'
import type { Assignment, Course, CalendarEvent, Reminder, ReminderOccurrence } from '@shared/types/entities'

type EventKind = 'assignment' | 'event' | 'reminder'
interface DayEvent {
  id: string
  title: string
  color: string
  type: EventKind
  urgent: boolean
  time?: string | null
  repeat?: boolean
  reminder?: Reminder   // present when type === 'reminder' (for edit)
}

const fmtKey = (d: Date | number) => format(d, 'yyyy-MM-dd')

export default function Calendar() {
  const [viewDate, setViewDate] = useState(new Date())
  const [courses, setCourses] = useState<Course[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [reminders, setReminders] = useState<ReminderOccurrence[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)

  // Reminder dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogDate, setDialogDate] = useState(fmtKey(new Date()))
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null)

  // The full visible grid (includes leading/trailing days of adjacent months).
  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewDate), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(viewDate), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [viewDate])

  const loadReminders = useCallback(async () => {
    const start = startOfWeek(startOfMonth(viewDate), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(viewDate), { weekStartsOn: 1 })
    const res = await api.reminders.getRange({ startDate: fmtKey(start), endDate: fmtKey(end) })
    setReminders(res.ok ? res.data : [])
  }, [viewDate])

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
      await loadReminders()
      setLoading(false)
    }
    load()
  }, [viewDate, loadReminders])

  const eventMap = useMemo(() => {
    const courseMap = new Map(courses.map(c => [c.id, c]))
    const map = new Map<string, DayEvent[]>()
    const push = (key: string, ev: DayEvent) => map.set(key, [...(map.get(key) ?? []), ev])

    for (const a of assignments) {
      if (!a.dueAt) continue
      const course = courseMap.get(a.courseId)
      const urgency = getDueUrgency(a.dueAt)
      push(fmtKey(a.dueAt), {
        id: a.id, title: a.title, color: course?.color ?? '#6366f1',
        type: 'assignment', urgent: urgency === 'urgent' || urgency === 'overdue',
      })
    }
    for (const e of events) {
      push(fmtKey(e.startAt), { id: e.id, title: e.title, color: '#3b82f6', type: 'event', urgent: false })
    }
    for (const r of reminders) {
      push(r.occurrenceDate, {
        id: `${r.id}@${r.occurrenceDate}`, title: r.title, color: r.color,
        type: 'reminder', urgent: false, time: r.time, repeat: r.repeat !== 'none',
        reminder: r,
      })
    }
    // Sort each day: reminders with a time first (chronological), then all-day, then assignments/events.
    for (const [k, list] of map) {
      list.sort((a, b) => {
        if (a.type === 'reminder' && b.type === 'reminder') return (a.time ?? '99').localeCompare(b.time ?? '99')
        return 0
      })
      map.set(k, list)
    }
    return map
  }, [assignments, events, reminders, courses])

  const selectedDayEvents = selectedDay ? eventMap.get(fmtKey(selectedDay)) ?? [] : []

  const openNewReminder = (date: Date | null) => {
    setEditingReminder(null)
    setDialogDate(fmtKey(date ?? new Date()))
    setDialogOpen(true)
  }
  const openEditReminder = (r: Reminder) => {
    setEditingReminder(r)
    setDialogDate(r.date)
    setDialogOpen(true)
  }

  if (loading) return (
    <div className="h-full flex gap-0">
      <div className="flex-1 p-6 space-y-4">
        <Skeleton className="w-48 h-6" />
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </div>
      <div className="w-80 border-l border-white/5 p-4 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="w-full h-20 rounded-xl" />
        ))}
      </div>
    </div>
  )

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-3 flex items-center justify-between shrink-0 border-b border-white/5">
        <SectionHeader title={format(viewDate, 'MMMM yyyy')} />
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => openNewReminder(selectedDay)}>
            Reminder
          </Button>
          <div className="w-px h-5 bg-white/10 mx-1" />
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
              const key = fmtKey(day)
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
                        {e.type === 'reminder'
                          ? <Bell size={8} className="shrink-0" style={{ color: e.color }} />
                          : <div className="w-1 h-1 rounded-full shrink-0" style={{ background: e.color }} />}
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
                <div className="flex items-center gap-1">
                  <button onClick={() => openNewReminder(selectedDay)} title="Add reminder"
                    className="w-6 h-6 rounded flex items-center justify-center text-zinc-500 hover:text-accent-300 hover:bg-surface-700 transition-colors"><Plus size={14} /></button>
                  <button onClick={() => setSelectedDay(null)}
                    className="w-6 h-6 rounded flex items-center justify-center text-zinc-600 hover:text-zinc-300 transition-colors"><X size={14} /></button>
                </div>
              </div>
              {selectedDayEvents.length === 0 ? (
                <button onClick={() => openNewReminder(selectedDay)} className="text-xs text-zinc-600 hover:text-accent-300 transition-colors">
                  Nothing scheduled — add a reminder
                </button>
              ) : (
                <div className="space-y-2">
                  {selectedDayEvents.map(e => (
                    <button key={e.id}
                      onClick={() => e.type === 'reminder' && e.reminder && openEditReminder(e.reminder)}
                      disabled={e.type !== 'reminder'}
                      className={cn('w-full text-left p-2.5 rounded-lg border text-xs flex items-start gap-2',
                        e.type === 'reminder' && 'hover:brightness-125 transition-all cursor-pointer')}
                      style={{ borderColor: `${e.color}33`, background: `${e.color}11` }}>
                      {e.type === 'reminder'
                        ? <Bell size={12} className="mt-0.5 shrink-0" style={{ color: e.color }} />
                        : <BookOpen size={12} className="mt-0.5 shrink-0" style={{ color: e.color }} />}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate" style={{ color: e.color }}>{e.title}</p>
                        <p className="text-zinc-500 mt-0.5 flex items-center gap-1.5">
                          <span className="capitalize">{e.type === 'reminder' ? 'Reminder' : e.type === 'assignment' ? 'Assignment' : 'Event'}</span>
                          {e.type === 'reminder' && e.time && <span>· {e.time}</span>}
                          {e.repeat && <Repeat size={9} className="text-zinc-600" />}
                        </p>
                      </div>
                    </button>
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

      <ReminderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultDate={dialogDate}
        editing={editingReminder}
        onSaved={loadReminders}
      />
    </div>
  )
}
