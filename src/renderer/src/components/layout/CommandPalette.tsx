import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Command } from 'cmdk'
import {
  LayoutDashboard, BookOpen, Layers, ClipboardList, BarChart2, Calculator,
  ShieldAlert, FlaskConical, Calendar, FolderOpen, Archive, Settings as SettingsIcon,
  RefreshCw, Plus, LayoutGrid, PanelLeft, Search,
} from 'lucide-react'
import { api } from '../../lib/ipc'
import { useAppStore } from '../../store/app.store'
import { useWorkspaceStore } from '../../store/workspace.store'
import { OPEN_COMMAND_PALETTE_EVENT } from './navConfig'

// ─── Static command catalogue ──────────────────────────────────────────────────
// Navigation mirrors the router's main routes. Keywords broaden fuzzy matching
// (e.g. "gpa" → GPA Calculator) so the palette feels forgiving.

interface NavCmd { route: string; label: string; icon: React.ReactNode; keywords?: string[] }

const NAV_COMMANDS: NavCmd[] = [
  { route: '/dashboard',        label: 'Dashboard',       icon: <LayoutDashboard size={15} /> },
  { route: '/courses',          label: 'Courses',         icon: <BookOpen size={15} /> },
  { route: '/modules',          label: 'Modules',         icon: <Layers size={15} /> },
  { route: '/assignments',      label: 'Assignments',     icon: <ClipboardList size={15} />, keywords: ['homework', 'todo', 'tasks'] },
  { route: '/grades',           label: 'Grades',          icon: <BarChart2 size={15} />, keywords: ['marks', 'scores'] },
  { route: '/grade-calculator', label: 'GPA Calculator',  icon: <Calculator size={15} />, keywords: ['gpa', 'what if', 'whatif'] },
  { route: '/grade-rescue',     label: 'Grade Rescue',    icon: <ShieldAlert size={15} />, keywords: ['recover', 'plan'] },
  { route: '/simulator',        label: 'Outcome Simulator', icon: <FlaskConical size={15} />, keywords: ['scenario', 'predict', 'ripple'] },
  { route: '/calendar',         label: 'Calendar',        icon: <Calendar size={15} />, keywords: ['reminders', 'events', 'due'] },
  { route: '/files',            label: 'Files',           icon: <FolderOpen size={15} /> },
  { route: '/history',          label: 'History',         icon: <Archive size={15} />, keywords: ['past', 'archive', 'previous'] },
  { route: '/settings',         label: 'Settings',        icon: <SettingsIcon size={15} />, keywords: ['preferences', 'appearance', 'options'] },
]

// ─── Command palette ────────────────────────────────────────────────────────────
// Global ⌘K / Ctrl+K launcher: fuzzy-jump to any page + run quick actions.
// Fully additive overlay — no layout impact.

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const setIsSyncing = useAppStore(s => s.setIsSyncing)
  const ws = useWorkspaceStore()
  const dashboardView = ws.active().dashboardView

  // ⌘K / Ctrl+K toggles; the dialog itself handles Esc to close. The dock and
  // palette nav types open it via a button → OPEN_COMMAND_PALETTE_EVENT.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen)
    }
  }, [])

  // Run an action then close (the palette is modal/one-shot).
  const run = (fn: () => void) => () => { fn(); setOpen(false) }

  const itemClass =
    'flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] text-zinc-300 cursor-pointer ' +
    'data-[selected=true]:bg-accent-500/[0.14] data-[selected=true]:text-accent-300 ' +
    'aria-disabled:opacity-40 aria-disabled:pointer-events-none transition-colors'

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      shouldFilter
      overlayClassName="fixed inset-0 z-[100] bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0"
      contentClassName="fixed left-1/2 top-[18%] z-[100] w-[560px] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl border border-white/[0.09] bg-surface-800 shadow-2xl focus:outline-none overflow-hidden"
    >
      <div className="flex items-center gap-2.5 px-3.5 border-b border-white/[0.07]">
        <Search size={15} className="text-zinc-500 shrink-0" />
        <Command.Input
          autoFocus
          placeholder="Jump to a page or run an action…"
          className="flex-1 h-12 bg-transparent text-[14px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
        />
      </div>

      <Command.List className="max-h-[52vh] overflow-y-auto p-2">
        <Command.Empty className="px-3 py-6 text-center t-caption text-zinc-500">
          No matching commands.
        </Command.Empty>

        <Command.Group
          heading="Navigation"
          className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:t-micro [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-zinc-600"
        >
          {NAV_COMMANDS.map(cmd => (
            <Command.Item
              key={cmd.route}
              value={`${cmd.label} ${(cmd.keywords ?? []).join(' ')}`}
              onSelect={run(() => navigate(cmd.route))}
              className={itemClass}
            >
              <span className="shrink-0 text-zinc-500">{cmd.icon}</span>
              <span className="flex-1 truncate">{cmd.label}</span>
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Separator className="my-1.5 h-px bg-white/[0.06]" />

        <Command.Group
          heading="Actions"
          className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:t-micro [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-zinc-600"
        >
          <Command.Item
            value="Sync now refresh update"
            onSelect={run(() => { setIsSyncing(true); api.sync.startAll() })}
            className={itemClass}
          >
            <span className="shrink-0 text-zinc-500"><RefreshCw size={15} /></span>
            <span className="flex-1 truncate">Sync now</span>
          </Command.Item>

          <Command.Item
            value="Add platform connect integration canvas moodle"
            onSelect={run(() => navigate('/settings/integrations'))}
            className={itemClass}
          >
            <span className="shrink-0 text-zinc-500"><Plus size={15} /></span>
            <span className="flex-1 truncate">Add a platform</span>
          </Command.Item>

          <Command.Item
            value="Toggle dashboard view focused widgets layout"
            onSelect={run(() => {
              ws.setDashboardView(dashboardView === 'widgets' ? 'focused' : 'widgets')
              navigate('/dashboard')
            })}
            className={itemClass}
          >
            <span className="shrink-0 text-zinc-500">
              {dashboardView === 'widgets' ? <PanelLeft size={15} /> : <LayoutGrid size={15} />}
            </span>
            <span className="flex-1 truncate">
              Switch dashboard to {dashboardView === 'widgets' ? 'Focused' : 'Widgets'} view
            </span>
          </Command.Item>
        </Command.Group>
      </Command.List>

      <div className="flex items-center justify-between px-3.5 py-2 border-t border-white/[0.07] t-micro text-zinc-600">
        <span>Type to search</span>
        <span className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 rounded bg-surface-700 text-zinc-400">↑↓</kbd> navigate
          <kbd className="px-1.5 py-0.5 rounded bg-surface-700 text-zinc-400 ml-1.5">↵</kbd> select
          <kbd className="px-1.5 py-0.5 rounded bg-surface-700 text-zinc-400 ml-1.5">esc</kbd> close
        </span>
      </div>
    </Command.Dialog>
  )
}
