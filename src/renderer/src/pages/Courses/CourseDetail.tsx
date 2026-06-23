import React, { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Layers, ClipboardList, BarChart2, FolderOpen, Clock, CheckCircle2, AlertCircle } from 'lucide-react'
import { api } from '../../lib/ipc'
import { cn, formatDueDate, getDueUrgency } from '../../lib/utils'
import { Spinner, Badge, EmptyState } from '../../components/ui/Badge'
import type { Course, Assignment, Grade } from '@shared/types/entities'

export default function CourseDetail() {
  const { courseId } = useParams<{ courseId: string }>()
  const navigate = useNavigate()
  const [course,      setCourse]      = useState<Course | null>(null)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [grades,      setGrades]      = useState<Grade[]>([])
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    if (!courseId) return
    const load = async () => {
      const [cRes, aRes, gRes] = await Promise.all([
        api.courses.getById(courseId),
        api.assignments.getByCourse(courseId),
        api.grades.getByCourse(courseId),
      ])
      if (cRes.ok) setCourse(cRes.data)
      if (aRes.ok) setAssignments(aRes.data)
      if (gRes.ok) setGrades(gRes.data)
      setLoading(false)
    }
    load()
  }, [courseId])

  if (loading) return <div className="flex items-center justify-center h-full"><Spinner size={20} /></div>
  if (!course) return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <p className="text-sm text-zinc-500">Course not found.</p>
      <button onClick={() => navigate('/courses')} className="text-xs text-accent-400 hover:underline">← Back to courses</button>
    </div>
  )

  const gradeMap   = new Map(grades.map(g => [g.assignmentId, g]))
  const now        = Date.now()
  const upcoming   = assignments.filter(a => a.dueAt && a.dueAt > now).slice(0, 5)
  const overdue    = assignments.filter(a => a.dueAt && a.dueAt < now && (!gradeMap.get(a.id) || gradeMap.get(a.id)?.workflowState === 'unsubmitted'))
  const gradedCount = grades.filter(g => g.workflowState === 'graded').length

  const stats = [
    { label: 'Assignments', value: assignments.length, icon: <ClipboardList size={16} />, to: `/assignments?course=${courseId}` },
    { label: 'Graded',      value: gradedCount,        icon: <CheckCircle2 size={16} />, to: `/grades?course=${courseId}` },
    { label: 'Overdue',     value: overdue.length,     icon: <AlertCircle size={16} />,  to: `/assignments?course=${courseId}` },
  ]

  const navLinks = [
    { to: `/modules?course=${courseId}`,     icon: <Layers size={14} />,       label: 'Modules' },
    { to: `/assignments?course=${courseId}`, icon: <ClipboardList size={14} />, label: 'Assignments' },
    { to: `/grades?course=${courseId}`,      icon: <BarChart2 size={14} />,    label: 'Grades' },
    { to: `/files?course=${courseId}`,       icon: <FolderOpen size={14} />,   label: 'Files' },
  ]

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        <Link to="/courses" className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          <ArrowLeft size={12} /> All courses
        </Link>

        {/* Header */}
        <div className="rounded-2xl overflow-hidden border border-white/5">
          <div className="h-2" style={{ background: course.color ?? '#6366f1' }} />
          <div className="bg-surface-800 p-6">
            <h1 className="text-xl font-semibold text-zinc-100 mb-1">{course.name}</h1>
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              {course.courseCode && <span>{course.courseCode}</span>}
              {course.term && <><span>·</span><span>{course.term}</span></>}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {stats.map(s => (
            <Link key={s.label} to={s.to}
              className="bg-surface-800 border border-white/5 rounded-xl p-4 flex flex-col gap-2 hover:border-white/15 transition-colors group">
              <div className="text-zinc-500 group-hover:text-accent-400 transition-colors">{s.icon}</div>
              <p className="text-2xl font-bold text-zinc-100">{s.value}</p>
              <p className="text-xs text-zinc-500">{s.label}</p>
            </Link>
          ))}
        </div>

        {/* Navigation */}
        <div className="grid grid-cols-4 gap-2">
          {navLinks.map(l => (
            <Link key={l.to} to={l.to}
              className="flex flex-col items-center gap-2 p-3 rounded-xl bg-surface-800 border border-white/5 hover:border-accent-500/40 hover:bg-accent-500/5 transition-colors text-zinc-400 hover:text-accent-400">
              {l.icon}
              <span className="text-xs font-medium">{l.label}</span>
            </Link>
          ))}
        </div>

        {/* Upcoming assignments */}
        {upcoming.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
              <Clock size={14} className="text-zinc-500" /> Upcoming
            </h2>
            <div className="space-y-2">
              {upcoming.map(a => {
                const urgency = getDueUrgency(a.dueAt)
                return (
                  <Link key={a.id} to={`/assignments/${a.id}`}
                    className="flex items-center gap-3 p-3 rounded-lg bg-surface-800 border border-white/5 hover:border-white/15 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-200 truncate">{a.title}</p>
                      {a.dueAt && (
                        <p className={cn('text-xs mt-0.5',
                          urgency === 'urgent' ? 'text-red-400' : urgency === 'soon' ? 'text-amber-400' : 'text-zinc-500')}>
                          {formatDueDate(a.dueAt)}
                        </p>
                      )}
                    </div>
                    {a.pointsPossible != null && <span className="text-xs text-zinc-600">{a.pointsPossible} pts</span>}
                    {urgency === 'urgent' && <Badge variant="danger">Today</Badge>}
                    {urgency === 'soon'   && <Badge variant="warning">Tomorrow</Badge>}
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {overdue.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
              <AlertCircle size={14} /> Overdue ({overdue.length})
            </h2>
            <div className="space-y-2">
              {overdue.slice(0, 3).map(a => (
                <Link key={a.id} to={`/assignments/${a.id}`}
                  className="flex items-center gap-3 p-3 rounded-lg bg-red-900/10 border border-red-700/20 hover:border-red-700/40 transition-colors">
                  <p className="flex-1 text-sm text-zinc-300 truncate">{a.title}</p>
                  <Badge variant="danger">Overdue</Badge>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </motion.div>
  )
}
