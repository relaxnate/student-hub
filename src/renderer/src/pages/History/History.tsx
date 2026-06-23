import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Archive, ChevronDown, ChevronRight, TrendingUp, TrendingDown,
  CheckCircle2, AlertCircle, BarChart2, ArrowLeftRight,
  Loader2, FileText,
} from 'lucide-react'
import { api } from '../../lib/ipc'
import { cn, percentToLetter } from '../../lib/utils'
import { Spinner } from '../../components/ui/Badge'
import type { Course, Assignment, Grade } from '@shared/types/entities'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CourseSnapshot {
  course:          Course
  assignments:     (Assignment & { grade?: Grade })[]
  gradedCount:     number
  totalCount:      number
  missingCount:    number
  earnedPoints:    number
  possiblePoints:  number
  completionRate:  number    // 0-100
  averageScore:    number | null  // 0-100
}

interface SemesterSnapshot {
  term:        string
  courses:     CourseSnapshot[]
  isCurrent:   boolean
  // Derived stats
  gpa:         number | null
  avgScore:    number | null
  totalGraded: number
  totalMissing: number
  completionRate: number
}

// ─── Semester stats helpers ────────────────────────────────────────────────────

function estimateGpa(avgScore: number | null): number | null {
  if (avgScore === null) return null
  if (avgScore >= 93) return 4.0
  if (avgScore >= 90) return 3.7
  if (avgScore >= 87) return 3.3
  if (avgScore >= 83) return 3.0
  if (avgScore >= 80) return 2.7
  if (avgScore >= 77) return 2.3
  if (avgScore >= 73) return 2.0
  if (avgScore >= 70) return 1.7
  if (avgScore >= 67) return 1.3
  if (avgScore >= 63) return 1.0
  if (avgScore >= 60) return 0.7
  return 0.0
}

function gradeColor(pct: number | null): string {
  if (pct === null) return 'text-zinc-500'
  if (pct >= 90) return 'text-green-400'
  if (pct >= 70) return 'text-amber-400'
  return 'text-red-400'
}

function gradeBg(pct: number | null): string {
  if (pct === null) return 'bg-zinc-600'
  if (pct >= 90) return 'bg-green-500'
  if (pct >= 70) return 'bg-amber-500'
  return 'bg-red-500'
}

function extractYear(term: string | null): number {
  if (!term) return 0
  const m = term.match(/20\d{2}/g)
  return m ? Math.max(...m.map(Number)) : 0
}

// ─── Build semester snapshots from all courses ─────────────────────────────────

