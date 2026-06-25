// Academic Outcome Simulator — premium feature (/simulator)
// Three tabs:
//   1. Ask          — natural-language questions about your grades
//   2. Multi-Scenario — run up to 4 what-if scenarios side by side
//   3. Ripple Effect — single-assignment impact chain + GPA boosters
// Shares one load of every course's assignments/grades/groups (CourseBundle[]).

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { FlaskConical, GitBranch, Sparkles, MessageCircleQuestion } from 'lucide-react'
import { api } from '../../lib/ipc'
import { Spinner, EmptyState, SectionHeader, Badge, Segmented } from '../../components/ui/Badge'
import type { Course, Assignment, Grade } from '@shared/types/entities'
import type { CourseBundle, AssignmentWithGrade } from './simMath'
import AskSimulator from './AskSimulator'
import ScenarioSimulator from './ScenarioSimulator'
import RippleCalculator from './RippleCalculator'

type SimTab = 'ask' | 'scenarios' | 'ripple'

const TABS: { id: SimTab; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: 'ask',       label: 'Ask',            icon: <MessageCircleQuestion size={14} />, desc: 'Ask in plain English — e.g. “What happens if I skip my next essay?”' },
  { id: 'scenarios', label: 'Multi-Scenario', icon: <FlaskConical size={14} />,          desc: 'Build up to 4 what-if scenarios and compare their GPA outcomes side by side.' },
  { id: 'ripple',    label: 'Ripple Effect',  icon: <GitBranch size={14} />,             desc: 'Pick one assignment and watch any score ripple through to your GPA.' },
]

export default function Simulator() {
  const [bundles, setBundles] = useState<CourseBundle[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab]         = useState<SimTab>('ask')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const cRes = await api.courses.getAllIncludingInactive()
      const courses: Course[] = cRes.ok ? cRes.data : []

      const built = await Promise.all(
        courses.map(async course => {
          const [aRes, gRes, grpRes] = await Promise.all([
            api.assignments.getByCourse(course.id),
            api.grades.getByCourse(course.id),
            api.assignmentGroups.getByCourse(course.id),
          ])
          const gradeMap = new Map((gRes.ok ? gRes.data : []).map((g: Grade) => [g.assignmentId, g]))
          const assignments: AssignmentWithGrade[] = (aRes.ok ? aRes.data : []).map((a: Assignment) => ({
            ...a, grade: gradeMap.get(a.id),
          }))
          return { course, assignments, groups: grpRes.ok ? grpRes.data : [] } as CourseBundle
        })
      )
      setBundles(built)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Spinner size={20} /></div>
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        <SectionHeader
          title="Academic Outcome Simulator"
          subtitle="Model multiple what-if scenarios and trace how a single grade ripples through your GPA."
          action={<Badge variant="accent"><Sparkles size={10} className="mr-1" /> Premium</Badge>}
        />

        {/* Tab switcher + active-tab description */}
        <div className="space-y-2">
          <Segmented
            options={TABS.map(t => ({ id: t.id, label: t.label, icon: t.icon }))}
            value={tab}
            onChange={v => setTab(v as SimTab)}
          />
          <p className="text-xs text-zinc-500">{TABS.find(t => t.id === tab)!.desc}</p>
        </div>

        {bundles.length === 0 ? (
          <EmptyState icon={<FlaskConical size={20} />} title="No courses synced yet"
            description="Sync your courses to start simulating academic outcomes." />
        ) : (
          <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            {tab === 'ask'       && <AskSimulator bundles={bundles} />}
            {tab === 'scenarios' && <ScenarioSimulator bundles={bundles} />}
            {tab === 'ripple'    && <RippleCalculator bundles={bundles} />}
          </motion.div>
        )}
      </div>
    </div>
  )
}
