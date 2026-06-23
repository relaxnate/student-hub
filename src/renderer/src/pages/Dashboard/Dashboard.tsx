import { useEffect, useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DndContext, PointerSensor, useSensor, useSensors,
  closestCenter, DragEndEvent, DraggableAttributes,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, rectSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  GripVertical, Clock, AlertCircle, CheckCircle2, BookOpen,
  BarChart2, Calendar, ShieldAlert, TrendingUp, ChevronDown,
  ChevronUp, Pin, PinOff, EyeOff, RefreshCw, Maximize2, Minimize2,
  Plus, Pencil, Check,
} from 'lucide-react'
import { api } from '../../lib/ipc'
import { cn, formatDueDate, getDueUrgency } from '../../lib/utils'
import { Spinner, Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { useAppStore } from '../../store/app.store'
import { useWorkspaceStore } from '../../store/workspace.store'
import type { Course, Assignment, Grade } from '@shared/types/entities'
import type { WidgetConfig, WidgetSize, WidgetType } from '@shared/types/ipc'

// ─── Widget meta ──────────────────────────────────────────────────────────────

const WIDGET_META: Record<WidgetType, { label: string; icon: React.ReactNode; minSize: WidgetSize }> = {
  stats:          { label: 'Quick Stats',    icon: <BarChart2 size={13} />,   minSize: 'full'   },
  upcoming:       { label: 'Upcoming',       icon: <Clock size={13} />,        minSize: 'medium' },
  overdue:        { label: 'Overdue',        icon: <AlertCircle size={13} />,  minSize: 'medium' },
  courses:        { label: 'Courses',        icon: <BookOpen size={13} />,     minSize: 'medium' },
  grades:         { label: 'Grades',         icon: <CheckCircle2 size={13} />, minSize: 'small'  },
  calendar:       { label: 'Calendar',       icon: <Calendar size={13} />,     minSize: 'medium' },
  'grade-rescue': { label: 'Grade Rescue',   icon: <ShieldAlert size={13} />,  minSize: 'medium' },
  gpa:            { label: 'GPA',            icon: <TrendingUp size={13} />,   minSize: 'small'  },
}

const SIZE_CYCLE: WidgetSize[] = ['small', 'medium', 'large', 'full']
const SIZE_LABELS: Record<WidgetSize, string> = {
  small: 'S', medium: 'M', large: 'L', full: 'Full',
}

// ─── Shared data context ──────────────────────────────────────────────────────
// Rather than each widget fetching independently, we load once at the top and
// pass data down as props. This avoids N×M parallel requests.

interface DashboardData {
  courses:     Course[]
  assignments: (Assignment & { course?: Course; grade?: Grade })[]
  loading:     boolean
}

function useDashboardData(isSyncing: boolean, showHistory: boolean): DashboardData {
  const [courses,     setCourses]     = useState<Course[]>([])
  const [assignments, setAssignments] = useState<(Assignment & { course?: Course; grade?: Grade })[]>([])
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const cRes = await (showHistory ? api.courses.getAllIncludingInactive() : api.courses.getAll())
      if (!cRes.ok || cancelled) { setLoading(false); return }
      const courseList = cRes.data
      const courseMap  = new Map(courseList.map((c: Course) => [c.id, c]))
      if (!cancelled) setCourses(courseList)

      const all: (Assignment & { course?: Course; grade?: Grade })[] = []
      await Promise.all(courseList.map(async (c: Course) => {
        const [aRes, gRes] = await Promise.all([
          api.assignments.getByCourse(c.id),
          api.grades.getByCourse(c.id),
        ])
        if (cancelled) return
        const gMap = new Map((gRes.ok ? gRes.data : []).map((g: Grade) => [g.assignmentId, g]))
        if (aRes.ok) aRes.data.forEach((a: Assignment) => all.push({
          ...a,
          course: courseMap.get(a.courseId) as Course | undefined,
          grade:  gMap.get(a.id) as Grade | undefined,
        }))
      }))
      if (!cancelled) { setAssignments(all); setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [isSyncing, showHistory])

  return { courses, assignments, loading }
}

// ─── Widget toolbar ───────────────────────────────────────────────────────────

function WidgetToolbar({ widget, dragListeners, dragAttributes, onUpdate, onHide }: {
  widget: WidgetConfig
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dragListeners:  Record<string, any> | undefined
  dragAttributes: DraggableAttributes
  onUpdate: (patch: Partial<WidgetConfig>) => void
  onHide:   () => void
}) {
  const meta     = WIDGET_META[widget.type]
  const sizeIdx  = SIZE_CYCLE.indexOf(widget.size)
  const canGrow  = sizeIdx < SIZE_CYCLE.length - 1
  const canShrink= sizeIdx > 0

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-white/6">
      {/* Drag handle */}
      <button {...dragListeners} {...dragAttributes}
        className="cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400 touch-none">
        <GripVertical size={13} />
      </button>

      {/* Icon + label */}
      <span className="text-zinc-500 ml-0.5">{meta.icon}</span>
      <span className="text-xs font-medium text-zinc-400 flex-1">{meta.label}</span>

      {/* Pin */}
      <button onClick={() => onUpdate({ pinned: !widget.pinned })}
        title={widget.pinned ? 'Unpin' : 'Pin to top'}
        className={cn('p-1 rounded hover:bg-white/8 transition-colors',
          widget.pinned ? 'text-accent-400' : 'text-zinc-600 hover:text-zinc-400')}>
        {widget.pinned ? <Pin size={11} /> : <PinOff size={11} />}
      </button>

      {/* Collapse */}
      <button onClick={() => onUpdate({ collapsed: !widget.collapsed })}
        title={widget.collapsed ? 'Expand' : 'Collapse'}
        className="p-1 rounded text-zinc-600 hover:text-zinc-400 hover:bg-white/8 transition-colors">
        {widget.collapsed ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
      </button>

      {/* Size − */}
      <button onClick={() => canShrink && onUpdate({ size: SIZE_CYCLE[sizeIdx - 1] })}
        disabled={!canShrink}
        title="Shrink"
        className="p-1 rounded text-zinc-600 hover:text-zinc-400 hover:bg-white/8 transition-colors disabled:opacity-30">
        <Minimize2 size={11} />
      </button>

      {/* Size badge */}
      <span className="text-2xs text-zinc-600 font-mono w-5 text-center">
        {SIZE_LABELS[widget.size]}
      </span>

      {/* Size + */}
      <button onClick={() => canGrow && onUpdate({ size: SIZE_CYCLE[sizeIdx + 1] })}
        disabled={!canGrow}
        title="Grow"
        className="p-1 rounded text-zinc-600 hover:text-zinc-400 hover:bg-white/8 transition-colors disabled:opacity-30">
        <Maximize2 size={11} />
      </button>

      {/* Hide */}
      <button onClick={onHide} title="Hide widget"
        className="p-1 rounded text-zinc-700 hover:text-red-400 hover:bg-white/8 transition-colors">
        <EyeOff size={11} />
      </button>
    </div>
  )
}

// ─── Widget content components ────────────────────────────────────────────────

function StatsContent({ data }: { data: DashboardData }) {
  const now      = Date.now()
  const upcoming = data.assignments.filter(a => a.dueAt && a.dueAt > now && (!a.grade || a.grade.workflowState === 'unsubmitted')).length
  const overdue  = data.assignments.filter(a => a.dueAt && a.dueAt < now && (!a.grade || a.grade.workflowState === 'unsubmitted')).length
  const graded   = data.assignments.filter(a => a.grade?.workflowState === 'graded').length
  return (
    <div className="grid grid-cols-3 gap-2 p-3">
      {[
        { label: 'Upcoming', value: upcoming, color: 'text-accent-400',  icon: <Clock size={14} /> },
        { label: 'Overdue',  value: overdue,  color: overdue > 0 ? 'text-red-400' : 'text-zinc-400', icon: <AlertCircle size={14} /> },
        { label: 'Graded',   value: graded,   color: 'text-green-400', icon: <CheckCircle2 size={14} /> },
      ].map(s => (
        <div key={s.label} className="text-center">
          <div className={cn('flex justify-center mb-1', s.color)}>{s.icon}</div>
          <p className="text-xl font-bold text-zinc-100">{s.value}</p>
          <p className="text-2xs text-zinc-500">{s.label}</p>
        </div>
      ))}
    </div>
  )
}

function UpcomingContent({ data, compact }: { data: DashboardData; compact?: boolean }) {
  const now   = Date.now()
  const items = useMemo(() =>
    data.assignments
      .filter(a => a.dueAt && a.dueAt > now && (!a.grade || a.grade.workflowState === 'unsubmitted'))
      .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0))
      .slice(0, compact ? 4 : 8)
  , [data.assignments, now, compact])

  if (!items.length) return <p className="text-xs text-zinc-600 p-4 text-center">Nothing due soon</p>
  return (
    <div className="divide-y divide-white/4">
      {items.map(a => {
        const urgency = getDueUrgency(a.dueAt)
        return (
          <Link key={a.id} to={`/assignments/${a.id}`}
            className="flex items-center gap-2 px-3 py-2 hover:bg-white/4 transition-colors">
            <div className={cn('w-1 h-5 rounded-full shrink-0',
              urgency === 'urgent' || urgency === 'overdue' ? 'bg-red-500' :
              urgency === 'soon' ? 'bg-amber-500' : 'bg-zinc-600')} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-zinc-200 truncate">{a.title}</p>
              {!compact && <p className="text-2xs text-zinc-500 truncate">{a.course?.name}</p>}
            </div>
            {a.dueAt && <p className={cn('text-2xs shrink-0',
              urgency === 'urgent' ? 'text-red-400' : urgency === 'soon' ? 'text-amber-400' : 'text-zinc-500')}>
              {formatDueDate(a.dueAt)}
            </p>}
          </Link>
        )
      })}
    </div>
  )
}

