// Component 2 — Ripple Effect Calculator
// Search any assignment, drag a 0..pointsPossible slider, and watch the impact
// chain: Assignment score → Course grade → Semester GPA → Cumulative GPA, with a
// color-coded status. Plus a "fastest way to raise my GPA" ranked action list.

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Search, Zap, TrendingUp, Target } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/Badge'
import { computeRipple, fastestGpaActions, type CourseBundle } from './simMath'
import { RippleChain, FastestActionsList } from './RippleParts'

export default function RippleCalculator({ bundles }: { bundles: CourseBundle[] }) {
  const [query, setQuery]       = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [score, setScore]       = useState(0)
  const [showFastest, setShowFastest] = useState(false)

  // All gradeable assignments across courses (flat list for search).
  const allItems = useMemo(() =>
    bundles.flatMap(b => b.assignments
      .filter(a => a.pointsPossible !== null && a.pointsPossible > 0)
      .map(a => ({ a, course: b.course }))),
  [bundles])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return allItems.filter(({ a }) => a.title.toLowerCase().includes(q)).slice(0, 25)
  }, [allItems, query])

  const ripple = useMemo(() =>
    activeId ? computeRipple(bundles, activeId, score) : null,
  [bundles, activeId, score])

  const fastest = useMemo(() => (showFastest ? fastestGpaActions(bundles) : []), [bundles, showFastest])

  const selectAssignment = (id: string, currentScore: number | null) => {
    setActiveId(id)
    setScore(currentScore ?? 0)
  }

  return (
    <div className="space-y-5">
      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search any assignment across all courses…"
          className="w-full h-10 pl-9 pr-3 rounded-lg bg-surface-800 border border-white/10 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-accent-500"
        />
      </div>

      {/* Fastest-way booster */}
      <div className="flex justify-end">
        <Button variant={showFastest ? 'primary' : 'secondary'} size="sm" icon={<Zap size={13} />}
          onClick={() => setShowFastest(v => !v)}>
          What's the fastest way to raise my GPA?
        </Button>
      </div>

      {showFastest && (
        <motion.section initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-surface-800 border border-white/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={15} className="text-accent-400" />
            <h2 className="text-sm font-semibold text-zinc-200">Highest impact actions</h2>
          </div>
          <FastestActionsList actions={fastest} />
        </motion.section>
      )}

      {/* Search results */}
      {query.trim() === '' ? (
        !showFastest && (
          <EmptyState icon={<Target size={20} />} title="Search for an assignment"
            description="Type an assignment name to simulate skipping, failing, or acing it — and see the ripple through your GPA." />
        )
      ) : matches.length === 0 ? (
        <p className="text-sm text-zinc-500 text-center py-6">No assignments match “{query}”.</p>
      ) : (
        <div className="space-y-2">
          {matches.map(({ a, course }) => {
            const isActive = activeId === a.id
            const realGraded = a.grade?.workflowState === 'graded' && a.grade.score !== null && !a.grade.isExcused
            const currentScore = realGraded ? a.grade!.score! : null
            const pts = a.pointsPossible!
            return (
              <div key={a.id}
                className={cn('rounded-xl border bg-surface-800 transition-colors',
                  isActive ? 'border-accent-500/40' : 'border-white/5 hover:border-white/15')}>
                <button onClick={() => selectAssignment(a.id, currentScore)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left">
                  <div className="w-1.5 h-8 rounded-full shrink-0" style={{ background: course.color ?? '#6366f1' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200 truncate">{a.title}</p>
                    <p className="text-2xs text-zinc-500 truncate">{course.name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs tabular-nums text-zinc-300">
                      {realGraded ? `${currentScore}/${pts}` : `—/${pts}`}
                    </p>
                    <p className="text-2xs text-zinc-600">{pts} pts</p>
                  </div>
                </button>

                {isActive && ripple && (
                  <div className="px-4 pb-4 border-t border-white/5 pt-3 space-y-3">
                    {/* Slider */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-2xs text-zinc-500 uppercase tracking-wider font-semibold">
                          Simulated score
                        </span>
                        <span className="text-xs font-semibold text-accent-400 tabular-nums">
                          {Math.round(score)}/{pts}
                        </span>
                      </div>
                      <input type="range" min={0} max={pts} step={pts > 50 ? 1 : 0.5}
                        value={score}
                        onChange={e => setScore(parseFloat(e.target.value))}
                        className="w-full accent-accent-500 cursor-pointer"
                      />
                      <div className="flex justify-between text-2xs text-zinc-600 mt-0.5">
                        <span>0</span><span>{pts}</span>
                      </div>
                    </div>

                    {ripple.lowConfidence && (
                      <p className="text-2xs text-amber-500/80">
                        This course has no synced graded assignments yet, so its grade is the LMS-reported value — the simulation is approximate.
                      </p>
                    )}

                    <RippleChain ripple={ripple} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
