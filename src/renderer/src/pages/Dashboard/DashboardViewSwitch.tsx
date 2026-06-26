import { LayoutTemplate, LayoutGrid } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useWorkspaceStore } from '../../store/workspace.store'
import type { DashboardView } from '@shared/types/ipc'

// Segmented control to switch the new-UI dashboard between the focused fixed
// layout and the customizable widget canvas. Persisted per workspace.
const OPTIONS: { value: DashboardView; label: string; icon: typeof LayoutGrid }[] = [
  { value: 'focused', label: 'Focused', icon: LayoutTemplate },
  { value: 'widgets', label: 'Widgets', icon: LayoutGrid },
]

export default function DashboardViewSwitch() {
  const view = useWorkspaceStore(s => s.active().dashboardView)
  const setView = useWorkspaceStore(s => s.setDashboardView)

  return (
    <div className="flex rounded-lg border border-white/10 overflow-hidden">
      {OPTIONS.map(o => {
        const Icon = o.icon
        return (
          <button key={o.value} onClick={() => setView(o.value)} title={o.label}
            className={cn('flex items-center gap-1.5 px-2.5 py-1.5 t-caption transition-colors',
              view === o.value ? 'bg-accent-500/20 text-accent-400' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5')}>
            <Icon size={13} /> <span className="hidden sm:inline">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
