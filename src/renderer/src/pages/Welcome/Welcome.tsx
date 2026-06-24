import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { GraduationCap, CheckCircle2 } from 'lucide-react'
import { useAppStore } from '../../store/app.store'
import { AddPlatform } from '../../components/integrations/AddPlatform'
import type { Integration } from '@shared/types/entities'

const FEATURES = [
  'No admin access needed',
  'Real data — no fakes or placeholders',
  'Connect Canvas and Moodle with just a token',
  'Modules preserved exactly as set by your instructor',
  'Full assignment instructions and rubrics',
  'Works offline after first sync',
  'Export to Obsidian vault',
]

export default function Welcome() {
  const navigate       = useNavigate()
  const addIntegration = useAppStore(s => s.addIntegration)
  const integrations   = useAppStore(s => s.integrations)
  const alreadyConnected = integrations.length > 0

  const handleConnected = (i: Integration) => {
    addIntegration(i)
    // First sync is kicked off inside AddPlatform; head to the dashboard.
    setTimeout(() => navigate('/dashboard'), 1200)
  }

  return (
    <div className="flex h-full bg-surface-950 overflow-hidden">
      {/* ── Left branding panel ─────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col justify-between w-64 shrink-0 p-9 bg-surface-900 border-r border-white/5">
        <div>
          <div className="w-11 h-11 rounded-2xl bg-accent-500 flex items-center justify-center mb-7">
            <GraduationCap size={22} className="text-white" />
          </div>
          <h1 className="text-xl font-semibold text-zinc-100 mb-2.5">Student Hub</h1>
          <p className="text-xs text-zinc-500 leading-relaxed">
            All your courses, assignments, grades, and files — synced from Canvas, Moodle, and more, right to your desktop.
          </p>
        </div>

        <div className="space-y-3">
          {FEATURES.map(f => (
            <div key={f} className="flex items-start gap-2">
              <CheckCircle2 size={12} className="text-accent-400 mt-0.5 shrink-0" />
              <span className="text-xs text-zinc-500 leading-relaxed">{f}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right connect panel ──────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-8 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          className="w-full max-w-md"
        >
          <div className="mb-7">
            <h2 className="text-xl font-semibold text-zinc-100 mb-1.5">Connect your school</h2>
            <p className="text-sm text-zinc-500">
              Choose your platform and paste a token — no admin access or special permissions needed.
            </p>
          </div>

          <AddPlatform
            onConnected={handleConnected}
            connectedProviders={integrations.map(i => i.provider)}
          />

          {alreadyConnected && (
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full mt-5 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Already connected — go to dashboard →
            </button>
          )}
        </motion.div>
      </div>
    </div>
  )
}
