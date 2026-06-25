import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShieldAlert, ShieldCheck, ShieldX, AlertTriangle,
  TrendingUp, TrendingDown, Minus, ChevronRight,
  Clock, AlertCircle, CheckCircle2, Info,
} from 'lucide-react'
import { api } from '../../lib/ipc'
import { cn } from '../../lib/utils'
import { Skeleton } from '../../components/ui/Badge'
import type { GradeRescueReport, RescueAction, RescueRiskLevel } from '@shared/types/ipc'

// ─── Risk level meta ─────────────────────────────────────────────────────────

const RISK_META: Record<RescueRiskLevel, {
  label: string
  icon: React.ReactNode
  color: string
  bg: string
  border: string
  dot: string
}> = {
  safe: {
    label:  'Safe',
    icon:   <ShieldCheck size={13} />,
    color:  'text-green-400',
    bg:     'bg-green-500/10',
    border: 'border-green-500/25',
    dot:    'bg-green-400',
  },
  warning: {
    label:  'Warning',
    icon:   <AlertTriangle size={13} />,
    color:  'text-amber-400',
    bg:     'bg-amber-500/10',
    border: 'border-amber-500/25',
    dot:    'bg-amber-400',
  },
  critical: {
    label:  'Critical',
    icon:   <ShieldX size={13} />,
    color:  'text-red-400',
    bg:     'bg-red-500/10',
    border: 'border-red-500/25',
    dot:    'bg-red-500',
  },
  insufficient_data: {
    label:  'No Data',
    icon:   <Info size={13} />,
    color:  'text-zinc-500',
    bg:     'bg-zinc-700/20',
    border: 'border-zinc-700/40',
    dot:    'bg-zinc-600',
  },
}

