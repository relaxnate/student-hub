import { useEffect, useState, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ClipboardList, AlertCircle, CheckCircle2,
  List, LayoutGrid, ArrowUpDown, Search, Inbox, Upload, SortAsc,
} from 'lucide-react'
import { api } from '../../lib/ipc'
import { cn, formatDueDate, getDueUrgency } from '../../lib/utils'
import { Badge, Skeleton, EmptyState } from '../../components/ui/Badge'
import { CustomSelect } from '../../components/ui/CustomSelect'
import { useWorkspaceStore } from '../../store/workspace.store'
import { useAppStore } from '../../store/app.store'
import type { Assignment, Course, Grade } from '@shared/types/entities'
import type { AssignmentsLayout, AssignmentsSortBy } from '@shared/types/ipc'

interface AssignmentWithMeta extends Assignment {
  grade?:  Grade
  course?: Course
}

const LAYOUT_OPTIONS: { value: AssignmentsLayout; icon: React.ReactNode; label: string }[] = [
  { value: 'list',     icon: <List size={14} />,       label: 'List'     },
  { value: 'board',    icon: <LayoutGrid size={14} />, label: 'Board'    },
  { value: 'priority', icon: <ArrowUpDown size={14} />,label: 'Priority' },
]

const SORT_OPTIONS: { value: AssignmentsSortBy; label: string }[] = [
  { value: 'due-date',   label: 'Due date'       },
  { value: 'course',     label: 'Course'         },
  { value: 'points',     label: 'Points: High'   },
  { value: 'completion', label: 'Status'         },
]

// ─── Priority score ────────────────────────────────────────────────────────────

function priorityScore(a: AssignmentWithMeta): number {
  const now       = Date.now()
  const isOverdue = a.dueAt && a.dueAt < now && (!a.grade || a.grade.workflowState === 'unsubmitted')
  const hoursLeft = a.dueAt ? (a.dueAt - now) / (1000 * 60 * 60) : Infinity
  const urgency   = isOverdue ? 1000 : hoursLeft < 24 ? 500 : hoursLeft < 72 ? 200 : 50
  const points    = a.pointsPossible ?? 0
  return urgency + points
}

// ─── Shared assignment row ────────────────────────────────────────────────────