function OverdueContent({ data, compact }: { data: DashboardData; compact?: boolean }) {
  const now   = Date.now()
  const items = useMemo(() =>
    data.assignments
      .filter(a => a.dueAt && a.dueAt < now && (!a.grade || a.grade.workflowState === 'unsubmitted'))
      .sort((a, b) => (b.dueAt ?? 0) - (a.dueAt ?? 0))
      .slice(0, compact ? 4 : 6)
  , [data.assignments, now, compact])

  if (!items.length) return <p className="text-xs text-zinc-600 p-4 text-center">No overdue work</p>
  return (
    <div className="divide-y divide-white/4">
      {items.map(a => (
        <Link key={a.id} to={`/assignments/${a.id}`}
          className="flex items-center gap-2 px-3 py-2 hover:bg-red-900/10 transition-colors">
          <AlertCircle size={11} className="text-red-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-zinc-200 truncate">{a.title}</p>
            {!compact && <p className="text-2xs text-zinc-500 truncate">{a.course?.name}</p>}
          </div>
          <Badge variant="danger">Overdue</Badge>
        </Link>
      ))}
    </div>
  )
}

function CoursesContent({ data, compact }: { data: DashboardData; compact?: boolean }) {
  const courses = data.courses.slice(0, compact ? 4 : 8)
  if (!courses.length) return <p className="text-xs text-zinc-600 p-4 text-center">No courses synced</p>
  return (
    <div className={cn('p-3 grid gap-2', compact ? 'grid-cols-2' : 'grid-cols-2')}>
      {courses.map(c => (
        <Link key={c.id} to={`/courses/${c.id}`}
          className="flex items-center gap-2 p-2 rounded-lg bg-surface-700 hover:bg-surface-600 border border-white/5 transition-colors">
          <div className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-white text-xs font-bold"
            style={{ background: c.color ?? '#6366f1' }}>
            {c.name[0]}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-2xs font-medium text-zinc-200 truncate">{c.name}</p>
            {c.currentScore != null && (
              <p className={cn('text-2xs font-bold', c.currentScore >= 80 ? 'text-green-400' : c.currentScore >= 60 ? 'text-amber-400' : 'text-red-400')}>
                {c.currentScore.toFixed(1)}%
              </p>
            )}
          </div>
        </Link>
      ))}
    </div>
  )
}