const URGENCY_META = {
  overdue:  { label: 'Overdue',  color: 'text-red-400',   bg: 'bg-red-900/20',   border: 'border-red-700/30'   },
  soon:     { label: 'Due Soon', color: 'text-amber-400', bg: 'bg-amber-900/20', border: 'border-amber-700/30' },
  upcoming: { label: 'Upcoming', color: 'text-zinc-400',  bg: 'bg-zinc-800/50',  border: 'border-white/8'      },
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function GradeRescue() {
  const [reports,  setReports]  = useState<GradeRescueReport[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  useEffect(() => {
    api.gradeRescue.getAll().then(r => {
      if (r.ok) {
        setReports(r.data)
        // Pre-select first course with actionable data
        const first = r.data.find(x => x.riskLevel !== 'insufficient_data') ?? r.data[0]
        if (first) setSelected(first.courseId)
      } else {
        setError(r.error)
      }
      setLoading(false)
    })
  }, [])

  const activeReport = reports.find(r => r.courseId === selected) ?? null

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-surface-800 border border-white/5 p-4 space-y-3">
            <Skeleton className="w-full h-4 rounded-lg" />
            <Skeleton className="w-3/4 h-3" />
            <Skeleton className="w-full h-8 rounded-lg" />
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle size={28} className="text-red-400 mx-auto mb-3" />
          <p className="text-sm text-zinc-400">Failed to load rescue data</p>
          <p className="text-xs text-zinc-600 mt-1">{error}</p>
        </div>
      </div>
    )
  }

  if (reports.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <ShieldAlert size={32} className="text-zinc-700 mx-auto mb-4" />
          <p className="text-sm text-zinc-400 mb-1">No courses to analyse</p>
          <p className="text-xs text-zinc-600">Connect Canvas and sync your courses first.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex overflow-hidden">
      {/* ── Left panel: course list ─────────────────────────────────────── */}
      <aside className="w-52 shrink-0 border-r border-white/5 flex flex-col">
        <div className="px-4 py-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <ShieldAlert size={15} className="text-accent-400 shrink-0" />
            <span className="text-sm font-semibold text-zinc-100">Grade Rescue</span>
          </div>
          <p className="text-2xs text-zinc-500 mt-1 leading-snug">
            Recovery plan for each active course
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
          {reports.map(r => {
            const meta = RISK_META[r.riskLevel]
            return (
              <button
                key={r.courseId}
                onClick={() => setSelected(r.courseId)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors',
                  selected === r.courseId
                    ? 'bg-accent-500/15 text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                )}
              >
                <span className={cn('w-2 h-2 rounded-full shrink-0', meta.dot)} />
                <span className="flex-1 text-xs leading-tight line-clamp-2">{r.courseName}</span>
                <span className={cn('text-2xs font-medium shrink-0', meta.color)}>{meta.label}</span>
              </button>
            )
          })}
        </nav>

        {/* Summary counts */}
        <div className="border-t border-white/5 px-4 py-3 space-y-1">
          {(['critical', 'warning', 'safe'] as RescueRiskLevel[]).map(level => {
            const count = reports.filter(r => r.riskLevel === level).length
            if (count === 0) return null
            const m = RISK_META[level]
            return (
              <div key={level} className="flex items-center justify-between text-xs">
                <span className={cn('flex items-center gap-1.5', m.color)}>
                  {m.icon}{m.label}
                </span>
                <span className="text-zinc-500">{count}</span>
              </div>
            )
          })}
        </div>
      </aside>

      {/* ── Right panel: rescue detail ──────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeReport ? (
            <motion.div
              key={activeReport.courseId}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15 }}
              className="p-6 max-w-2xl space-y-6"
            >
              <RescueHeader report={activeReport} />

              {activeReport.riskLevel === 'insufficient_data' ? (
                <InsufficientDataCard reason={activeReport.insufficientDataReason} />
              ) : (
                <>
                  <GradeSnapshot report={activeReport} />
                  <MinScorePanel report={activeReport} />
                  <TopActionsPanel actions={activeReport.topActions} />
                </>
              )}
            </motion.div>
          ) : (
            <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
              Select a course to view its rescue plan
            </div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}

// ─── Header ───────────────────────────────────────────────────────────────────

function RescueHeader({ report }: { report: GradeRescueReport }) {
  const meta = RISK_META[report.riskLevel]
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-base font-semibold text-zinc-100 leading-tight">{report.courseName}</h1>
        {report.riskLevel !== 'insufficient_data' && (
          <p className="text-xs text-zinc-500 mt-0.5">
            {report.totalUnsubmitted} unsubmitted · {report.totalMissing} overdue
          </p>
        )}
      </div>
      <span className={cn(
        'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border shrink-0',
        meta.color, meta.bg, meta.border
      )}>
        {meta.icon}{meta.label}
      </span>
    </div>
  )
}

// ─── Grade snapshot ───────────────────────────────────────────────────────────

function GradeSnapshot({ report }: { report: GradeRescueReport }) {
  const cols = [
    {
      label: 'Current grade',
      value: report.currentGrade,
      sub:   'Based on graded work',
      icon:  <Minus size={13} className="text-zinc-500" />,
    },
    {
      label: 'Worst case',
      value: report.projectedPessimistic,
      sub:   'If remaining = 0%',
      icon:  <TrendingDown size={13} className="text-red-400" />,
    },
    {
      label: 'Best case',
      value: report.projectedOptimistic,
      sub:   'If remaining = 100%',
      icon:  <TrendingUp size={13} className="text-green-400" />,
    },
  ]

  return (
    <section>
      <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2.5">Grade Snapshot</h2>
      <div className="grid grid-cols-3 gap-3">
        {cols.map(col => (
          <div key={col.label} className="bg-surface-800 border border-white/5 rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-2">{col.icon}
              <span className="text-xs text-zinc-500">{col.label}</span>
            </div>
            <p className={cn(
              'text-2xl font-bold',
              col.value == null ? 'text-zinc-600' :
              col.value >= 80   ? 'text-green-400' :
              col.value >= 60   ? 'text-amber-400' : 'text-red-400'
            )}>
              {col.value != null ? `${col.value}%` : '—'}
            </p>
            <p className="text-2xs text-zinc-600 mt-1">{col.sub}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Minimum score panel ──────────────────────────────────────────────────────

function MinScorePanel({ report }: { report: GradeRescueReport }) {
  const rows: { label: string; target: string; value: number | null }[] = [
    { label: 'To pass',    target: '60%', value: report.minScoreToPass },
    { label: 'For a C',   target: '70%', value: report.minScoreForC   },
    { label: 'For a B',   target: '80%', value: report.minScoreForB   },
  ]

  const hasRemaining = rows.some(r => r.value !== null)
  if (!hasRemaining) return null

  return (
    <section>
      <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2.5">
        What You Need on Remaining Work
      </h2>
      <div className="bg-surface-800 border border-white/5 rounded-xl divide-y divide-white/5">
        {rows.map(row => {
          if (row.value === null) return null
          const impossible = row.value > 100
          const already    = row.value <= 0
          return (
            <div key={row.label} className="flex items-center justify-between px-4 py-3">
              <div>
                <span className="text-sm text-zinc-200">{row.label}</span>
                <span className="text-xs text-zinc-500 ml-2">({row.target} final)</span>
              </div>
              <div className="text-right">
                {impossible ? (
                  <span className="text-xs font-semibold text-red-400">Not achievable</span>
                ) : already ? (
                  <span className="text-xs font-semibold text-green-400">Already there</span>
                ) : (
                  <span className={cn(
                    'text-sm font-bold',
                    row.value >= 90 ? 'text-red-400' :
                    row.value >= 75 ? 'text-amber-400' : 'text-green-400'
                  )}>
                    {row.value}% avg
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-2xs text-zinc-600 mt-1.5 px-0.5">
        Averages across all remaining unsubmitted assignments (approximate for weighted courses).
      </p>
    </section>
  )
}

// ─── Top actions ──────────────────────────────────────────────────────────────

function TopActionsPanel({ actions }: { actions: RescueAction[] }) {
  if (actions.length === 0) {
    return (
      <section>
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2.5">
          Top Recovery Actions
        </h2>
        <div className="bg-surface-800 border border-white/5 rounded-xl p-6 text-center">
          <CheckCircle2 size={20} className="text-green-400 mx-auto mb-2" />
          <p className="text-sm text-zinc-400">All assignments submitted</p>
          <p className="text-xs text-zinc-600 mt-0.5">No remaining work to prioritise.</p>
        </div>
      </section>
    )
  }

  return (
    <section>
      <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2.5">
        Top Recovery Actions
      </h2>
      <div className="space-y-2.5">
        {actions.map((action, i) => (
          <ActionCard key={action.assignmentId} action={action} rank={i + 1} />
        ))}
      </div>
    </section>
  )
}

function ActionCard({ action, rank }: { action: RescueAction; rank: number }) {
  const urgency = URGENCY_META[action.urgency]

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.05 }}
      className={cn(
        'rounded-xl border p-4',
        action.urgency === 'overdue' ? 'bg-red-900/10 border-red-700/25' :
        action.urgency === 'soon'    ? 'bg-amber-900/10 border-amber-700/25' :
        'bg-surface-800 border-white/5'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Rank badge */}
        <div className={cn(
          'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5',
          rank === 1 ? 'bg-accent-500/30 text-accent-300' : 'bg-white/8 text-zinc-400'
        )}>
          {rank}
        </div>

        <div className="flex-1 min-w-0">
          {/* Assignment name */}
          <p className="text-sm font-medium text-zinc-100 leading-tight truncate">
            {action.assignmentName}
          </p>

          {/* Category + points */}
          <p className="text-xs text-zinc-500 mt-0.5">
            {action.category} · {action.pointsPossible} pts
          </p>

          {/* Impact row */}
          <div className="flex items-center gap-3 mt-2">
            <span className="flex items-center gap-1 text-xs font-semibold text-green-400">
              <TrendingUp size={11} />
              +{action.gradeImpact}% grade impact
            </span>
            <span className={cn(
              'flex items-center gap-1 text-2xs font-medium px-1.5 py-0.5 rounded-md border',
              urgency.color, urgency.bg, urgency.border
            )}>
              {action.urgency === 'overdue' && <AlertCircle size={10} />}
              {action.urgency === 'soon'    && <Clock size={10} />}
              {urgency.label}
            </span>
          </div>
        </div>

        <ChevronRight size={14} className="text-zinc-600 shrink-0 mt-1" />
      </div>
    </motion.div>
  )
}

// ─── Insufficient data fallback ───────────────────────────────────────────────

function InsufficientDataCard({ reason }: { reason: string | null }) {
  return (
    <div className="bg-surface-800 border border-white/5 rounded-xl p-6">
      <div className="flex items-start gap-3">
        <Info size={16} className="text-zinc-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-zinc-300">Insufficient data</p>
          <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
            {reason ?? 'Not enough grade data to generate a rescue plan for this course.'}
          </p>
          <p className="text-xs text-zinc-600 mt-2">
            Sync your Canvas data and check back once assignments have been graded.
          </p>
        </div>
      </div>
    </div>
  )
}