async function buildSnapshots(activeCourseIds: Set<string>): Promise<SemesterSnapshot[]> {
  const cRes = await api.courses.getAllIncludingInactive()
  if (!cRes.ok) return []

  // Load all course data in parallel
  const snapshots = await Promise.all(
    cRes.data.map(async (course: Course): Promise<CourseSnapshot> => {
      const [aRes, gRes] = await Promise.all([
        api.assignments.getByCourse(course.id),
        api.grades.getByCourse(course.id),
      ])
      const gMap = new Map((gRes.ok ? gRes.data : []).map((g: Grade) => [g.assignmentId, g]))
      const assignments = (aRes.ok ? aRes.data : []).map((a: Assignment) => ({
        ...a, grade: gMap.get(a.id) as Grade | undefined,
      }))

      type AWithGrade = Assignment & { grade?: Grade }
      const now     = Date.now()
      const graded  = assignments.filter((a: AWithGrade) => a.grade?.workflowState === 'graded' && a.grade.score != null && a.pointsPossible)
      const missing = assignments.filter((a: AWithGrade) =>
        a.dueAt && a.dueAt < now && (!a.grade || a.grade.workflowState === 'unsubmitted')
      )
      const earned   = graded.reduce((s: number, a: AWithGrade) => s + (a.grade!.score!), 0)
      const possible = graded.reduce((s: number, a: AWithGrade) => s + (a.pointsPossible!), 0)

      return {
        course,
        assignments,
        gradedCount:    graded.length,
        totalCount:     assignments.filter((a: Assignment) => a.gradingType !== 'not_graded' && (a.pointsPossible ?? 0) > 0).length,
        missingCount:   missing.length,
        earnedPoints:   earned,
        possiblePoints: possible,
        completionRate: assignments.length > 0 ? Math.round((graded.length / Math.max(assignments.length, 1)) * 100) : 0,
        averageScore:   course.currentScore ?? (possible > 0 ? Math.round((earned / possible) * 100) : null),
      }
    })
  )

  // Group by term
  const byTerm = new Map<string, CourseSnapshot[]>()
  for (const snap of snapshots) {
    const term = snap.course.term ?? 'Unknown Term'
    if (!byTerm.has(term)) byTerm.set(term, [])
    byTerm.get(term)!.push(snap)
  }

  const semesters: SemesterSnapshot[] = [...byTerm.entries()].map(([term, courses]) => {
    const scored = courses.filter(c => c.averageScore !== null)
    const avgScore = scored.length > 0
      ? scored.reduce((s, c) => s + (c.averageScore!), 0) / scored.length
      : null
    const isCurrent = courses.some(c => activeCourseIds.has(c.course.id))

    return {
      term,
      courses,
      isCurrent,
      gpa:           estimateGpa(avgScore),
      avgScore:      avgScore !== null ? Math.round(avgScore) : null,
      totalGraded:   courses.reduce((s, c) => s + c.gradedCount, 0),
      totalMissing:  courses.reduce((s, c) => s + c.missingCount, 0),
      completionRate: courses.length > 0
        ? Math.round(courses.reduce((s, c) => s + c.completionRate, 0) / courses.length)
        : 0,
    }
  })

  // Sort most recent first
  return semesters.sort((a, b) => extractYear(b.term) - extractYear(a.term))
}

// ─── PDF/Markdown export helpers ───────────────────────────────────────────────

function generateSemesterMarkdown(sem: SemesterSnapshot): string {
  const lines: string[] = [
    `# Semester Report — ${sem.term}`,
    ``,
    `> Generated ${new Date().toLocaleDateString('en-US', { dateStyle: 'long' })} by Student Hub`,
    ``,
    `## Summary`,
    ``,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Estimated GPA | ${sem.gpa?.toFixed(2) ?? 'N/A'} |`,
    `| Average score | ${sem.avgScore !== null ? `${sem.avgScore}%` : 'N/A'} |`,
    `| Courses | ${sem.courses.length} |`,
    `| Graded assignments | ${sem.totalGraded} |`,
    `| Missing assignments | ${sem.totalMissing} |`,
    `| Completion rate | ${sem.completionRate}% |`,
    ``,
    `## Courses`,
    ``,
  ]

  for (const snap of sem.courses) {
    const score = snap.averageScore
    lines.push(`### ${snap.course.name}`)
    lines.push(``)
    lines.push(`- **Grade:** ${score !== null ? `${score}%` : 'N/A'} (${percentToLetter(score)})`)
    lines.push(`- **Code:** ${snap.course.courseCode ?? 'N/A'}`)
    lines.push(`- **Graded:** ${snap.gradedCount} / ${snap.totalCount} assignments`)
    if (snap.missingCount > 0) lines.push(`- **Missing:** ${snap.missingCount}`)
    lines.push(``)
    if (snap.assignments.length > 0) {
      lines.push(`| Assignment | Score | Status |`)
      lines.push(`|-----------|-------|--------|`)
      for (const a of snap.assignments.slice(0, 20)) {
        const status = a.grade?.workflowState === 'graded' ? 'Graded'
          : a.grade?.workflowState === 'submitted' ? 'Submitted' : 'Pending'
        const score = a.grade?.score != null && a.pointsPossible != null
          ? `${a.grade.score}/${a.pointsPossible}`
          : '—'
        lines.push(`| ${a.title.slice(0, 50)} | ${score} | ${status} |`)
      }
      lines.push(``)
    }
  }
  return lines.join('\n')
}

