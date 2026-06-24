// Tab 1 — Ask
// A natural-language question box over the academic graph. Students type their
// own questions ("What happens if I skip Assignment 7?", "What's the fastest way
// to raise my GPA?") and get a plain-language answer plus the live ripple/booster
// visualization, all computed offline by askEngine + the shared math engine.

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, CornerDownLeft, TrendingUp, GraduationCap, HelpCircle, Lightbulb } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { CourseBundle } from './simMath'
import { parseQuestion, type AskAnswer } from './askEngine'
import { RippleChain, FastestActionsList } from './RippleParts'

export default function AskSimulator({ bundles }: { bundles: CourseBundle[] }) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer]     = useState<AskAnswer | null>(null)

  // Build clickable examples from the student's real assignments where possible.
  const examples = useMemo(() => {
    const items = bundles
      .filter(b => b.course.isActive)
      .flatMap(b => b.assignments.filter(a => a.pointsPossible && a.pointsPossible > 0))
    const a0 = items[0]?.title
    const a1 = items[1]?.title ?? items[0]?.title
    return [
      a0 ? `What happens if I skip ${a0}?` : 'What happens if I skip <assignment>?',
      a1 ? `What if I get 95% on ${a1}?`   : 'What if I get 95% on <assignment>?',
      "What's the fastest way to raise my GPA?",
      'What is my current GPA?',
    ]
  }, [bundles])

  const run = (text: string) => {
    const t = text.trim()
    if (!t) return
    setQuestion(t)
    setAnswer(parseQuestion(t, bundles))
  }

  return (
    <div className="space-y-5">
      {/* Question box */}
      <div className="relative">
        <Sparkles size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-accent-400" />
        <input
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') run(question) }}
          placeholder="Ask anything — “What happens if I skip my next essay?”"
          className="w-full h-11 pl-10 pr-24 rounded-xl bg-surface-800 border border-white/10 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-accent-500"
        />
        <button onClick={() => run(question)}
          className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 h-7 px-3 rounded-lg bg-accent-500 hover:bg-accent-600 text-white text-xs font-medium transition-colors">
          Ask <CornerDownLeft size={12} />
        </button>
      </div>

      {/* Example chips */}
      <div className="flex flex-wrap gap-2">
        {examples.map(ex => (
          <button key={ex} onClick={() => run(ex)}
            className="px-2.5 py-1.5 rounded-full bg-surface-700/60 border border-white/5 text-2xs text-zinc-400 hover:text-accent-400 hover:border-accent-500/40 transition-colors">
            {ex}
          </button>
        ))}
      </div>

      {/* Answer */}
      {answer && (
        <motion.div key={answer.headline} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-surface-800 border border-white/5 p-4 space-y-4">
          {/* Headline */}
          <div className="flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-accent-500/15 flex items-center justify-center shrink-0 mt-0.5">
              {answer.kind === 'fastest' ? <TrendingUp size={14} className="text-accent-400" />
                : answer.kind === 'current-gpa' ? <GraduationCap size={14} className="text-accent-400" />
                : answer.kind === 'unknown' ? <HelpCircle size={14} className="text-accent-400" />
                : <Sparkles size={14} className="text-accent-400" />}
            </div>
            <p className="text-sm text-zinc-200 leading-relaxed flex-1">{answer.headline}</p>
          </div>

          {/* Concrete next action */}
          {answer.recommendation && (
            <div className="flex items-start gap-2 rounded-lg bg-accent-500/10 border border-accent-500/20 px-3 py-2">
              <Lightbulb size={13} className="text-accent-400 mt-0.5 shrink-0" />
              <p className="text-xs text-accent-200 leading-relaxed">{answer.recommendation}</p>
            </div>
          )}

          {/* Visualization by kind */}
          {answer.kind === 'ripple' && answer.ripple && (
            <RippleChain ripple={answer.ripple} groupContext={answer.groupContext} />
          )}

          {answer.kind === 'fastest' && answer.actions && (
            <FastestActionsList actions={answer.actions} />
          )}

          {answer.kind === 'current-gpa' && (
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Semester GPA',   value: answer.semesterGpa ?? null },
                { label: 'Cumulative GPA', value: answer.cumulativeGpa ?? null },
              ].map(t => (
                <div key={t.label} className="rounded-lg bg-surface-900/50 border border-white/5 p-4 text-center">
                  <p className={cn('text-3xl font-bold tabular-nums',
                    t.value === null ? 'text-zinc-500'
                      : t.value >= 3 ? 'text-green-400' : t.value >= 2 ? 'text-amber-400' : 'text-red-400')}>
                    {t.value === null ? '—' : t.value.toFixed(2)}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">{t.label}</p>
                </div>
              ))}
            </div>
          )}

          {answer.kind === 'unknown' && answer.suggestions && (
            <div className="flex flex-wrap gap-2">
              {answer.suggestions.map(s => (
                <button key={s} onClick={() => run(s.replace(/<assignment>/g, '').trim())}
                  className="px-2.5 py-1.5 rounded-full bg-surface-700/60 border border-white/5 text-2xs text-zinc-400 hover:text-accent-400 transition-colors">
                  {s}
                </button>
              ))}
            </div>
          )}
        </motion.div>
      )}

      <p className="text-2xs text-zinc-600">
        Answers are computed locally from your synced grades. The graph follows real relationships
        (assignment → weighted group → course → semester GPA → cumulative GPA); Canvas doesn’t expose
        links between individual items, so those aren’t invented.
      </p>
    </div>
  )
}