function GradesContent({ data }: { data: DashboardData }) {
  const scored = data.assignments.filter(a => a.grade?.workflowState === 'graded' && a.grade.score != null && a.pointsPossible)
  const avg = scored.length
    ? scored.reduce((s, a) => s + (a.grade!.score! / a.pointsPossible!) * 100, 0) / scored.length
    : null
  return (
    <div className="p-3 space-y-2">
      {avg !== null ? (
        <div className="text-center">
          <p className={cn('text-3xl font-bold',
            avg >= 80 ? 'text-green-400' : avg >= 60 ? 'text-amber-400' : 'text-red-400')}>
            {avg.toFixed(1)}%
          </p>
          <p className="text-2xs text-zinc-500 mt-0.5">avg across {scored.length} graded</p>
        </div>
      ) : (
        <p className="text-xs text-zinc-600 text-center py-2">No grades yet</p>
      )}
    </div>
  )
}

function GpaContent({ data }: { data: DashboardData }) {
  const graded = data.courses.filter(c => c.currentScore != null)
  const gpa = graded.length
    ? graded.reduce((s, c) => s + (c.currentScore! / 100) * 4.0, 0) / graded.length
    : null
  return (
    <div className="p-3 text-center">
      {gpa !== null ? (
        <>
          <p className="text-3xl font-bold text-accent-400">{gpa.toFixed(2)}</p>
          <p className="text-2xs text-zinc-500 mt-0.5">Estimated GPA</p>
        </>
      ) : (
        <p className="text-xs text-zinc-600 py-2">No grade data</p>
      )}
    </div>
  )
}

