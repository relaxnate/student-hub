import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { formatDistanceToNowStrict } from 'date-fns'
import {
  Settings, Loader2, GraduationCap, Plus, Search, SlidersHorizontal,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAppStore } from '../../store/app.store'
import { useWorkspaceStore } from '../../store/workspace.store'
import { useSyncStore } from '../../store/sync.store'
import { api } from '../../lib/ipc'
import { NAV_ICONS, NAV_ROUTES, openCommandPalette, openSidebarSettings } from './navConfig'

// ─── Dock nav ────────────────────────────────────────────────────────────────
// Horizontal navigation bar for the 'dock' nav type — replaces the vertical
// sidebar. Items render left-to-right (icon + label pills, scrollable); sync /
// add-platform / settings / search sit at the right. Reuses the same workspace
// sidebar-item config + shared nav maps as the vertical Sidebar.

export function DockNav() {
  const integrations = useAppStore(s => s.integrations)
  const setIsSyncing = useAppStore(s => s.setIsSyncing)
  const { progress, errors } = useSyncStore()
  const ws     = useWorkspaceStore()
  const active = ws.active()
  const [version, setVersion] = useState('')

  useEffect(() => {
    api.app.getVersion().then((r: { ok: boolean; data: string }) => { if (r.ok) setVersion(r.data) })
  }, [])

  const hasIntegrations = integrations.length > 0
  const syncing  = Object.keys(progress).length > 0
  const hasError = Object.values(errors).some(Boolean)
  const lastSyncedAt = integrations.reduce<number | null>(
    (max, i) => (i.lastSyncedAt && (!max || i.lastSyncedAt > max) ? i.lastSyncedAt : max), null)

  const items = active.sidebarItems.filter(i => i.visible).sort((a, b) => a.order - b.order)

  const handleSyncAll = async () => { setIsSyncing(true); await api.sync.startAll() }

  const dot = hasError ? 'bg-red-500' : syncing ? 'bg-amber-500' : 'bg-green-500'
  const syncLabel = hasError ? 'Sync failed'
    : syncing ? 'Syncing…'
    : lastSyncedAt ? `Synced ${formatDistanceToNowStrict(lastSyncedAt, { addSuffix: true })}`
    : 'Not synced yet'

  const iconBtn = 'group relative flex items-center justify-center w-8 h-8 rounded-md ' +
    'text-zinc-400 hover:bg-surface-700 hover:text-zinc-100 transition-colors shrink-0'

  return (
    <header className="surface-sidebar flex items-center gap-2 h-12 px-3 border-b border-white/[0.06] shrink-0">
      {/* Brand */}
      <div className="flex items-center gap-2 shrink-0 pr-1">
        <div className="w-7 h-7 rounded-lg bg-accent-500 flex items-center justify-center">
          <GraduationCap size={15} className="text-white" />
        </div>
        <p className="t-heading text-zinc-100 leading-none hidden sm:block">
          Student Hub
          {version && <span className="ml-1.5 t-micro text-zinc-600 align-middle">v{version}</span>}
        </p>
      </div>

      <div className="w-px h-5 bg-white/[0.07] shrink-0" />

      {/* Nav items */}
      <nav className="flex items-center gap-0.5 overflow-x-auto flex-1 no-scrollbar">
        {hasIntegrations ? items.map(item => (
          <NavLink
            key={item.id}
            to={NAV_ROUTES[item.id]}
            className={({ isActive }) => cn(
              'relative flex items-center gap-1.5 h-8 px-2.5 rounded-md text-[13px] whitespace-nowrap transition-colors duration-100 shrink-0',
              isActive
                ? 'bg-accent-500/[0.12] text-accent-400'
                : 'text-zinc-400 hover:bg-surface-700 hover:text-zinc-100'
            )}
          >
            <span className="shrink-0">{NAV_ICONS[item.id]}</span>
            <span className="truncate">{item.label}</span>
            {item.id === 'simulator' && (
              <span className="shrink-0 px-1 py-px rounded-[4px] t-micro font-semibold bg-accent-500/15 text-accent-400">
                PRO
              </span>
            )}
          </NavLink>
        )) : (
          <p className="t-caption text-zinc-600 px-2">Connect a learning platform to get started.</p>
        )}
      </nav>

      {/* Right cluster */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button onClick={openCommandPalette} title="Search · ⌘K" className={iconBtn}>
          <Search size={16} />
        </button>
        {hasIntegrations && (
          <button onClick={handleSyncAll} disabled={syncing} className={iconBtn} title={syncLabel}>
            {syncing
              ? <Loader2 size={14} className="animate-spin text-amber-500" />
              : <span className="relative flex items-center justify-center w-4 h-4">
                  <span className={cn('w-2 h-2 rounded-full', dot)} />
                </span>}
          </button>
        )}
        <NavLink to="/settings/integrations" className={({ isActive }) =>
          cn(iconBtn, isActive && 'bg-accent-500/[0.12] text-accent-400')} title="Add platform">
          <Plus size={16} />
        </NavLink>
        <button onClick={openSidebarSettings} className={iconBtn} title="Edit navigation">
          <SlidersHorizontal size={16} />
        </button>
        <NavLink to="/settings" end className={({ isActive }) =>
          cn(iconBtn, isActive && 'bg-accent-500/[0.12] text-accent-400')} title="Settings">
          <Settings size={16} />
        </NavLink>
      </div>
    </header>
  )
}