function generateSemesterHtml(sem: SemesterSnapshot): string {
  const courseRows = sem.courses.map(snap => {
    const score = snap.averageScore
    const cls = score !== null && score >= 90 ? 'grade-a' : score !== null && score >= 70 ? 'grade-b' : 'grade-f'
    return `<tr>
      <td>${snap.course.name}</td>
      <td>${snap.course.courseCode ?? '—'}</td>
      <td class="${cls}">${score !== null ? `${score}%` : '—'}</td>
      <td>${percentToLetter(score)}</td>
      <td>${snap.gradedCount}/${snap.totalCount}</td>
      <td>${snap.missingCount > 0 ? `<span class="badge badge-danger">${snap.missingCount}</span>` : '0'}</td>
    </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 2.5rem; color: #111; background: #fff; font-size: 14px; }
  h1 { font-size: 26px; color: #1a1a2e; border-bottom: 3px solid #6366f1; padding-bottom: 10px; margin-bottom: 6px; }
  .subtitle { color: #666; font-size: 13px; margin-bottom: 28px; }
  h2 { font-size: 17px; color: #1a1a2e; margin-top: 28px; margin-bottom: 10px; border-left: 4px solid #6366f1; padding-left: 10px; }
  .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 18px 0; }
  .stat-box { background: #f8f8ff; border: 1px solid #e8e8f0; border-radius: 8px; padding: 14px; text-align: center; }
  .stat-num { font-size: 28px; font-weight: 700; color: #6366f1; }
  .stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #888; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 13px; }
  th { background: #f0f0ff; padding: 9px 12px; text-align: left; border: 1px solid #e0e0ee; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #555; }
  td { padding: 8px 12px; border: 1px solid #e8e8f0; vertical-align: middle; }
  tr:nth-child(even) td { background: #fafafa; }
  .grade-a { color: #16a34a; font-weight: 700; }
  .grade-b { color: #ca8a04; font-weight: 700; }
  .grade-f { color: #dc2626; font-weight: 700; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 100px; font-size: 11px; font-weight: 600; }
  .badge-danger { background: #fef2f2; color: #dc2626; }
  .footer { margin-top: 48px; padding-top: 14px; border-top: 1px solid #e8e8f0; font-size: 11px; color: #aaa; text-align: center; }
</style>
</head>
<body>
<h1>Semester Report — ${sem.term}</h1>
<p class="subtitle">Generated ${new Date().toLocaleDateString('en-US', { dateStyle: 'long' })} · Student Hub</p>

<h2>Summary</h2>
<div class="summary-grid">
  <div class="stat-box"><div class="stat-num">${sem.gpa?.toFixed(2) ?? '—'}</div><div class="stat-label">Est. GPA</div></div>
  <div class="stat-box"><div class="stat-num">${sem.avgScore !== null ? `${sem.avgScore}%` : '—'}</div><div class="stat-label">Avg Score</div></div>
  <div class="stat-box"><div class="stat-num">${sem.completionRate}%</div><div class="stat-label">Completion</div></div>
  <div class="stat-box"><div class="stat-num">${sem.courses.length}</div><div class="stat-label">Courses</div></div>
  <div class="stat-box"><div class="stat-num">${sem.totalGraded}</div><div class="stat-label">Graded</div></div>
  <div class="stat-box"><div class="stat-num">${sem.totalMissing}</div><div class="stat-label">Missing</div></div>
</div>

<h2>Course Breakdown</h2>
<table>
  <thead><tr><th>Course</th><th>Code</th><th>Score</th><th>Grade</th><th>Graded</th><th>Missing</th></tr></thead>
  <tbody>${courseRows}</tbody>
</table>

<div class="footer">Student Hub · Academic History Vault · ${sem.term}</div>
</body>
</html>`
}

// ─── Semester card ─────────────────────────────────────────────────────────────

function SemesterCard({ sem, isExpanded, onToggle, onExport }: {
  sem:       SemesterSnapshot
  isExpanded:boolean
  onToggle:  () => void
  onExport:  (sem: SemesterSnapshot) => void
}) {
  return (
    <div className="bg-surface-800 border border-white/5 rounded-xl overflow-hidden">
      {/* Header */}
      <button onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-white/3 transition-colors text-left">
        <Archive size={15} className={sem.isCurrent ? 'text-accent-400' : 'text-zinc-500'} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-zinc-100">{sem.term}</span>
            {sem.isCurrent && (
              <span className="text-2xs bg-accent-500/20 text-accent-400 px-1.5 py-0.5 rounded font-medium">Current</span>
            )}
          </div>
          <p className="text-2xs text-zinc-500 mt-0.5">
            {sem.courses.length} course{sem.courses.length !== 1 ? 's' : ''} · {sem.totalGraded} graded
          </p>
        </div>

        {/* Quick stats */}
        <div className="flex items-center gap-4 shrink-0 mr-3">
          <div className="text-right">
            <p className={cn('text-lg font-bold tabular-nums leading-none', gradeColor(sem.avgScore))}>
              {sem.avgScore !== null ? `${sem.avgScore}%` : '—'}
            </p>
            <p className="text-2xs text-zinc-600 mt-0.5">avg</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-accent-400 leading-none">
              {sem.gpa !== null ? sem.gpa.toFixed(2) : '—'}
            </p>
            <p className="text-2xs text-zinc-600 mt-0.5">GPA</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-zinc-300 leading-none">{sem.completionRate}%</p>
            <p className="text-2xs text-zinc-600 mt-0.5">done</p>
          </div>
        </div>

        <button onClick={e => { e.stopPropagation(); onExport(sem) }}
          className="p-1.5 rounded-md text-zinc-600 hover:text-zinc-300 hover:bg-white/8 transition-colors"
          title="Export semester report">
          <FileText size={13} />
        </button>

        <span className="text-zinc-600 shrink-0">
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            className="overflow-hidden border-t border-white/5">
            <div className="p-5 space-y-3">
              {sem.courses.map(snap => (
                <CourseRow key={snap.course.id} snap={snap} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function CourseRow({ snap }: { snap: CourseSnapshot }) {
  const score = snap.averageScore
  return (
    <div className="bg-surface-700 border border-white/5 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: snap.course.color ?? '#6366f1' }} />
            <p className="text-sm font-medium text-zinc-200 truncate">{snap.course.name}</p>
          </div>
          {snap.course.courseCode && (
            <p className="text-2xs text-zinc-500 mt-0.5 ml-4">{snap.course.courseCode}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <span className={cn('text-lg font-bold tabular-nums', gradeColor(score))}>
            {score !== null ? `${score}%` : '—'}
          </span>
          <span className="text-xs text-zinc-500 ml-1.5">{percentToLetter(score)}</span>
        </div>
      </div>

      {score !== null && (
        <div className="h-1.5 bg-surface-600 rounded-full overflow-hidden mb-3">
          <div className={cn('h-full rounded-full', gradeBg(score))}
            style={{ width: `${Math.min(score, 100)}%` }} />
        </div>
      )}

      <div className="flex gap-4 text-2xs text-zinc-500">
        <span className="flex items-center gap-1">
          <CheckCircle2 size={10} className="text-green-400" />
          {snap.gradedCount} graded
        </span>
        <span className="flex items-center gap-1">
          <BarChart2 size={10} />
          {snap.totalCount} total
        </span>
        {snap.missingCount > 0 && (
          <span className="flex items-center gap-1 text-red-400">
            <AlertCircle size={10} />
            {snap.missingCount} missing
          </span>
        )}
        <span className="flex items-center gap-1 text-zinc-600">
          {snap.completionRate}% done
        </span>
      </div>
    </div>
  )
}

// ─── Comparison panel ─────────────────────────────────────────────────────────

function ComparisonPanel({ semesters }: { semesters: SemesterSnapshot[] }) {
  const [termA, setTermA] = useState<string>(semesters[0]?.term ?? '')
  const [termB, setTermB] = useState<string>(semesters[1]?.term ?? semesters[0]?.term ?? '')

  const a = semesters.find(s => s.term === termA)
  const b = semesters.find(s => s.term === termB)

  const diff = (vA: number | null, vB: number | null, higherIsBetter = true) => {
    if (vA === null || vB === null) return null
    const d = vA - vB
    return { value: Math.abs(d), improved: higherIsBetter ? d > 0 : d < 0, zero: d === 0 }
  }

  const gpaDiff   = diff(a?.gpa ?? null,           b?.gpa ?? null)
  const scoreDiff = diff(a?.avgScore ?? null,       b?.avgScore ?? null)
  const compDiff  = diff(a?.completionRate ?? null, b?.completionRate ?? null)
  const missDiff  = diff(a?.totalMissing ?? null,   b?.totalMissing ?? null, false)

  function DiffBadge({ d }: { d: ReturnType<typeof diff> }) {
    if (!d) return <span className="text-zinc-600">—</span>
    if (d.zero) return <span className="text-zinc-500">No change</span>
    return (
      <span className={cn('flex items-center gap-0.5', d.improved ? 'text-green-400' : 'text-red-400')}>
        {d.improved ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
        {d.value.toFixed(d.value < 10 ? 2 : 0)}
      </span>
    )
  }

  const select = 'bg-surface-700 border border-white/10 rounded-md text-xs text-zinc-300 px-2 py-1.5 focus:outline-none focus:border-accent-500/60'

  return (
    <div className="bg-surface-800 border border-white/5 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <ArrowLeftRight size={14} className="text-accent-400" />
        <h3 className="text-sm font-semibold text-zinc-100">Semester Comparison</h3>
      </div>

      {/* Selector row */}
      <div className="grid grid-cols-3 gap-3 items-center">
        <select value={termA} onChange={e => setTermA(e.target.value)} className={select}>
          {semesters.map(s => <option key={s.term} value={s.term}>{s.term}</option>)}
        </select>
        <div className="text-center text-xs text-zinc-600 font-medium">vs</div>
        <select value={termB} onChange={e => setTermB(e.target.value)} className={select}>
          {semesters.map(s => <option key={s.term} value={s.term}>{s.term}</option>)}
        </select>
      </div>

      {/* Metrics grid */}
      <div className="space-y-px rounded-lg overflow-hidden border border-white/5">
        {[
          { label: 'Est. GPA',        a: a?.gpa?.toFixed(2),       b: b?.gpa?.toFixed(2),       diff: gpaDiff },
          { label: 'Average score',   a: a?.avgScore != null ? `${a.avgScore}%` : null, b: b?.avgScore != null ? `${b.avgScore}%` : null, diff: scoreDiff },
          { label: 'Completion rate', a: a?.completionRate != null ? `${a.completionRate}%` : null, b: b?.completionRate != null ? `${b.completionRate}%` : null, diff: compDiff },
          { label: 'Missing work',    a: String(a?.totalMissing ?? '—'),   b: String(b?.totalMissing ?? '—'),    diff: missDiff },
          { label: 'Courses',         a: String(a?.courses.length ?? '—'), b: String(b?.courses.length ?? '—'), diff: null },
          { label: 'Graded',          a: String(a?.totalGraded ?? '—'),    b: String(b?.totalGraded ?? '—'),    diff: null },
        ].map(row => (
          <div key={row.label} className="grid grid-cols-4 bg-surface-700 hover:bg-surface-600 transition-colors">
            <div className="px-3 py-2.5 text-2xs text-zinc-500 font-medium uppercase tracking-wider">{row.label}</div>
            <div className="px-3 py-2.5 text-xs text-zinc-200 font-mono">{row.a ?? '—'}</div>
            <div className="px-3 py-2.5 text-xs text-zinc-200 font-mono">{row.b ?? '—'}</div>
            <div className="px-3 py-2.5 text-xs"><DiffBadge d={row.diff} /></div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Export modal ─────────────────────────────────────────────────────────────

function ExportButton({ sem }: { sem: SemesterSnapshot }) {
  const [exporting, setExporting] = useState(false)
  const [format, setFormat] = useState<'md' | 'pdf'>('md')

  const doExport = async () => {
    setExporting(true)
    const slug = sem.term.replace(/[^a-z0-9]/gi, '-').toLowerCase()
    try {
      if (format === 'md') {
        const content = generateSemesterMarkdown(sem)
        await (window.api as typeof window.api).export.saveMarkdown({
          filename: `semester-report-${slug}.md`,
          content,
        })
      } else {
        const html = generateSemesterHtml(sem)
        await (window.api as typeof window.api).export.savePdf({
          filename: `semester-report-${slug}.pdf`,
          html,
        })
      }
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select value={format} onChange={e => setFormat(e.target.value as 'md' | 'pdf')}
        className="bg-surface-700 border border-white/10 rounded-md text-xs text-zinc-300 px-2 py-1.5 focus:outline-none">
        <option value="md">Markdown (.md)</option>
        <option value="pdf">PDF (.pdf)</option>
      </select>
      <button onClick={doExport} disabled={exporting}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent-500/15 border border-accent-500/30 text-accent-400 text-xs font-medium hover:bg-accent-500/25 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
        {exporting ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
        {exporting ? 'Exporting...' : 'Export'}
      </button>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function History() {
  const [semesters, setSemesters]   = useState<SemesterSnapshot[]>([])
  const [loading,   setLoading]     = useState(true)
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set<string>())
  const [showCompare, setShowCompare] = useState(false)

  useEffect(() => {
    const load = async () => {
      // Get active course IDs to mark the current semester
      const activeRes = await api.courses.getAll()
      const activeIds = new Set<string>((activeRes.ok ? activeRes.data : []).map((c: Course) => c.id))
      const snaps = await buildSnapshots(activeIds)
      setSemesters(snaps)
      // Auto-expand the current semester
      const current = snaps.find(s => s.isCurrent)
      if (current) setExpanded(new Set<string>([current.term]))
      setLoading(false)
    }
    load()
  }, [])

  const toggleExpand = (term: string) =>
    setExpanded(prev => {
      const next = new Set<string>(prev)
      next.has(term) ? next.delete(term) : next.add(term)
      return next
    })

  const handleExport = (_sem: SemesterSnapshot) => {
    // Export triggered inline via <ExportButton> rendered below each expanded card
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Spinner size={20} /></div>
  }

  if (!semesters.length) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Archive size={32} className="text-zinc-700 mx-auto mb-3" />
          <p className="text-sm text-zinc-400">No academic history yet</p>
          <p className="text-xs text-zinc-600 mt-1">Connect Canvas and sync to build your vault.</p>
        </div>
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full overflow-y-auto">
      <div className="p-6 max-w-3xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-zinc-100 flex items-center gap-2">
              <Archive size={18} className="text-accent-400" /> Academic History Vault
            </h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {semesters.length} semester{semesters.length !== 1 ? 's' : ''} · read-only archive
            </p>
          </div>
          <button onClick={() => setShowCompare(v => !v)}
            className={cn('flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors',
              showCompare
                ? 'bg-accent-500/15 border-accent-500/40 text-accent-400'
                : 'border-white/10 text-zinc-400 hover:text-zinc-200 hover:border-white/20')}>
            <ArrowLeftRight size={13} /> Compare
          </button>
        </div>

        {/* GPA timeline bar */}
        {semesters.filter(s => s.gpa !== null).length > 1 && (
          <div className="bg-surface-800 border border-white/5 rounded-xl p-5">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">GPA Timeline</p>
            <div className="flex items-end gap-3 h-20">
              {[...semesters].reverse().filter(s => s.gpa !== null).map(s => (
                <div key={s.term} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-2xs text-zinc-500 tabular-nums">{s.gpa!.toFixed(2)}</span>
                  <div className="w-full rounded-t-sm"
                    style={{
                      height:     `${(s.gpa! / 4.0) * 60}px`,
                      background: s.isCurrent ? '#6550f3' : '#374151',
                    }} />
                  <span className="text-2xs text-zinc-600 truncate w-full text-center"
                    title={s.term}>{s.term.slice(0, 8)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Comparison panel */}
        <AnimatePresence>
          {showCompare && semesters.length >= 2 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <ComparisonPanel semesters={semesters} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Semester cards */}
        {semesters.map(sem => (
          <div key={sem.term}>
            <SemesterCard
              sem={sem}
              isExpanded={expanded.has(sem.term)}
              onToggle={() => toggleExpand(sem.term)}
              onExport={handleExport}
            />
            {/* Inline export controls when expanded */}
            {expanded.has(sem.term) && (
              <div className="flex justify-end mt-2">
                <ExportButton sem={sem} />
              </div>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  )
}