function CalendarContent({ data }: { data: DashboardData }) {
  const now = Date.now()
  const week = now + 7 * 24 * 60 * 60 * 1000
  const events = data.assignments
    .filter(a => a.dueAt && a.dueAt >= now && a.dueAt <= week)
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0))
    .slice(0, 6)
  if (!events.length) return <p className="text-xs text-zinc-600 p-4 text-center">Nothing due this week</p>
  return (
    <div className="divide-y divide-white/4">
      {events.map(a => (
        <Link key={a.id} to={`/assignments/${a.id}`}
          className="flex items-center gap-2 px-3 py-2 hover:bg-white/4 transition-colors">
          <Calendar size={11} className="text-accent-400 shrink-0" />
          <p className="text-xs text-zinc-200 flex-1 truncate">{a.title}</p>
          <p className="text-2xs text-zinc-500 shrink-0">
            {a.dueAt ? new Date(a.dueAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : ''}
          </p>
        </Link>
      ))}
    </div>
  )
}

function GradeRescueContent({ data }: { data: DashboardData }) {
  const now   = Date.now()
  const risks = data.courses.map(c => {
    const missing = data.assignments.filter(a => a.courseId === c.id && a.dueAt && a.dueAt < now && (!a.grade || a.grade.workflowState === 'unsubmitted')).length
    const score   = c.currentScore
    const risk    = score != null && score < 60 ? 'critical' : score != null && score < 75 ? 'warning' : 'safe'
    return { c, missing, score, risk }
  }).filter(x => x.risk !== 'safe' || x.missing > 0).slice(0, 4)

  if (!risks.length) return <p className="text-xs text-zinc-600 p-4 text-center">All courses on track</p>
  return (
    <div className="divide-y divide-white/4">
      {risks.map(({ c, missing, score, risk }) => (
        <Link key={c.id} to="/grade-rescue"
          className="flex items-center gap-2 px-3 py-2 hover:bg-white/4 transition-colors">
          <div className={cn('w-2 h-2 rounded-full shrink-0',
            risk === 'critical' ? 'bg-red-500' : risk === 'warning' ? 'bg-amber-500' : 'bg-green-500')} />
          <p className="text-xs text-zinc-200 flex-1 truncate">{c.name}</p>
          <div className="text-right shrink-0">
            {score != null && <p className={cn('text-2xs font-bold',
              risk === 'critical' ? 'text-red-400' : 'text-amber-400')}>{score.toFixed(0)}%</p>}
            {missing > 0 && <p className="text-2xs text-red-400">{missing} missing</p>}
          </div>
        </Link>
      ))}
    </div>
  )
}

