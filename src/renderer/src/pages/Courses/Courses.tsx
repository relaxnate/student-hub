import { useEffect, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  BookOpen, Layers, ClipboardList, BarChart2, ArrowRight,
  LayoutGrid, List, Table, SortAsc,
} from 'lucide-react'
import { api } from '../../lib/ipc'
import { cn } from '../../lib/utils'
import { Spinner, EmptyState } from '../../components/ui/Badge'
import { useWorkspaceStore } from '../../store/workspace.store'
import { useAppStore } from '../../store/app.store'
import type { Course } from '@shared/types/entities'
import type { CoursesLayout, CoursesSortBy } from '@shared/types/ipc'

const LAYOUT_OPTIONS: { value: CoursesLayout; icon: React.ReactNode; label: string }[] = [
  { value: 'cards', icon: <LayoutGrid size={14} />, label: 'Cards' },
  { value: 'list',  icon: <List size={14} />,       label: 'List'  },
  { value: 'table', icon: <Table size={14} />,      label: 'Table' },
]

const SORT_OPTIONS: { value: CoursesSortBy; label: string }[] = [
  { value: 'name',       label: 'A – Z'           },
  { value: 'grade-high', label: 'Grade: High first' },
  { value: 'grade-low',  label: 'Grade: Low first'  },
  { value: 'recent',     label: 'Recently synced'   },
]

function gradeColor(score: number | null): string {
  if (score == null) return 'text-zinc-500'
  if (score >= 90) return 'text-green-400'
  if (score >= 80) return 'text-green-400'
  if (score >= 70) return 'text-amber-400'
  if (score >= 60) return 'text-amber-400'
  return 'text-red-400'
}

// ─── Cards layout ─────────────────────────────────────────────────────────────
// NOTE: Uses <div> + useNavigate for the outer card, NOT <Link>, because the
// footer contains <Link> elements and nesting <a> inside <a> is invalid HTML —
// the browser splits them, which breaks the card background and causes the
// see-through glitch.

