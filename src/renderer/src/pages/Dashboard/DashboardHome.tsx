// DashboardHome — the Phase-2 focused dashboard (default UI). A fixed,
// opinionated layout that surfaces what's urgent immediately. The customizable
// widget dashboard lives in LegacyDashboard (Legacy UI). Calculation/data come
// from the shared useDashboardData hook — no backend changes.

import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { format, isToday, differenceInCalendarDays } from 'date-fns'
import {
  CalendarClock, AlertTriangle, CheckCircle2, RefreshCw, ArrowRight,
  BookOpen, TrendingUp, Sparkles,
} from 'lucide-react'
import { api } from '../../lib/ipc'
import { cn } from '../../lib/utils'
import { Card, Badge, Skeleton } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { useAppStore } from '../../store/app.store'
import { useSyncStore } from '../../store/sync.store'
import { useDashboardData } from './useDashboardData'
import { useCumulativeGpa } from './useCumulativeGpa'
import DashboardViewSwitch from './DashboardViewSwitch'
import type { Course, Assignment, Grade } from '@shared/types/entities'

type Item = Assignment & { course?: Course; grade?: Grade }

const isPending = (a: Item) => !a.grade || a.grade.workflowState === 'unsubmitted'
const gradeColor = (p: number | null | undefined) =>
  p == null ? 'text-zinc-500' : p >= 90 ? 'text-green-400' : p >= 70 ? 'text-amber-400' : 'text-red-400'
const barColor = (p: number | null | undefined) =>
  p == null ? 'bg-zinc-600' : p >= 90 ? 'bg-green-500' : p >= 70 ? 'bg-amber-500' : 'bg-red-500'

// ─── Assignment row ───────────────────────────────────────────────────────────

function DueRow({ a, overdue }: { a: Item; overdue?: boolean }) {
  const time = a.dueAt ? format(a.dueAt, 'h:mm a') : null
  return (
    <Link to={`/assignments/${a.id}`}
      className="flex items-center gap-3 px-3 h-12 hover:bg-surface-700/60 transition-colors duration-100 group">
      <span className="w-0.5 self-stretch my-2 rounded-full shrink-0"
        style={{ background: a.course?.color ?? '#6366f1' }} />
      <div className="flex-1 min-w-0">
        <p className="t-body text-zinc-200 truncate group-hover:text-zinc-50">{a.title}</p>
        <p className="t-caption text-zinc-500 truncate">{a.course?.name}</p>
      </div>
      {overdue
        ? <Badge variant="danger">Overdue</Badge>
        : time && <span className="tnum t-caption text-zinc-400 shrink-0">{time}</span>}
    </Link>
  )
}

// ─── Course grade card ────────────────────────────────────────────────────────

