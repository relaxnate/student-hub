import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { formatDistanceToNowStrict } from 'date-fns'
import {
  DndContext, PointerSensor, useSensor, useSensors,
  closestCenter, DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Settings, RefreshCw, Loader2, GraduationCap, Plus, Search, SlidersHorizontal,
  GripVertical, ChevronDown, ChevronRight,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAppStore } from '../../store/app.store'
import { useWorkspaceStore } from '../../store/workspace.store'
import { useSyncStore } from '../../store/sync.store'
import { api } from '../../lib/ipc'
import type { NavItemId, SidebarItemConfig, SidebarSection } from '@shared/types/ipc'
import type { IntegrationProvider } from '@shared/types/entities'
import { NAV_ICONS, NAV_ROUTES, PROVIDER_META, openCommandPalette, openSidebarSettings } from './navConfig'

// Drag-to-resize bounds (px). Custom width persists to appearance.sidebarWidth.
const SIDEBAR_MIN = 180
const SIDEBAR_MAX = 420

// ─── Nav item (sortable) ──────────────────────────────────────────────────────
// Default = secondary text on transparent. Hover = elevated surface + primary
// text. Active = accent tint + 2px left bar + accent text (no bold). Per spec.
// `rail` = icon-only but with a hover flyout label (richer than compact tooltips).

function SortableNavItem({ item, compact, rail }: {
  item: SidebarItemConfig; compact: boolean; rail?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity:   isDragging ? 0.4 : 1,
  }

  return (
    <li ref={setNodeRef} style={style} className="relative group">
      <NavLink
        to={NAV_ROUTES[item.id]}
        title={compact && !rail ? item.label : undefined}
        className={({ isActive }) => cn(
          'relative flex items-center h-8 rounded-md text-[13px] transition-colors duration-100',
          compact ? 'justify-center px-0' : 'gap-2 px-3',
          isActive
            ? 'bg-accent-500/[0.12] text-accent-400'
            : 'text-zinc-400 hover:bg-surface-700 hover:text-zinc-100'
        )}
      >
        {({ isActive }) => (
          <>
            {isActive && !compact && (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full bg-accent-400" />
            )}
            <span className="shrink-0">{NAV_ICONS[item.id]}</span>
            {!compact && <span className="flex-1 truncate">{item.label}</span>}
            {!compact && (item.id === 'simulator' || item.id === 'ai-helper') && (
              <span className="shrink-0 px-1 py-px rounded-[4px] t-micro font-semibold bg-accent-500/15 text-accent-400">
                PRO
              </span>
            )}
          </>
        )}
      </NavLink>
      {/* Rail flyout label — appears to the right on hover (icon rail UX). */}
      {rail && (
        <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-1.5 z-30 hidden group-hover:flex items-center h-7 px-2.5 rounded-md bg-surface-700 border border-white/[0.08] text-[12px] text-zinc-100 whitespace-nowrap shadow-lg">
          {item.label}
        </span>
      )}
      {!compact && (
        <button
          {...listeners} {...attributes}
          className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-zinc-700 hover:text-zinc-400 p-0.5 touch-none"
          title="Drag to reorder"
        >
          <GripVertical size={12} />
        </button>
      )}
    </li>
  )
}

// ─── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ section, collapsed, onToggle, compact }: {
  section: SidebarSection; collapsed: boolean; onToggle: () => void; compact: boolean
}) {
  if (compact) return <div className="my-1.5 mx-2 border-t border-white/[0.06]" />
  return (
    <div className="flex items-center gap-1 px-3 pt-4 pb-1 cursor-pointer group select-none" onClick={onToggle}>
      <span className="t-micro font-semibold text-zinc-600 uppercase tracking-[0.08em] flex-1 truncate">
        {section.label}
      </span>
      {collapsed
        ? <ChevronRight size={11} className="text-zinc-700 group-hover:text-zinc-500" />
        : <ChevronDown  size={11} className="text-zinc-700 group-hover:text-zinc-500" />}
    </div>
  )
}

// ─── Sync status (bottom) ──────────────────────────────────────────────────────