function WidgetContent({ widget, data }: { widget: WidgetConfig; data: DashboardData }) {
  const compact = widget.size === 'small'
  switch (widget.type) {
    case 'stats':        return <StatsContent data={data} />
    case 'upcoming':     return <UpcomingContent data={data} compact={compact} />
    case 'overdue':      return <OverdueContent data={data} compact={compact} />
    case 'courses':      return <CoursesContent data={data} compact={compact} />
    case 'grades':       return <GradesContent data={data} />
    case 'gpa':          return <GpaContent data={data} />
    case 'calendar':     return <CalendarContent data={data} />
    case 'grade-rescue': return <GradeRescueContent data={data} />
    default:             return null
  }
}

// ─── Sortable widget wrapper ──────────────────────────────────────────────────

function SortableWidget({ widget, data, isEditing, onUpdate, onHide }: {
  widget:    WidgetConfig
  data:      DashboardData
  isEditing: boolean
  onUpdate:  (id: string, patch: Partial<WidgetConfig>) => void
  onHide:    (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: widget.id, disabled: widget.pinned || !isEditing })

  const style: React.CSSProperties = {
    transform:  CSS.Transform.toString(transform),
    transition,
    opacity:    isDragging ? 0.5 : 1,
    zIndex:     isDragging ? 50 : undefined,
    gridColumn: widget.size === 'small' ? 'span 1' : widget.size === 'medium' ? 'span 1' : 'span 2',
  }

  return (
    <div ref={setNodeRef} style={style}
      className={cn('bg-surface-800 border border-white/5 rounded-xl overflow-hidden flex flex-col',
        isEditing && 'ring-1 ring-accent-500/20',
        widget.pinned && isEditing && 'ring-accent-500/40',
        isDragging && 'shadow-lg shadow-black/40')}>
      {isEditing && (
        <WidgetToolbar
          widget={widget}
          dragListeners={listeners}
          dragAttributes={attributes}
          onUpdate={patch => onUpdate(widget.id, patch)}
          onHide={() => onHide(widget.id)}
        />
      )}
      <AnimatePresence>
        {!widget.collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden">
            <WidgetContent widget={widget} data={data} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Hidden widget restore tray ───────────────────────────────────────────────

function RestoreTray({ hidden, onRestore }: {
  hidden:    WidgetConfig[]
  onRestore: (id: string) => void
}) {
  if (!hidden.length) return null
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <span className="text-2xs text-zinc-600 self-center">Hidden:</span>
      {hidden.map(w => {
        const meta = WIDGET_META[w.type]
        return (
          <button key={w.id} onClick={() => onRestore(w.id)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface-700 border border-white/5 text-2xs text-zinc-400 hover:text-zinc-200 hover:border-white/15 transition-colors">
            {meta.icon}
            <span>{meta.label}</span>
            <Plus size={9} />
          </button>
        )
      })}
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const isSyncing    = useAppStore(s => s.isSyncing)
  const ws           = useWorkspaceStore()
  const active       = ws.active()
  const showHistory  = active.dashboardShowHistoryCourses ?? false
  const data         = useDashboardData(isSyncing, showHistory)
  const [syncing,   setSyncing]   = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // Sort widgets: pinned first, then by order
  const sortedWidgets = useMemo(() =>
    [...active.widgets].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return a.order - b.order
    })
  , [active.widgets])

  const visible = sortedWidgets.filter(w => w.visible)
  const hidden  = sortedWidgets.filter(w => !w.visible)

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active: dragActive, over } = event
    if (!over || dragActive.id === over.id) return
    const ids      = visible.map(w => w.id)
    const oldIndex = ids.indexOf(dragActive.id as string)
    const newIndex = ids.indexOf(over.id as string)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(visible, oldIndex, newIndex)
    const updated   = active.widgets.map(w => {
      const idx = reordered.findIndex(r => r.id === w.id)
      return idx !== -1 ? { ...w, order: idx } : w
    })
    ws.updateWidgets(updated)
  }, [visible, active.widgets, ws])

  const handleUpdate = useCallback((id: string, patch: Partial<WidgetConfig>) => {
    ws.updateWidget(id, patch)
  }, [ws])

  const handleHide = useCallback((id: string) => {
    ws.updateWidget(id, { visible: false })
  }, [ws])

  const handleRestore = useCallback((id: string) => {
    ws.updateWidget(id, { visible: true })
  }, [ws])

  const handleSync = async () => {
    setSyncing(true)
    await api.sync.startAll()
    setSyncing(false)
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full overflow-y-auto">
      <div className="p-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-zinc-100 flex items-center gap-2">
              <span>{active.icon}</span>
              {active.name}
            </h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {data.courses.length} course{data.courses.length !== 1 ? 's' : ''} synced
            </p>
          </div>
          <Button variant="secondary" size="sm" icon={<RefreshCw size={12} />}
            loading={syncing || isSyncing} onClick={handleSync}>
            {(syncing || isSyncing) ? 'Syncing...' : 'Sync now'}
          </Button>
        </div>

        {data.loading ? (
          <div className="flex items-center justify-center h-40"><Spinner size={20} /></div>
        ) : (
          <>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={visible.map(w => w.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-2 gap-4">
                  {visible.map(widget => (
                    <SortableWidget
                      key={widget.id}
                      widget={widget}
                      data={data}
                      isEditing={isEditing}
                      onUpdate={handleUpdate}
                      onHide={handleHide}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            {isEditing && <RestoreTray hidden={hidden} onRestore={handleRestore} />}
          </>
        )}
      </div>

      {/* Edit bar — bottom of the page, only visible when editing */}
      {isEditing && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2 rounded-full bg-surface-800 border border-white/10 shadow-lg text-xs text-zinc-400">
          <span className="text-zinc-600">Dashboard options:</span>
          <label className="flex items-center gap-2 cursor-pointer">
            <button role="switch" aria-checked={showHistory}
              onClick={() => ws.setDashboardShowHistory(!showHistory)}
              className={cn('relative w-8 h-4 rounded-full transition-colors shrink-0',
                showHistory ? 'bg-accent-500' : 'bg-surface-600')}>
              <span className={cn('absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform',
                showHistory ? 'translate-x-4' : 'translate-x-0')} />
            </button>
            <span className={showHistory ? 'text-zinc-200' : ''}>Show history courses</span>
          </label>
        </div>
      )}

      {/* Floating edit-mode toggle — bottom-right of the page */}
      <button
        onClick={() => setIsEditing(v => !v)}
        className={cn(
          'fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg border text-sm font-medium transition-all',
          isEditing
            ? 'bg-accent-500 border-accent-400 text-white shadow-accent-500/25'
            : 'bg-surface-800 border-white/10 text-zinc-400 hover:text-zinc-200 hover:border-white/20'
        )}
      >
        {isEditing ? <Check size={14} /> : <Pencil size={14} />}
        {isEditing ? 'Done editing' : 'Edit layout'}
      </button>
    </motion.div>
  )
}