function GradeCard({ c }: { c: Course }) {
  const pct = c.currentScore
  return (
    <Link to={`/courses/${c.id}`}
      className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-surface-700/60 transition-colors duration-100">
      <span className="w-[3px] h-8 rounded-full shrink-0" style={{ background: c.color ?? '#6366f1' }} />
      <div className="flex-1 min-w-0">
        <p className="t-body text-zinc-200 truncate">{c.name}</p>
        <div className="mt-1 h-1 rounded-full bg-surface-600 overflow-hidden">
          <div className={cn('h-full rounded-full', barColor(pct))}
            style={{ width: `${Math.max(0, Math.min(100, pct ?? 0))}%` }} />
        </div>
      </div>
      <span className={cn('tnum t-heading shrink-0 w-12 text-right', gradeColor(pct))}>
        {pct == null ? '—' : `${pct.toFixed(0)}%`}
      </span>
    </Link>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function DashboardHome() {
  const isSyncing    = useAppStore(s => s.isSyncing)
  const integrations = useAppStore(s => s.integrations)
  const setIsSyncing = useAppStore(s => s.setIsSyncing)
  const { progress, errors } = useSyncStore()
  const { courses, assignments, loading } = useDashboardData(isSyncing, false)
  // GPA is cumulative — computed over ALL courses (current + history), not just
  // the active courses shown below (BUG-011).
  const gpa = useCumulativeGpa(isSyncing)

  const now = Date.now()
  const weekAhead = now + 7 * 86400_000

  const overdue = useMemo(() => assignments
    .filter(a => a.dueAt && a.dueAt < now && !isToday(a.dueAt) && isPending(a))
    .sort((a, b) => (b.dueAt ?? 0) - (a.dueAt ?? 0)), [assignments, now])

  const today = useMemo(() => assignments
    .filter(a => a.dueAt && isToday(a.dueAt) && isPending(a))
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0)), [assignments])

  const week = useMemo(() => assignments
    .filter(a => a.dueAt && !isToday(a.dueAt) && a.dueAt > now && a.dueAt <= weekAhead && isPending(a))
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0)), [assignments, now, weekAhead])

  const weekByDay = useMemo(() => {
    const groups: { key: string; label: string; items: Item[] }[] = []
    for (const a of week) {
      const d = a.dueAt!
      const key = format(d, 'yyyy-MM-dd')
      let g = groups.find(x => x.key === key)
      if (!g) {
        const days = differenceInCalendarDays(d, now)
        const label = days === 1 ? 'Tomorrow' : format(d, 'EEEE, MMM d')
        g = { key, label, items: [] }
        groups.push(g)
      }
      g.items.push(a)
    }
    return groups
  }, [week, now])

  // Stats (GPA comes from useCumulativeGpa above — all courses, not just active).
  const dueThisWeek = today.length + week.length
  const missing = overdue.length

  const lastSyncedAt = integrations.reduce<number | null>(
    (m, i) => (i.lastSyncedAt && (!m || i.lastSyncedAt > m) ? i.lastSyncedAt : m), null)
  const hasError = Object.values(errors).some(Boolean)
  const syncing = isSyncing || Object.keys(progress).length > 0

  const stats = [
    { label: 'Courses',       value: courses.length,    icon: <BookOpen size={14} /> },
    { label: 'Due this week', value: dueThisWeek,        icon: <CalendarClock size={14} /> },
    { label: 'Missing',       value: missing,            icon: <AlertTriangle size={14} />, danger: missing > 0 },
    { label: 'GPA',           value: gpa == null ? '—' : gpa.toFixed(2), icon: <TrendingUp size={14} /> },
  ]

  if (loading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
          <Skeleton className="w-52 h-6" />
          <div className="grid lg:grid-cols-[1fr,340px] gap-5">
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="w-full h-12 rounded-lg" />)}</div>
            <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="w-full h-24 rounded-lg" />)}</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="t-display text-zinc-100">Dashboard</h1>
            <p className="t-caption text-zinc-500 mt-1">{format(now, 'EEEE, MMMM d')}</p>
          </div>
          <div className="flex items-center gap-2">
            <DashboardViewSwitch />
            <Button variant="secondary" size="sm" icon={<RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />}
              loading={syncing} onClick={() => { setIsSyncing(true); api.sync.startAll() }}>
              {syncing ? 'Syncing…' : 'Sync'}
            </Button>
          </div>
        </div>

        {/* Quick stats — unified row */}
        <Card padding={false} className="flex divide-x divide-white/[0.06]">
          {stats.map(s => (
            <div key={s.label} className="flex-1 px-4 py-3">
              <div className={cn('flex items-center gap-1.5 mb-1', s.danger ? 'text-red-400' : 'text-zinc-500')}>
                {s.icon}<span className="t-micro uppercase tracking-wide">{s.label}</span>
              </div>
              <p className={cn('tnum t-display', s.danger ? 'text-red-400' : 'text-zinc-100')}>{s.value}</p>
            </div>
          ))}
        </Card>

        {/* Two columns */}
        <div className="grid lg:grid-cols-[1fr,340px] gap-5 items-start">
          {/* Left — urgent */}
          <div className="space-y-5">
            {/* Today */}
            <section>
              <h2 className="t-subheading text-zinc-400 mb-2 px-1">Today</h2>
              {overdue.length === 0 && today.length === 0 ? (
                <Card className="flex items-center gap-3">
                  <CheckCircle2 size={18} className="text-green-400 shrink-0" />
                  <div>
                    <p className="t-body text-zinc-200">You're clear for today</p>
                    <p className="t-caption text-zinc-500">Nothing due — nice work staying ahead.</p>
                  </div>
                </Card>
              ) : (
                <Card padding={false} className="divide-y divide-white/[0.05] overflow-hidden">
                  {overdue.map(a => <DueRow key={a.id} a={a} overdue />)}
                  {today.map(a => <DueRow key={a.id} a={a} />)}
                </Card>
              )}
            </section>

            {/* This week */}
            <section>
              <h2 className="t-subheading text-zinc-400 mb-2 px-1">This week</h2>
              {weekByDay.length === 0 ? (
                <Card className="text-center py-6">
                  <p className="t-caption text-zinc-500">Nothing due in the next 7 days.</p>
                </Card>
              ) : (
                <div className="space-y-3">
                  {weekByDay.map(g => (
                    <div key={g.key}>
                      <p className="t-micro uppercase tracking-[0.08em] text-zinc-600 mb-1 px-1">{g.label}</p>
                      <Card padding={false} className="divide-y divide-white/[0.05] overflow-hidden">
                        {g.items.map(a => <DueRow key={a.id} a={a} />)}
                      </Card>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Right — status */}
          <div className="space-y-5">
            {/* Current grades */}
            <section>
              <div className="flex items-center justify-between mb-2 px-1">
                <h2 className="t-subheading text-zinc-400">Current grades</h2>
                <Link to="/grades" className="t-caption text-zinc-500 hover:text-accent-400 inline-flex items-center gap-0.5">
                  All <ArrowRight size={11} />
                </Link>
              </div>
              {courses.length === 0 ? (
                <Card className="text-center py-6"><p className="t-caption text-zinc-500">No courses synced.</p></Card>
              ) : (
                <Card padding={false} className="p-1.5">
                  {courses.slice(0, 6).map(c => <GradeCard key={c.id} c={c} />)}
                </Card>
              )}
            </section>

            {/* Sync status */}
            <section>
              <h2 className="t-subheading text-zinc-400 mb-2 px-1">Sync</h2>
              <Card className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className={cn('w-2 h-2 rounded-full shrink-0',
                    hasError ? 'bg-red-500' : syncing ? 'bg-amber-500' : 'bg-green-500')} />
                  <p className="t-body text-zinc-200 flex-1">
                    {hasError ? 'Sync failed' : syncing ? 'Syncing…'
                      : lastSyncedAt ? `Synced ${format(lastSyncedAt, 'MMM d, h:mm a')}` : 'Not synced yet'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {integrations.map(i => (
                    <Badge key={i.id} variant="default">{i.displayName}</Badge>
                  ))}
                </div>
                <Button variant="secondary" size="sm" className="w-full"
                  icon={<RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />}
                  loading={syncing} onClick={() => { setIsSyncing(true); api.sync.startAll() }}>
                  Sync now
                </Button>
              </Card>
            </section>

            {/* Simulator nudge */}
            <Link to="/simulator">
              <Card interactive className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent-500/15 flex items-center justify-center shrink-0">
                  <Sparkles size={15} className="text-accent-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="t-body text-zinc-200">Outcome Simulator</p>
                  <p className="t-caption text-zinc-500">See what you need on what's left.</p>
                </div>
                <ArrowRight size={15} className="text-zinc-600 shrink-0" />
              </Card>
            </Link>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