function SyncStatus({ compact, syncing, error, lastSyncedAt, onSync }: {
  compact: boolean; syncing: boolean; error: boolean; lastSyncedAt: number | null; onSync: () => void
}) {
  const dot = error ? 'bg-red-500' : syncing ? 'bg-amber-500' : 'bg-green-500'
  const label = error ? 'Sync failed'
    : syncing ? 'Syncing…'
    : lastSyncedAt ? `Synced ${formatDistanceToNowStrict(lastSyncedAt, { addSuffix: true })}`
    : 'Not synced yet'

  return (
    <button onClick={onSync} disabled={syncing}
      title={compact ? label : 'Sync now'}
      className={cn(
        'group flex items-center h-8 rounded-md text-[13px] transition-colors duration-100 w-full',
        'text-zinc-500 hover:bg-surface-700 hover:text-zinc-200 disabled:hover:bg-transparent',
        compact ? 'justify-center px-0' : 'gap-2 px-3'
      )}
    >
      <span className="relative shrink-0 flex items-center justify-center w-4 h-4">
        {syncing
          ? <Loader2 size={13} className="animate-spin text-amber-500" />
          : <span className={cn('w-2 h-2 rounded-full', dot)} />}
      </span>
      {!compact && <span className="flex-1 text-left truncate t-caption">{label}</span>}
      {!compact && !syncing && (
        <RefreshCw size={12} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </button>
  )
}

// ─── Integration badges (bottom) ───────────────────────────────────────────────

function IntegrationBadges({ providers, compact }: { providers: IntegrationProvider[]; compact: boolean }) {
  if (!providers.length) return null
  const unique = Array.from(new Set(providers))
  if (compact) {
    return (
      <div className="flex items-center justify-center gap-1 py-1">
        {unique.map(p => (
          <span key={p} title={PROVIDER_META[p]?.short} className="w-1.5 h-1.5 rounded-full"
            style={{ background: PROVIDER_META[p]?.color ?? '#888' }} />
        ))}
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-1 px-3 py-1.5">
      {unique.map(p => (
        <span key={p} className="inline-flex items-center gap-1 t-micro text-zinc-500">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: PROVIDER_META[p]?.color ?? '#888' }} />
          {PROVIDER_META[p]?.short ?? p}
        </span>
      ))}
    </div>
  )
}

// ─── Sidebar ───────────────────────────────────────────────────────────────────

export function Sidebar() {
  const integrations = useAppStore(s => s.integrations)
  const setIsSyncing = useAppStore(s => s.setIsSyncing)
  const setAppearance = useAppStore(s => s.setAppearance)
  const sidebarMode  = useAppStore(s => s.preferences?.appearance?.sidebarMode ?? 'standard')
  const navType      = useAppStore(s => s.preferences?.appearance?.navType ?? 'standard')
  const { progress, errors } = useSyncStore()
  const ws           = useWorkspaceStore()
  const active       = ws.active()
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const [version, setVersion] = useState('')
  const asideRef = useRef<HTMLElement>(null)

  useEffect(() => {
    api.app.getVersion().then((r: { ok: boolean; data: string }) => { if (r.ok) setVersion(r.data) })
  }, [])

  const hasIntegrations = integrations.length > 0
  const syncing         = Object.keys(progress).length > 0
  const hasError        = Object.values(errors).some(Boolean)
  const rail            = navType === 'rail'
  // Rail renders icon-only (like compact) but with hover flyout labels.
  const compact         = sidebarMode === 'compact' || rail
  const lastSyncedAt    = integrations.reduce<number | null>(
    (max, i) => (i.lastSyncedAt && (!max || i.lastSyncedAt > max) ? i.lastSyncedAt : max), null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const handleSyncAll = async () => {
    setIsSyncing(true)
    await api.sync.startAll()
  }

  // Drag the right edge to set a custom width: live-update the CSS var during
  // the drag (cheap, no re-render), persist to appearance prefs on release.
  const startResize = (e: React.PointerEvent) => {
    if (compact) return
    e.preventDefault()
    const startX = e.clientX
    const startWidth = asideRef.current?.getBoundingClientRect().width ?? 220
    const root = document.documentElement
    const prevSelect = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    let finalWidth = startWidth
    const onMove = (ev: PointerEvent) => {
      finalWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startWidth + (ev.clientX - startX)))
      root.style.setProperty('--sidebar-width', `${finalWidth}px`)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.userSelect = prevSelect
      document.body.style.cursor = ''
      setAppearance({ sidebarWidth: Math.round(finalWidth) })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // Double-click the handle → clear the custom width, fall back to the preset.
  const resetWidth = () => setAppearance({ sidebarWidth: null })

  const handleDragEnd = (event: DragEndEvent) => {
    const { active: dragActive, over } = event
    if (!over || dragActive.id === over.id) return
    const items    = active.sidebarItems.filter(i => i.visible).sort((a, b) => a.order - b.order)
    const ids      = items.map(i => i.id)
    const oldIdx   = ids.indexOf(dragActive.id as NavItemId)
    const newIdx   = ids.indexOf(over.id as NavItemId)
    if (oldIdx === -1 || newIdx === -1) return
    const reordered = arrayMove(items, oldIdx, newIdx)
    const updated   = active.sidebarItems.map(item => {
      const idx = reordered.findIndex(r => r.id === item.id)
      return idx !== -1 ? { ...item, order: idx } : item
    })
    ws.updateSidebarItems(updated)
  }

  const toggleSection = (id: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const visibleItems = active.sidebarItems.filter(i => i.visible).sort((a, b) => a.order - b.order)
  const sections     = active.sidebarSections.slice().sort((a, b) => a.order - b.order)
  const ungrouped    = visibleItems.filter(i => !i.sectionId)
  const getGroupedItems = (sectionId: string) => visibleItems.filter(i => i.sectionId === sectionId)

  const bottomRow = (isActive: boolean) => cn(
    'flex items-center h-8 rounded-md text-[13px] transition-colors duration-100 w-full',
    compact ? 'justify-center px-0' : 'gap-2 px-3',
    isActive ? 'bg-accent-500/[0.12] text-accent-400' : 'text-zinc-400 hover:bg-surface-700 hover:text-zinc-100'
  )

  // Palette nav type → render the slim launcher rail instead of the full sidebar.
  if (navType === 'palette') {
    return <PaletteRail syncing={syncing} error={hasError} onSync={handleSyncAll} />
  }

  return (
    <aside ref={asideRef} className="surface-sidebar relative flex flex-col h-full w-[--sidebar-width] border-r border-white/[0.06] shrink-0">
      {/* App header */}
      <div className={cn('flex items-center border-b border-white/[0.06] shrink-0 h-14',
        compact ? 'justify-center px-0' : 'px-3 gap-2.5')}>
        <div className="w-7 h-7 rounded-lg bg-accent-500 flex items-center justify-center shrink-0">
          <GraduationCap size={15} className="text-white" />
        </div>
        {!compact && (
          <div className="min-w-0">
            <p className="t-heading text-zinc-100 leading-tight truncate">Student Hub</p>
            {version && <p className="t-micro text-zinc-600 leading-tight">v{version}</p>}
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-2 overflow-y-auto overflow-x-hidden">
        {hasIntegrations ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={visibleItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-0.5">
                {ungrouped.map(item => <SortableNavItem key={item.id} item={item} compact={compact} rail={rail} />)}
                {sections.map(section => {
                  const sectionItems = getGroupedItems(section.id)
                  if (!sectionItems.length) return null
                  const isCollapsed = collapsedSections.has(section.id)
                  return (
                    <li key={section.id}>
                      <SectionHeader section={section} collapsed={isCollapsed} compact={compact}
                        onToggle={() => toggleSection(section.id)} />
                      {!isCollapsed && (
                        <ul className="space-y-0.5">
                          {sectionItems.map(item => <SortableNavItem key={item.id} item={item} compact={compact} rail={rail} />)}
                        </ul>
                      )}
                    </li>
                  )
                })}
              </ul>
            </SortableContext>
          </DndContext>
        ) : (
          !compact && (
            <p className="t-caption text-zinc-600 px-3 py-3 leading-relaxed">
              Connect a learning platform to get started.
            </p>
          )
        )}
      </nav>

      {/* Bottom */}
      <div className="px-2 pb-2 pt-1.5 border-t border-white/[0.06] space-y-0.5">
        {hasIntegrations && <IntegrationBadges providers={integrations.map(i => i.provider)} compact={compact} />}
        {hasIntegrations && (
          <SyncStatus compact={compact} syncing={syncing} error={hasError}
            lastSyncedAt={lastSyncedAt} onSync={handleSyncAll} />
        )}
        <NavLink to="/settings/integrations" title={compact ? 'Add platform' : undefined}
          className={({ isActive }) => bottomRow(isActive)}>
          <span className="shrink-0"><Plus size={16} /></span>
          {!compact && <span>Add platform</span>}
        </NavLink>
        <button onClick={openSidebarSettings} title={compact ? 'Edit sidebar' : undefined}
          className={bottomRow(false)}>
          <span className="shrink-0"><SlidersHorizontal size={16} /></span>
          {!compact && <span>Edit sidebar</span>}
        </button>
        <NavLink to="/settings" end title={compact ? 'Settings' : undefined}
          className={({ isActive }) => bottomRow(isActive)}>
          <span className="shrink-0"><Settings size={16} /></span>
          {!compact && <span>Settings</span>}
        </NavLink>
      </div>

      {/* Drag-to-resize handle — only the standard nav type / non-compact resizes. */}
      {navType === 'standard' && !compact && (
        <div
          onPointerDown={startResize}
          onDoubleClick={resetWidth}
          title="Drag to resize · double-click to reset"
          className="group/resize absolute top-0 right-0 z-20 h-full w-1.5 translate-x-1/2 cursor-col-resize"
        >
          <span className="absolute inset-y-0 right-1/2 w-px bg-transparent group-hover/resize:bg-accent-500/60 group-active/resize:bg-accent-500 transition-colors" />
        </div>
      )}
    </aside>
  )
}

// ─── Palette rail ──────────────────────────────────────────────────────────────
// Ultra-slim launcher rail for the 'palette' nav type: logo, a ⌘K search button,
// and the essentials at the bottom. Page navigation is driven by the command
// palette, freeing the maximum amount of horizontal space for content.

function PaletteRail({ syncing, error, onSync }: {
  syncing: boolean; error: boolean; onSync: () => void
}) {
  const dot = error ? 'bg-red-500' : syncing ? 'bg-amber-500' : 'bg-green-500'
  const iconBtn = 'group relative flex items-center justify-center w-9 h-9 mx-auto rounded-md ' +
    'text-zinc-400 hover:bg-surface-700 hover:text-zinc-100 transition-colors'
  const flyout = (label: string) => (
    <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-1.5 z-30 hidden group-hover:flex items-center h-7 px-2.5 rounded-md bg-surface-700 border border-white/[0.08] text-[12px] text-zinc-100 whitespace-nowrap shadow-lg">
      {label}
    </span>
  )

  return (
    <aside className="surface-sidebar relative flex flex-col h-full w-[--sidebar-width] border-r border-white/[0.06] shrink-0 py-2">
      <div className="flex items-center justify-center h-12 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-accent-500 flex items-center justify-center">
          <GraduationCap size={15} className="text-white" />
        </div>
      </div>

      <button onClick={openCommandPalette} title="Search · ⌘K" className={cn(iconBtn, 'mt-1')}>
        <Search size={17} />
        {flyout('Search · ⌘K')}
      </button>

      <div className="flex-1" />

      <button onClick={onSync} disabled={syncing} className={iconBtn} title="Sync now">
        <span className="relative flex items-center justify-center w-4 h-4">
          {syncing
            ? <Loader2 size={13} className="animate-spin text-amber-500" />
            : <span className={cn('w-2 h-2 rounded-full', dot)} />}
        </span>
        {flyout('Sync now')}
      </button>
      <NavLink to="/settings/integrations" className={({ isActive }) =>
        cn(iconBtn, isActive && 'bg-accent-500/[0.12] text-accent-400')} title="Add platform">
        <Plus size={17} />
        {flyout('Add platform')}
      </NavLink>
      <button onClick={openSidebarSettings} className={iconBtn} title="Edit sidebar">
        <SlidersHorizontal size={17} />
        {flyout('Edit sidebar')}
      </button>
      <NavLink to="/settings" end className={({ isActive }) =>
        cn(iconBtn, isActive && 'bg-accent-500/[0.12] text-accent-400')} title="Settings">
        <Settings size={17} />
        {flyout('Settings')}
      </NavLink>
    </aside>
  )
}