function CardsView({ courses }: { courses: Course[] }) {
  const navigate = useNavigate()
  return (
    <div className="space-y-3">
      {courses.map(course => (
        <div key={course.id}
          onClick={() => navigate(`/courses/${course.id}`)}
          className="rounded-xl bg-surface-800 border border-white/5 overflow-hidden hover:border-white/15 transition-colors group cursor-pointer">
          <div className="flex items-center gap-4 p-5">
            <div className="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center text-white text-xl font-bold"
              style={{ background: course.color ?? '#6366f1' }}>
              {course.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-zinc-100 truncate group-hover:text-white transition-colors">
                {course.name}
              </h3>
              <div className="flex items-center gap-2 text-xs text-zinc-500 mt-0.5">
                {course.courseCode && <span>{course.courseCode}</span>}
                {course.term && <span>{course.term}</span>}
              </div>
            </div>
            <div className="text-right shrink-0">
              {course.currentScore != null && (
                <p className={cn('text-lg font-bold', gradeColor(course.currentScore))}>
                  {course.currentScore.toFixed(1)}%
                </p>
              )}
              {course.currentGrade && (
                <p className="text-xs text-zinc-500">{course.currentGrade}</p>
              )}
            </div>
            <ArrowRight size={16} className="text-zinc-600 group-hover:text-zinc-400 transition-colors shrink-0" />
          </div>
          {/* Footer links stop propagation so clicking them navigates to the
              sub-page rather than the course detail */}
          <div className="border-t border-white/5 px-5 py-2.5 flex gap-5"
            onClick={e => e.stopPropagation()}>
            {[
              { to: `/modules?course=${course.id}`,     icon: <Layers size={13} />,       label: 'Modules' },
              { to: `/assignments?course=${course.id}`, icon: <ClipboardList size={13} />, label: 'Assignments' },
              { to: `/grades?course=${course.id}`,      icon: <BarChart2 size={13} />,     label: 'Grades' },
            ].map(link => (
              <Link key={link.to} to={link.to}
                className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-accent-400 transition-colors">
                {link.icon}<span>{link.label}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Compact list layout ──────────────────────────────────────────────────────

function ListView({ courses }: { courses: Course[] }) {
  return (
    <div className="bg-surface-800 border border-white/5 rounded-xl divide-y divide-white/5 overflow-hidden">
      {courses.map(course => (
        <Link key={course.id} to={`/courses/${course.id}`}
          className="flex items-center gap-3 px-4 py-3 hover:bg-white/4 transition-colors group">
          <div className="w-6 h-6 rounded-md shrink-0 flex items-center justify-center text-white text-xs font-bold"
            style={{ background: course.color ?? '#6366f1' }}>
            {course.name[0]}
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-sm text-zinc-200 group-hover:text-white transition-colors truncate">
              {course.name}
            </span>
          </div>
          {course.courseCode && (
            <span className="text-xs text-zinc-600 shrink-0">{course.courseCode}</span>
          )}
          {course.currentScore != null && (
            <span className={cn('text-sm font-bold shrink-0 w-14 text-right', gradeColor(course.currentScore))}>
              {course.currentScore.toFixed(1)}%
            </span>
          )}
          <ArrowRight size={14} className="text-zinc-700 group-hover:text-zinc-400 transition-colors shrink-0" />
        </Link>
      ))}
    </div>
  )
}

// ─── Table layout ─────────────────────────────────────────────────────────────

function TableView({ courses }: { courses: Course[] }) {
  return (
    <div className="bg-surface-800 border border-white/5 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/5">
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Course</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Code</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Term</th>
            <th className="text-right px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Grade</th>
            <th className="text-right px-4 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Score</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {courses.map(course => (
            <tr key={course.id} className="hover:bg-white/3 transition-colors group">
              <td className="px-4 py-3">
                <Link to={`/courses/${course.id}`}
                  className="flex items-center gap-2 text-zinc-200 group-hover:text-white transition-colors">
                  <div className="w-5 h-5 rounded shrink-0" style={{ background: course.color ?? '#6366f1' }} />
                  <span className="truncate max-w-xs">{course.name}</span>
                </Link>
              </td>
              <td className="px-4 py-3 text-zinc-500 text-xs">{course.courseCode ?? '—'}</td>
              <td className="px-4 py-3 text-zinc-500 text-xs">{course.term ?? '—'}</td>
              <td className={cn('px-4 py-3 text-right font-semibold text-sm', gradeColor(course.currentScore))}>
                {course.currentGrade ?? '—'}
              </td>
              <td className={cn('px-4 py-3 text-right font-bold', gradeColor(course.currentScore))}>
                {course.currentScore != null ? `${course.currentScore.toFixed(1)}%` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Courses page ─────────────────────────────────────────────────────────────

export default function Courses() {
  const ws           = useWorkspaceStore()
  const active       = ws.active()
  const { coursesLayout: layout, coursesSortBy: sortBy } = active.pagePrefs
  const showHistory  = useAppStore(s => s.preferences?.showHistoryCourses ?? false)

  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = showHistory ? api.courses.getAllIncludingInactive : api.courses.getAll
    fetch().then((r: { ok: boolean; data: Course[] }) => {
      if (r.ok) setCourses(r.data)
      setLoading(false)
    })
  }, [showHistory])

  const sorted = useMemo(() => {
    const copy = [...courses]
    switch (sortBy) {
      case 'name':       return copy.sort((a, b) => a.name.localeCompare(b.name))
      case 'grade-high': return copy.sort((a, b) => (b.currentScore ?? -1) - (a.currentScore ?? -1))
      case 'grade-low':  return copy.sort((a, b) => (a.currentScore ?? 101) - (b.currentScore ?? 101))
      case 'recent':     return copy.sort((a, b) => b.syncedAt - a.syncedAt)
      default:           return copy
    }
  }, [courses, sortBy])

  if (loading) return <div className="flex items-center justify-center h-full"><Spinner size={20} /></div>

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full overflow-y-auto">
      <div className="p-6 max-w-4xl mx-auto space-y-5">
        {/* Header + controls */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-zinc-100">Courses</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {courses.length} active course{courses.length !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Sort */}
            <div className="flex items-center gap-1.5">
              <SortAsc size={13} className="text-zinc-500" />
              <select
                value={sortBy}
                onChange={e => ws.updatePagePrefs({ coursesSortBy: e.target.value as CoursesSortBy })}
                className="bg-surface-700 border border-white/10 rounded-md text-xs text-zinc-300 px-2 py-1.5 focus:outline-none">
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* Layout toggle */}
            <div className="flex rounded-lg border border-white/10 overflow-hidden">
              {LAYOUT_OPTIONS.map(o => (
                <button key={o.value} onClick={() => ws.updatePagePrefs({ coursesLayout: o.value })}
                  title={o.label}
                  className={cn('px-2.5 py-1.5 transition-colors',
                    layout === o.value ? 'bg-accent-500/20 text-accent-400' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5')}>
                  {o.icon}
                </button>
              ))}
            </div>
          </div>
        </div>

        {sorted.length === 0 ? (
          <EmptyState icon={<BookOpen size={20} />} title="No courses synced yet"
            description="Connect a learning platform and run a sync to see your courses here." />
        ) : (
          <>
            {layout === 'cards' && <CardsView courses={sorted} />}
            {layout === 'list'  && <ListView  courses={sorted} />}
            {layout === 'table' && <TableView courses={sorted} />}
          </>
        )}
      </div>
    </motion.div>
  )
}
