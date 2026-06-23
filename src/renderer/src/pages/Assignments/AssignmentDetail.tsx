import React, { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Clock, CheckCircle2, Upload, AlertCircle, BookOpen, StickyNote, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import { api } from '../../lib/ipc'
import { cn, formatDueDate, getDueUrgency, calcPercent, percentToLetter } from '../../lib/utils'
import { Badge, Spinner } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { LinkOpener, useLinkOpener } from '../../components/ui/LinkOpener'
import type { Assignment, Grade, Course } from '@shared/types/entities'

function sanitize(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\s+on\w+="[^"]*"/gi, '')
    .replace(/\s+on\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '#')
}

export default function AssignmentDetail() {
  const { id }     = useParams<{ id: string }>()
  const navigate   = useNavigate()
  const { linkState, open: openLink, close: closeLink } = useLinkOpener()

  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [grade,      setGrade]      = useState<Grade | null>(null)
  const [course,     setCourse]     = useState<Course | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [exporting,  setExporting]  = useState(false)
  const [rubricOpen, setRubricOpen] = useState(true)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!id) return
    const load = async () => {
      const aResult = await api.assignments.getById(id)
      if (!aResult.ok) { setLoading(false); return }
      setAssignment(aResult.data)
      const [gResult, cResult] = await Promise.all([
        api.grades.getByAssignment(id),
        api.courses.getById(aResult.data.courseId),
      ])
      if (gResult.ok) setGrade(gResult.data)
      if (cResult.ok) setCourse(cResult.data)
      setLoading(false)
    }
    load()
  }, [id])

  // Intercept link clicks inside rendered HTML and show LinkOpener
  useEffect(() => {
    if (!contentRef.current) return
    const handler = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('a')
      if (!target) return
      e.preventDefault()
      const href  = target.getAttribute('href') ?? ''
      const label = target.textContent?.trim() || href
      if (href) openLink(href, label)
    }
    contentRef.current.addEventListener('click', handler)
    return () => contentRef.current?.removeEventListener('click', handler)
  }, [assignment])

  const handleObsidianExport = async () => {
    if (!assignment) return
    setExporting(true)
    await api.obsidian.syncCourse(assignment.courseId)
    setExporting(false)
  }

  if (loading) return <div className="flex items-center justify-center h-full"><Spinner size={20} /></div>
  if (!assignment) return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <AlertCircle size={24} className="text-zinc-600" />
      <p className="text-sm text-zinc-500">Assignment not found.</p>
      <Button variant="ghost" onClick={() => navigate(-1)} icon={<ArrowLeft size={14} />}>Go back</Button>
    </div>
  )

  const urgency  = getDueUrgency(assignment.dueAt)
  const percent  = calcPercent(grade?.score ?? null, assignment.pointsPossible)
  const isGraded = grade?.workflowState === 'graded'

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">
        <Link to="/assignments"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          <ArrowLeft size={12} /> Back to assignments
        </Link>

        {/* Header card */}
        <div className="rounded-2xl bg-surface-800 border border-white/5 overflow-hidden">
          {course && <div className="h-1" style={{ background: course.color ?? '#6366f1' }} />}
          <div className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                {course && (
                  <Link to={`/courses/${course.id}`}
                    className="text-xs text-zinc-500 hover:text-accent-400 transition-colors mb-2 block">
                    {course.name}
                  </Link>
                )}
                <h1 className="text-xl font-semibold text-zinc-100 leading-tight mb-3 selectable">
                  {assignment.title}
                </h1>
                <div className="flex flex-wrap items-center gap-3">
                  {assignment.dueAt && (
                    <span className={cn('flex items-center gap-1.5 text-sm',
                      urgency === 'overdue' || urgency === 'urgent' ? 'text-red-400' :
                      urgency === 'soon' ? 'text-amber-400' : 'text-zinc-400')}>
                      <Clock size={13} />{formatDueDate(assignment.dueAt)}
                    </span>
                  )}
                  {assignment.pointsPossible != null && (
                    <span className="text-sm text-zinc-500">{assignment.pointsPossible} points</span>
                  )}
                  {urgency === 'overdue' && <Badge variant="danger">Overdue</Badge>}
                  {urgency === 'urgent'  && <Badge variant="danger">Due today</Badge>}
                  {urgency === 'soon'    && <Badge variant="warning">Due tomorrow</Badge>}
                  {isGraded             && <Badge variant="success">Graded</Badge>}
                </div>
              </div>
              {isGraded && percent !== null && (
                <div className="text-right shrink-0">
                  <p className={cn('text-3xl font-bold tabular-nums',
                    percent >= 90 ? 'text-green-400' : percent >= 70 ? 'text-amber-400' : 'text-red-400')}>
                    {percent}%
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">{grade?.score}/{assignment.pointsPossible}</p>
                  <p className="text-sm font-medium text-zinc-400">{percentToLetter(percent)}</p>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-5 pt-4 border-t border-white/5">
              <Button variant="ghost" size="sm" icon={<StickyNote size={13} />}
                loading={exporting} onClick={handleObsidianExport}>
                Export to Obsidian
              </Button>
              {assignment.submissionTypes.some(t => ['online_upload','online_text_entry','online_url'].includes(t)) && (
                <Button variant="primary" size="sm" icon={<Upload size={13} />}
                  onClick={() => openLink(`#submit-${assignment.externalId}`, 'Submit assignment')}>
                  Submit in LMS
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Instructor feedback */}
        {grade?.submissionComments && grade.submissionComments.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
              <CheckCircle2 size={14} className="text-green-400" /> Instructor feedback
            </h2>
            <div className="space-y-2">
              {grade.submissionComments.map(c => (
                <div key={c.id} className="flex gap-3 p-3.5 rounded-xl bg-green-900/10 border border-green-700/20">
                  <div className="w-7 h-7 rounded-full bg-accent-500/20 flex items-center justify-center shrink-0">
                    <span className="text-xs font-semibold text-accent-400">{c.authorName[0]}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-zinc-400 mb-0.5">{c.authorName}</p>
                    <p className="text-sm text-zinc-300 selectable">{c.comment}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Instructions */}
        {(assignment.descriptionHtml || assignment.descriptionPlain) && (
          <section>
            <h2 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
              <BookOpen size={14} className="text-zinc-500" /> Instructions
            </h2>
            <div className="rounded-xl bg-surface-800 border border-white/5 p-5">
              {assignment.descriptionHtml ? (
                <div ref={contentRef}
                  className="prose-assignment selectable text-sm text-zinc-300 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: sanitize(assignment.descriptionHtml) }} />
              ) : (
                <p className="text-sm text-zinc-300 leading-relaxed selectable whitespace-pre-wrap">
                  {assignment.descriptionPlain}
                </p>
              )}
            </div>
          </section>
        )}

        {/* Rubric */}
        {assignment.rubric && assignment.rubric.length > 0 && (
          <section>
            <button onClick={() => setRubricOpen(o => !o)}
              className="flex items-center gap-2 text-sm font-semibold text-zinc-300 mb-3 w-full text-left">
              {rubricOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Rubric <span className="text-xs font-normal text-zinc-600 ml-1">{assignment.rubric.length} criteria</span>
            </button>
            {rubricOpen && (
              <div className="rounded-xl bg-surface-800 border border-white/5 overflow-hidden">
                {assignment.rubric.map((criterion, i) => (
                  <div key={criterion.id} className={cn('px-5 py-3.5', i < assignment.rubric!.length - 1 && 'border-b border-white/5')}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-200 mb-0.5">{criterion.description}</p>
                        {criterion.longDescription && <p className="text-xs text-zinc-500 selectable">{criterion.longDescription}</p>}
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          {criterion.ratings.map(r => (
                            <span key={r.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs bg-surface-700 border border-white/5 text-zinc-500">
                              {r.description} · {r.points}pts
                            </span>
                          ))}
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-zinc-400 tabular-nums shrink-0">{criterion.points} pts</span>
                    </div>
                  </div>
                ))}
                <div className="px-5 py-2.5 bg-surface-700/50 border-t border-white/5 flex justify-end">
                  <span className="text-sm font-semibold text-zinc-300">
                    Total: {assignment.rubric.reduce((s, c) => s + c.points, 0)} points
                  </span>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Submission details */}
        {assignment.submissionTypes.length > 0 && !assignment.submissionTypes.includes('none') && (
          <section>
            <h2 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
              <Upload size={14} className="text-zinc-500" /> Submission
            </h2>
            <div className="rounded-xl bg-surface-800 border border-white/5 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">Submit via:</span>
                <div className="flex gap-1.5 flex-wrap">
                  {assignment.submissionTypes.map(t => <Badge key={t} variant="default">{t.replace(/_/g, ' ')}</Badge>)}
                </div>
              </div>
              {assignment.allowedExtensions.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500">File types:</span>
                  <div className="flex gap-1 flex-wrap">
                    {assignment.allowedExtensions.map(ext => <Badge key={ext} variant="default">.{ext}</Badge>)}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {/* Scoped styles for LMS HTML */}
      <style>{`
        .prose-assignment h1,.prose-assignment h2,.prose-assignment h3{color:rgb(244 244 245);font-weight:600;margin:1rem 0 .5rem}
        .prose-assignment h1{font-size:1.125rem}.prose-assignment h2{font-size:1rem}.prose-assignment h3{font-size:.875rem}
        .prose-assignment p{margin:.5rem 0}
        .prose-assignment ul,.prose-assignment ol{padding-left:1.5rem;margin:.5rem 0}
        .prose-assignment li{margin:.2rem 0}
        .prose-assignment a{color:rgb(129 140 248);text-decoration:underline;cursor:pointer}
        .prose-assignment a:hover{color:rgb(165 180 252)}
        .prose-assignment strong,.prose-assignment b{color:rgb(244 244 245);font-weight:600}
        .prose-assignment table{width:100%;border-collapse:collapse;margin:.75rem 0;font-size:.875rem}
        .prose-assignment th{background:rgb(30 30 42);color:rgb(212 212 216);padding:.5rem .75rem;text-align:left;border:1px solid rgb(63 63 70)}
        .prose-assignment td{padding:.4rem .75rem;border:1px solid rgb(39 39 42)}
        .prose-assignment img{max-width:100%;border-radius:.5rem;margin:.5rem 0}
        .prose-assignment code{background:rgb(30 30 42);padding:.1rem .3rem;border-radius:.25rem;font-size:.875em}
        .prose-assignment pre{background:rgb(14 14 20);padding:1rem;border-radius:.5rem;overflow-x:auto;margin:.75rem 0}
      `}</style>

      {linkState && <LinkOpener url={linkState.url} label={linkState.label} onClose={closeLink} />}
    </motion.div>
  )
}
