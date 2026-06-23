import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, BookOpen, AlertCircle, Clock, RefreshCw, ExternalLink } from 'lucide-react'
import { api } from '../../lib/ipc'
import { Spinner } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { LinkOpener, useLinkOpener } from '../../components/ui/LinkOpener'
import type { CoursePage, Course, Integration } from '@shared/types/entities'

function sanitize(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\s+on\w+="[^"]*"/gi, '')
    .replace(/\s+on\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '#')
}

export default function PageViewer() {
  const { courseId, url } = useParams<{ courseId: string; url: string }>()
  const navigate = useNavigate()
  const { linkState, open: openLink, close: closeLink } = useLinkOpener()

  const [page,       setPage]       = useState<CoursePage | null>(null)
  const [course,     setCourse]     = useState<Course | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [notFound,   setNotFound]   = useState(false)
  const [resyncing,  setResyncing]  = useState(false)
  const [canvasUrl,  setCanvasUrl]  = useState<string | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const loadPage = async (suppressLoading = false) => {
    if (!courseId || !url) return
    if (!suppressLoading) setLoading(true)
    setNotFound(false)

    const [pResult, cResult] = await Promise.all([
      api.pages.getByUrl({ courseId, url: decodeURIComponent(url) }),
      api.courses.getById(courseId),
    ])

    if (pResult.ok) {
      setPage(pResult.data)
    } else {
      setNotFound(true)
    }

    if (cResult.ok) {
      const c = cResult.data
      setCourse(c)
      // Build the Canvas URL so the user can open the page directly if it
      // wasn't synced (Canvas often returns 403 on the pages endpoint for
      // school-district PAT token scopes, so pages may never reach our DB).
      try {
        const intRes = await api.auth.getIntegrations()
        if (intRes.ok) {
          const integration = (intRes.data as Integration[]).find(
            (i: Integration) => i.id === c.integrationId
          )
          if (integration?.baseUrl) {
            setCanvasUrl(
              `${integration.baseUrl}/courses/${c.externalId}/pages/${decodeURIComponent(url)}`
            )
          }
        }
      } catch { /* silently ignore — Canvas URL is best-effort */ }
    }

    setLoading(false)
  }

  useEffect(() => { loadPage() }, [courseId, url])

  const handleResync = async () => {
    setResyncing(true)
    await api.sync.startAll()
    await loadPage(true)
    setResyncing(false)
  }

  // Intercept link clicks inside rendered HTML
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
  }, [page])

  if (loading) return <div className="flex items-center justify-center h-full"><Spinner size={20} /></div>

  if (notFound || !page) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
        <AlertCircle size={32} className="text-amber-400" />
        <div>
          <p className="text-sm font-semibold text-zinc-200">Page not synced</p>
          <p className="text-xs text-zinc-500 mt-1.5 max-w-sm leading-relaxed">
            This page exists on Canvas but could not be downloaded. Your school may restrict
            the Pages endpoint for student access tokens — this is a Canvas permission setting
            your institution controls.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <Button variant="secondary" size="sm" loading={resyncing}
            icon={<RefreshCw size={12} />} onClick={handleResync}>
            {resyncing ? 'Syncing...' : 'Re-sync and retry'}
          </Button>
          {canvasUrl && (
            <Button variant="primary" size="sm" icon={<ExternalLink size={12} />}
              onClick={() => api.app.openExternal(canvasUrl)}>
              Open in Canvas
            </Button>
          )}
          <Button variant="ghost" size="sm" icon={<ArrowLeft size={12} />}
            onClick={() => navigate(-1)}>
            Go back
          </Button>
        </div>
        {canvasUrl && (
          <p className="text-2xs text-zinc-600 mt-1 max-w-xs break-all">{canvasUrl}</p>
        )}
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">
        <Link to={`/modules?course=${courseId}`}
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
            <div className="flex items-center gap-2 mb-1">
              <BookOpen size={16} className="text-zinc-500 shrink-0" />
              <h1 className="text-xl font-semibold text-zinc-100 leading-tight selectable">{page.title}</h1>
            </div>
            {page.editedAt && (
              <p className="flex items-center gap-1.5 text-xs text-zinc-500 mt-2">
                <Clock size={12} /> Last edited {new Date(page.editedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            )}
            {canvasUrl && (
              <button onClick={() => api.app.openExternal(canvasUrl)}
                className="mt-2 flex items-center gap-1 text-xs text-zinc-600 hover:text-accent-400 transition-colors">
                <ExternalLink size={10} /> Open in Canvas
              </button>
            )}
          </div>
        </div>

        <section>
          <div className="rounded-xl bg-surface-800 border border-white/5 p-5">
            {page.bodyHtml ? (
              <div ref={contentRef}
                className="prose-assignment selectable text-sm text-zinc-300 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: sanitize(page.bodyHtml) }} />
            ) : (
              <p className="text-sm text-zinc-500">This page has no content.</p>
            )}
          </div>
        </section>
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
