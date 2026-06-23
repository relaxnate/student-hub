import React, { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, HelpCircle, AlertCircle, Clock, Repeat, ExternalLink, Award } from 'lucide-react'
import { api } from '../../lib/ipc'
import { formatDueDate } from '../../lib/utils'
import { Badge, Spinner } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { LinkOpener, useLinkOpener } from '../../components/ui/LinkOpener'
import type { Quiz, Course } from '@shared/types/entities'

function sanitize(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\s+on\w+="[^"]*"/gi, '')
    .replace(/\s+on\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '#')
}

const QUIZ_TYPE_LABEL: Record<Quiz['quizType'], string> = {
  practice_quiz:   'Practice quiz',
  assignment:      'Graded quiz',
  graded_survey:   'Graded survey',
  survey:          'Survey',
}

export default function QuizDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { linkState, open: openLink, close: closeLink } = useLinkOpener()

  const [quiz,    setQuiz]    = useState<Quiz | null>(null)
  const [course,  setCourse]  = useState<Course | null>(null)
  const [loading, setLoading] = useState(true)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    const load = async () => {
      const qResult = await api.quizzes.getById(id)
      if (!qResult.ok) { setLoading(false); return }
      setQuiz(qResult.data)
      const cResult = await api.courses.getById(qResult.data.courseId)
      if (cResult.ok) setCourse(cResult.data)
      setLoading(false)
    }
    load()
  }, [id])

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
  }, [quiz])

  if (loading) return <div className="flex items-center justify-center h-full"><Spinner size={20} /></div>

  if (!quiz) return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <AlertCircle size={24} className="text-zinc-600" />
      <p className="text-sm text-zinc-500">Quiz not found.</p>
      <Button variant="ghost" onClick={() => navigate(-1)} icon={<ArrowLeft size={14} />}>Go back</Button>
    </div>
  )

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">
        <Link to={`/modules?course=${quiz.courseId}`}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          <ArrowLeft size={12} /> Back to modules
        </Link>

        <div className="rounded-2xl bg-surface-800 border border-white/5 overflow-hidden">
          {course && <div className="h-1" style={{ background: course.color ?? '#6366f1' }} />}
          <div className="p-6">
            {course && (
              <Link to={`/courses/${course.id}`}
                className="text-xs text-zinc-500 hover:text-accent-400 transition-colors mb-2 block">
                {course.name}
              </Link>
            )}
            <div className="flex items-center gap-2 mb-3">
              <HelpCircle size={16} className="text-zinc-500 shrink-0" />
              <h1 className="text-xl font-semibold text-zinc-100 leading-tight selectable">{quiz.title}</h1>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={quiz.quizType === 'practice_quiz' ? 'default' : 'warning'}>
                {QUIZ_TYPE_LABEL[quiz.quizType]}
              </Badge>
              {quiz.dueAt && (
                <span className="flex items-center gap-1.5 text-sm text-zinc-400">
                  <Clock size={13} />{formatDueDate(quiz.dueAt)}
                </span>
              )}
              {quiz.pointsPossible != null && (
                <span className="flex items-center gap-1.5 text-sm text-zinc-500">
                  <Award size={13} />{quiz.pointsPossible} points
                </span>
              )}
              {quiz.timeLimitMinutes != null && (
                <span className="text-sm text-zinc-500">{quiz.timeLimitMinutes} min limit</span>
              )}
              {quiz.allowedAttempts != null && (
                <span className="flex items-center gap-1.5 text-sm text-zinc-500">
                  <Repeat size={13} />{quiz.allowedAttempts} attempt{quiz.allowedAttempts !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            <div className="flex gap-2 mt-5 pt-4 border-t border-white/5">
              {quiz.htmlUrl ? (
                <Button variant="primary" size="sm" icon={<ExternalLink size={13} />}
                  onClick={() => openLink(quiz.htmlUrl!, quiz.title)}>
                  Take quiz in Canvas
                </Button>
              ) : (
                <p className="text-xs text-zinc-600">No direct link is available for this quiz — open it from Canvas directly.</p>
              )}
            </div>
          </div>
        </div>

        {quiz.description && (
          <section>
            <h2 className="text-sm font-semibold text-zinc-300 mb-3">Description</h2>
            <div className="rounded-xl bg-surface-800 border border-white/5 p-5">
              <div ref={contentRef}
                className="prose-assignment selectable text-sm text-zinc-300 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: sanitize(quiz.description) }} />
            </div>
          </section>
        )}
      </div>

      <style>{`
        .prose-assignment h1,.prose-assignment h2,.prose-assignment h3{color:rgb(244 244 245);font-weight:600;margin:1rem 0 .5rem}
        .prose-assignment h1{font-size:1.125rem}.prose-assignment h2{font-size:1rem}.prose-assignment h3{font-size:.875rem}
        .prose-assignment p{margin:.5rem 0}
        .prose-assignment ul,.prose-assignment ol{padding-left:1.5rem;margin:.5rem 0}
        .prose-assignment li{margin:.2rem 0}
        .prose-assignment a{color:rgb(129 140 248);text-decoration:underline;cursor:pointer}
        .prose-assignment a:hover{color:rgb(165 180 252)}
        .prose-assignment strong,.prose-assignment b{color:rgb(244 244 245);font-weight:600}
        .prose-assignment img{max-width:100%;border-radius:.5rem;margin:.5rem 0}
      `}</style>

      {linkState && <LinkOpener url={linkState.url} label={linkState.label} onClose={closeLink} />}
    </motion.div>
  )
}