function AssignmentRow({ a }: { a: AssignmentWithMeta }) {
  const now     = Date.now()
  const urgency = getDueUrgency(a.dueAt)
  const isGraded = a.grade?.workflowState === 'graded'
  const isOverdue = a.dueAt && a.dueAt < now && (!a.grade || a.grade.workflowState === 'unsubmitted')

  return (
    <Link to={`/assignments/${a.id}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-white/4 transition-colors group">
      <div className={cn('w-1.5 h-6 rounded-full shrink-0',
        isOverdue ? 'bg-red-500' :
        urgency === 'urgent' || urgency === 'soon' ? 'bg-amber-500' :
        isGraded ? 'bg-green-500' : 'bg-zinc-600')} />

      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-200 group-hover:text-white truncate transition-colors">{a.title}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{a.course?.name}</p>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {a.pointsPossible != null && (
          <span className="text-xs text-zinc-600">{a.pointsPossible} pts</span>
        )}
        {isGraded && a.grade?.score != null && (
          <span className={cn('text-xs font-bold',
            a.grade.score / (a.pointsPossible ?? 100) >= 0.8 ? 'text-green-400' :
            a.grade.score / (a.pointsPossible ?? 100) >= 0.6 ? 'text-amber-400' : 'text-red-400')}>
            {a.grade.score}/{a.pointsPossible}
          </span>
        )}
        {isOverdue && <Badge variant="danger">Overdue</Badge>}
        {isGraded && <Badge variant="success">Graded</Badge>}
        {a.dueAt && !isGraded && (
          <span className={cn('text-xs',
            urgency === 'urgent' || isOverdue ? 'text-red-400' :
            urgency === 'soon' ? 'text-amber-400' : 'text-zinc-500')}>
            {formatDueDate(a.dueAt)}
          </span>
        )}
      </div>
    </Link>
  )
}

// ─── List view ────────────────────────────────────────────────────────────────

function ListView({ items }: { items: AssignmentWithMeta[] }) {
  if (!items.length) return (
    <EmptyState icon={<ClipboardList size={20} />} title="No assignments"
      description="Nothing matching your filters." />
  )
  return (
    <div className="bg-surface-800 border border-white/5 rounded-xl divide-y divide-white/5 overflow-hidden">
      {items.map(a => <AssignmentRow key={a.id} a={a} />)}
    </div>
  )
}

// ─── Board view ───────────────────────────────────────────────────────────────

interface BoardColumn {
  id:    string
  label: string
  color: string
  icon:  React.ReactNode
  items: AssignmentWithMeta[]
}

function BoardCard({ a }: { a: AssignmentWithMeta }) {
  const urgency = getDueUrgency(a.dueAt)
  return (
    <Link to={`/assignments/${a.id}`}
      className="block p-3 rounded-lg bg-surface-700 border border-white/5 hover:border-white/15 transition-colors">
      <p className="text-xs font-medium text-zinc-200 mb-1 leading-snug">{a.title}</p>
      <p className="text-2xs text-zinc-500 mb-2">{a.course?.name}</p>
      <div className="flex items-center justify-between">
        {a.pointsPossible != null && (
          <span className="text-2xs text-zinc-600">{a.pointsPossible} pts</span>
        )}
        {a.dueAt && (
          <span className={cn('text-2xs',
            urgency === 'urgent' || urgency === 'overdue' ? 'text-red-400' :
            urgency === 'soon' ? 'text-amber-400' : 'text-zinc-500')}>
            {formatDueDate(a.dueAt)}
          </span>
        )}
      </div>
    </Link>
  )
}

function BoardView({ items }: { items: AssignmentWithMeta[] }) {
  const now = Date.now()
  const columns: BoardColumn[] = [
    {
      id:    'overdue',
      label: 'Overdue',
      color: 'text-red-400',
      icon:  <AlertCircle size={13} />,
      items: items.filter(a => a.dueAt && a.dueAt < now && (!a.grade || a.grade.workflowState === 'unsubmitted')),
    },
    {
      id:    'todo',
      label: 'To Do',
      color: 'text-zinc-300',
      icon:  <Inbox size={13} />,
      items: items.filter(a => (!a.dueAt || a.dueAt >= now) && (!a.grade || a.grade.workflowState === 'unsubmitted')),
    },
    {
      id:    'submitted',
      label: 'Submitted',
      color: 'text-blue-400',
      icon:  <Upload size={13} />,
      items: items.filter(a => a.grade?.workflowState === 'submitted'),
    },
    {
      id:    'graded',
      label: 'Graded',
      color: 'text-green-400',
      icon:  <CheckCircle2 size={13} />,
      items: items.filter(a => a.grade?.workflowState === 'graded'),
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3">
      {columns.map(col => (
        <div key={col.id} className="bg-surface-800 border border-white/5 rounded-xl overflow-hidden">
          <div className={cn('flex items-center gap-1.5 px-3 py-2.5 border-b border-white/5 text-xs font-semibold', col.color)}>
            {col.icon}
            {col.label}
            <span className="ml-auto text-zinc-600 font-normal">{col.items.length}</span>
          </div>
          <div className="p-2 space-y-2 max-h-80 overflow-y-auto">
            {col.items.length === 0
              ? <p className="text-2xs text-zinc-700 text-center py-4">None</p>
              : col.items.slice(0, 20).map(a => <BoardCard key={a.id} a={a} />)
            }
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Priority view ────────────────────────────────────────────────────────────

function PriorityView({ items }: { items: AssignmentWithMeta[] }) {
  const now = Date.now()
  const pending = items
    .filter(a => !a.grade || a.grade.workflowState === 'unsubmitted')
    .sort((a, b) => priorityScore(b) - priorityScore(a))

  const done = items
    .filter(a => a.grade && a.grade.workflowState !== 'unsubmitted')
    .slice(0, 10)

  if (!pending.length && !done.length) {
    return <EmptyState icon={<ClipboardList size={20} />} title="No assignments" description="Nothing to do." />
  }

  return (
    <div className="space-y-4">
      {pending.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-1">
            Action Needed — ranked by impact
          </h3>
          <div className="bg-surface-800 border border-white/5 rounded-xl divide-y divide-white/5 overflow-hidden">
            {pending.map((a, i) => {
              const isOverdue = a.dueAt && a.dueAt < now
              const score     = priorityScore(a)
              return (
                <Link key={a.id} to={`/assignments/${a.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-white/4 transition-colors group">
                  <span className={cn('text-sm font-bold w-6 shrink-0 text-center',
                    i === 0 ? 'text-accent-400' : i < 3 ? 'text-zinc-400' : 'text-zinc-600')}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200 group-hover:text-white truncate">{a.title}</p>
                    <p className="text-xs text-zinc-500">{a.course?.name}</p>
                  </div>
                  <div className="shrink-0 text-right space-y-0.5">
                    {isOverdue
                      ? <Badge variant="danger">Overdue</Badge>
                      : a.dueAt && <p className="text-xs text-zinc-500">{formatDueDate(a.dueAt)}</p>}
                    {a.pointsPossible != null && (
                      <p className="text-2xs text-zinc-600">{a.pointsPossible} pts</p>
                    )}
                  </div>
                  <div className={cn('w-1.5 h-8 rounded-full shrink-0',
                    score >= 700 ? 'bg-red-500' : score >= 300 ? 'bg-amber-500' : 'bg-zinc-600')} />
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-1">Completed</h3>
          <div className="bg-surface-800 border border-white/5 rounded-xl divide-y divide-white/5 overflow-hidden opacity-60">
            {done.map(a => <AssignmentRow key={a.id} a={a} />)}
          </div>
        </section>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Assignments() {
  const [searchParams] = useSearchParams()
  const filterCourseId = searchParams.get('course')

  const ws           = useWorkspaceStore()
  const active       = ws.active()
  const showHistory  = useAppStore(s => s.preferences?.showHistoryCourses ?? false)
  const { assignmentsLayout: layout, assignmentsSortBy: sortBy } = active.pagePrefs

  const [courses,     setCourses]     = useState<Course[]>([])
  const [assignments, setAssignments] = useState<AssignmentWithMeta[]>([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [courseFilter, setCourseFilter] = useState<string>(filterCourseId ?? 'all')

  useEffect(() => {
    const fetch = showHistory ? api.courses.getAllIncludingInactive : api.courses.getAll
    fetch().then((r: { ok: boolean; data: Course[] }) => { if (r.ok) setCourses(r.data) })
  }, [showHistory])

  useEffect(() => {
    setLoading(true)
    const load = async () => {
      const courseList = await (showHistory ? api.courses.getAllIncludingInactive() : api.courses.getAll())
      if (!courseList.ok) { setLoading(false); return }
      const all: AssignmentWithMeta[] = []
      const relevantCourses = courseFilter === 'all'
        ? courseList.data
        : courseList.data.filter((c: Course) => c.id === courseFilter)
      await Promise.all(relevantCourses.map(async (c: Course) => {
        const [aRes, gRes] = await Promise.all([
          api.assignments.getByCourse(c.id),
          api.grades.getByCourse(c.id),
        ])
        const gMap = new Map((gRes.ok ? (gRes.data as Grade[]) : []).map((g: Grade) => [g.assignmentId, g]))
        if (aRes.ok) aRes.data.forEach((a: Assignment) => all.push({
          ...a, course: c, grade: gMap.get(a.id) as Grade | undefined,
        }))
      }))
      setAssignments(all); setLoading(false)
    }
    load()
  }, [courseFilter, showHistory])

  const sorted = useMemo(() => {
    let result = assignments.filter(a =>
      !search || a.title.toLowerCase().includes(search.toLowerCase())
    )
    switch (sortBy) {
      case 'due-date':   result = result.sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity)); break
      case 'course':     result = result.sort((a, b) => (a.course?.name ?? '').localeCompare(b.course?.name ?? '')); break
      case 'points':     result = result.sort((a, b) => (b.pointsPossible ?? 0) - (a.pointsPossible ?? 0)); break
      case 'completion': result = result.sort((a, b) => (a.grade?.workflowState ?? 'z').localeCompare(b.grade?.workflowState ?? 'z')); break
    }
    return result
  }, [assignments, search, sortBy])

  if (loading) return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="rounded-xl bg-surface-800 border border-white/5 divide-y divide-white/5 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <div className="w-1.5 h-6 rounded-full bg-surface-700 animate-pulse-soft shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="w-56 h-3" />
              <Skeleton className="w-32 h-2.5" />
            </div>
            <Skeleton className="w-16 h-3" />
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full overflow-y-auto">
      <div className="p-6 max-w-4xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-zinc-100">Assignments</h1>
            <p className="text-sm text-zinc-500 mt-0.5">{sorted.length} total</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                className="bg-surface-700 border border-white/10 rounded-md text-xs text-zinc-300 pl-7 pr-3 py-1.5 focus:outline-none focus:border-accent-500/60 w-40" />
            </div>

            {/* Course filter */}
            <CustomSelect
              value={courseFilter}
              onChange={setCourseFilter}
              options={[
                { value: 'all', label: 'All courses' },
                ...courses.map(c => ({ value: c.id, label: c.name })),
              ]}
              className="w-44"
            />

            {/* Sort */}
            <div className="flex items-center gap-1.5">
              <SortAsc size={13} className="text-zinc-500" />
              <CustomSelect
                value={sortBy}
                onChange={v => ws.updatePagePrefs({ assignmentsSortBy: v as AssignmentsSortBy })}
                options={SORT_OPTIONS}
                className="w-40"
              />
            </div>

            {/* Layout */}
            <div className="flex rounded-lg border border-white/10 overflow-hidden">
              {LAYOUT_OPTIONS.map(o => (
                <button key={o.value} onClick={() => ws.updatePagePrefs({ assignmentsLayout: o.value })}
                  title={o.label}
                  className={cn('px-2.5 py-1.5 transition-colors',
                    layout === o.value ? 'bg-accent-500/20 text-accent-400' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5')}>
                  {o.icon}
                </button>
              ))}
            </div>
          </div>
        </div>

        {layout === 'list'     && <ListView    items={sorted} />}
        {layout === 'board'    && <BoardView   items={sorted} />}
        {layout === 'priority' && <PriorityView items={sorted} />}
      </div>
    </motion.div>
  )
}
