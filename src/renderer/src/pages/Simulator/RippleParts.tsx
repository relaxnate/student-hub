// Shared presentational pieces for the Ripple Effect chain and the GPA-booster
// action list. Used by both the Ripple tab and the Ask tab so their visuals and
// numbers stay identical.

import { ArrowDown, AlertCircle, CheckCircle2 } from 'lucide-react'
import { cn, percentToLetter } from '../../lib/utils'
import type { RippleResult, RippleStatus, GpaAction } from './simMath'

export const STATUS_STYLE: Record<RippleStatus, { text: string; bg: string; label: string; icon: React.ReactNode }> = {
  'on-track': { text: 'text-green-400', bg: 'bg-green-500/15', label: 'On Track',  icon: <CheckCircle2 size={14} /> },
  'warning':  { text: 'text-amber-400', bg: 'bg-amber-500/15', label: 'Caution — below 3.0', icon: <AlertCircle size={14} /> },
  'at-risk':  { text: 'text-red-400',   bg: 'bg-red-500/15',   label: 'At Risk — below 2.0',  icon: <AlertCircle size={14} /> },
}

export function fmtGpa(n: number | null): string { return n === null ? '—' : n.toFixed(2) }
export function fmtPct(n: number | null): string { return n === null ? '—' : `${Math.round(n)}%` }
export function fmtDelta(n: number | null, suffix: string): string {
  if (n === null) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n}${suffix}`
}
export function deltaColor(n: number | null): string {
  if (n === null || n === 0) return 'text-zinc-500'
  return n > 0 ? 'text-green-400' : 'text-red-400'
}

// The full Assignment → (Group) → Course → Semester GPA → Cumulative GPA chain.
export function RippleChain({ ripple, groupContext }: { ripple: RippleResult; groupContext?: string }) {
  const status = STATUS_STYLE[ripple.status]
  const pts = ripple.pointsPossible
  const letterBefore = percentToLetter(ripple.courseBefore === null ? null : Math.round(ripple.courseBefore))
  const letterAfter  = percentToLetter(ripple.courseAfter === null ? null : Math.round(ripple.courseAfter))

  return (
    <div className="rounded-lg bg-surface-900/50 border border-white/5 p-3.5 text-sm space-y-1.5">
      <Line label="Assignment score" value={`${Math.round(ripple.simulatedScore)}/${pts ?? '—'}`} />
      {groupContext && (
        <div className="flex items-center gap-1.5 pl-1">
          <ArrowDown size={12} className="text-zinc-600" />
          <span className="text-2xs text-zinc-500">via {groupContext}</span>
        </div>
      )}
      <Arrow delta={fmtDelta(ripple.courseDelta, '% on course grade')} color={deltaColor(ripple.courseDelta)} />
      <Line label="Course grade"
        value={
          <span>
            <span className="text-zinc-400">{fmtPct(ripple.courseBefore)}</span>
            <span className="text-zinc-600 mx-1.5">→</span>
            <span className="text-zinc-100 font-semibold">{fmtPct(ripple.courseAfter)}</span>
            <span className="text-zinc-500 ml-1.5">({letterBefore} → {letterAfter})</span>
          </span>
        } />
      <Arrow delta={fmtDelta(ripple.semesterGpaDelta, ' GPA points')} color={deltaColor(ripple.semesterGpaDelta)} />
      <Line label="Semester GPA"
        value={
          <span>
            <span className="text-zinc-400">{fmtGpa(ripple.semesterGpaBefore)}</span>
            <span className="text-zinc-600 mx-1.5">→</span>
            <span className="text-zinc-100 font-semibold">{fmtGpa(ripple.semesterGpaAfter)}</span>
          </span>
        } />
      <Arrow delta={fmtDelta(ripple.cumulativeGpaDelta, ' GPA points')} color={deltaColor(ripple.cumulativeGpaDelta)} />
      <Line label="Cumulative GPA"
        value={
          <span>
            <span className="text-zinc-400">{fmtGpa(ripple.cumulativeGpaBefore)}</span>
            <span className="text-zinc-600 mx-1.5">→</span>
            <span className="text-zinc-100 font-semibold">{fmtGpa(ripple.cumulativeGpaAfter)}</span>
          </span>
        } />
      <div className={cn('flex items-center gap-2 mt-2 px-2.5 py-1.5 rounded-md', status.bg, status.text)}>
        {status.icon}
        <span className="text-xs font-semibold">Status: {status.label}</span>
      </div>
    </div>
  )
}

// Ranked "fastest way to raise my GPA" action list.
export function FastestActionsList({ actions }: { actions: GpaAction[] }) {
  if (actions.length === 0) {
    return (
      <p className="text-xs text-zinc-500">
        No missing or low-scoring assignments found in your active courses — nicely done.
      </p>
    )
  }
  return (
    <ol className="space-y-2">
      {actions.map((act, i) => (
        <li key={act.assignmentId}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-surface-700/50 border border-white/5">
          <span className="w-5 h-5 rounded-full bg-accent-500/20 text-accent-400 text-2xs font-bold flex items-center justify-center shrink-0">
            {i + 1}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-zinc-200 truncate">{act.assignmentTitle}</p>
            <p className="text-2xs text-zinc-500 truncate">
              {act.courseName} ·{' '}
              {act.kind === 'missing' ? 'Missing' : `${act.currentScore}/${act.pointsPossible}`}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-green-400 font-semibold tabular-nums">+{act.gpaGain.toFixed(2)} GPA</p>
            <p className="text-2xs text-zinc-600">
              {act.kind === 'missing' ? 'Complete this' : `Improve to ${Math.round(act.targetScore)}`}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-xs tabular-nums">{value}</span>
    </div>
  )
}
function Arrow({ delta, color }: { delta: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5 pl-1">
      <ArrowDown size={12} className="text-zinc-600" />
      <span className={cn('text-2xs font-medium tabular-nums', color)}>{delta}</span>
    </div>
  )
}
