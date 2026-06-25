import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  DndContext, PointerSensor, useSensor, useSensors,
  closestCenter, DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  LayoutDashboard, BookOpen, Layers, ClipboardList,
  BarChart2, Calendar, FolderOpen, Settings,
  RefreshCw, Loader2, GraduationCap, Plus, Calculator, ShieldAlert,
  GripVertical, ChevronDown, ChevronRight, Archive, FlaskConical,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAppStore } from '../../store/app.store'
import { useWorkspaceStore } from '../../store/workspace.store'
import { useSyncStore } from '../../store/sync.store'
import { api } from '../../lib/ipc'
import type { NavItemId, SidebarItemConfig, SidebarSection } from '@shared/types/ipc'

// ─── Icon map ─────────────────────────────────────────────────────────────────

const NAV_ICONS: Record<NavItemId, React.ReactNode> = {
  'dashboard':        <LayoutDashboard size={16} />,
  'courses':          <BookOpen size={16} />,
  'modules':          <Layers size={16} />,
  'assignments':      <ClipboardList size={16} />,
  'grades':           <BarChart2 size={16} />,
  'grade-calculator': <Calculator size={16} />,
  'grade-rescue':     <ShieldAlert size={16} />,
  'simulator':        <FlaskConical size={16} />,
  'calendar':         <Calendar size={16} />,
  'files':            <FolderOpen size={16} />,
  'history':          <Archive size={16} />,
}

const NAV_ROUTES: Record<NavItemId, string> = {
  'dashboard':        '/dashboard',
  'courses':          '/courses',
  'modules':          '/modules',
  'assignments':      '/assignments',
  'grades':           '/grades',
  'grade-calculator': '/grade-calculator',
  'grade-rescue':     '/grade-rescue',
  'simulator':        '/simulator',
  'calendar':         '/calendar',
  'files':            '/files',
  'history':          '/history',
}

// ─── Single sortable nav item ─────────────────────────────────────────────────

function SortableNavItem({ item, compact }: { item: SidebarItemConfig; compact: boolean }) {
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
        className={({ isActive }) => cn(
          'relative flex items-center rounded-md text-sm transition-colors duration-100',
          compact ? 'justify-center px-0 py-2' : 'gap-2.5 px-2.5 py-1.5',
          isActive
            ? 'text-accent-400 font-medium'
            : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
        )}
        title={compact ? item.label : undefined}
      >
        {({ isActive }) => (
          <>
            {isActive && !compact && (
              <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r-sm bg-accent-400" />
            )}
            <span className="shrink-0">{NAV_ICONS[item.id]}</span>
            {!compact && <span className="flex-1 truncate">{item.label}</span>}
            {!compact && item.id === 'simulator' && (
              <span className="shrink-0 px-1 py-px rounded text-[11px] font-bold leading-none tracking-wide bg-accent-500/20 text-accent-400 border border-accent-500/30">
                PRO
              </span>
            )}
          </>
        )}
      </NavLink>
      {/* Drag handle — only visible on hover in non-compact mode */}
      {!compact && (
        <button
          {...listeners} {...attributes}
          className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400 p-0.5 touch-none"
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
  if (compact) return <div className="my-1 border-t border-white/8" />
  return (
    <div className="flex items-center gap-1 px-2 pt-3 pb-1 cursor-pointer group" onClick={onToggle}>
      <span className="text-2xs font-semibold text-zinc-600 uppercase tracking-wider flex-1 truncate">
        {section.label}
      </span>
      {collapsed
        ? <ChevronRight size={10} className="text-zinc-600" />
        : <ChevronDown size={10} className="text-zinc-600" />}
    </div>
  )
}

// ─── Sidebar ───────────────────────────────────────────────────────────────────

export function Sidebar() {
  const integrations = useAppStore(s => s.integrations)
  const setIsSyncing = useAppStore(s => s.setIsSyncing)
  const sidebarMode  = useAppStore(s => s.preferences?.appearance?.sidebarMode ?? 'standard')
  const { progress } = useSyncStore()
  const ws           = useWorkspaceStore()
  const active       = ws.active()
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())

  const hasIntegrations = integrations.length > 0
  const isSyncing       = Object.keys(progress).length > 0
  const compact         = sidebarMode === 'compact'

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const handleSyncAll = async () => {
    setIsSyncing(true)
    await api.sync.startAll()
  }

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

  const visibleItems = active.sidebarItems
    .filter(i => i.visible)
    .sort((a, b) => a.order - b.order)

  // Group items by section
  const sections = active.sidebarSections.slice().sort((a, b) => a.order - b.order)
  const ungrouped = visibleItems.filter(i => !i.sectionId)
  const getGroupedItems = (sectionId: string) => visibleItems.filter(i => i.sectionId === sectionId)

  const rowClass = (isActive: boolean) => cn(
    'flex items-center rounded-md text-sm transition-colors duration-100',
    compact ? 'justify-center px-0 py-2' : 'gap-2.5 px-2.5 py-1.5',
    isActive
      ? 'text-accent-400 font-medium'
      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
  )

  return (
    <aside className="flex flex-col h-full w-[--sidebar-width] bg-surface-900 border-r border-white/5 shrink-0">
      {/* Logo */}
      <div className={cn('h-10 flex items-center border-b border-white/5 shrink-0',
        compact ? 'justify-center px-0' : 'px-4')}>
        <div className={cn('flex items-center', compact ? '' : 'gap-2.5')}>
          <div className="w-6 h-6 rounded-md bg-accent-500 flex items-center justify-center shrink-0">
            <GraduationCap size={13} className="text-white" />
          </div>
          {!compact && (
            <span className="text-sm font-semibold text-zinc-100 tracking-tight">Student Hub</span>
          )}
        </div>
      </div>

      {/* Navigation with DnD */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto overflow-x-hidden">
        {hasIntegrations ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={visibleItems.map(i => i.id)}
              strategy={verticalListSortingStrategy}>
              <ul className="space-y-0.5">
                {/* Ungrouped items */}
                {ungrouped.map(item => (
                  <SortableNavItem key={item.id} item={item} compact={compact} />
                ))}
                {/* Sections */}
                {sections.map(section => {
                  const sectionItems = getGroupedItems(section.id)
                  if (!sectionItems.length) return null
                  const isCollapsed = collapsedSections.has(section.id)
                  return (
                    <li key={section.id}>
                      <SectionHeader
                        section={section}
                        collapsed={isCollapsed}
                        onToggle={() => toggleSection(section.id)}
                        compact={compact}
                      />
                      {!isCollapsed && (
                        <ul className="space-y-0.5">
                          {sectionItems.map(item => (
                            <SortableNavItem key={item.id} item={item} compact={compact} />
                          ))}
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
            <p className="text-2xs text-zinc-600 px-2 py-3 leading-relaxed">
              Connect a learning platform to get started.
            </p>
          )
        )}
      </nav>

      {/* Bottom */}
      <div className="px-2 pb-3 space-y-1 border-t border-white/5 pt-2">
        {hasIntegrations && (
          <button onClick={handleSyncAll} disabled={isSyncing}
            title={compact ? 'Sync now' : undefined}
            className={cn(rowClass(false), 'w-full disabled:opacity-50 disabled:cursor-not-allowed')}>
            <span className="shrink-0">
              {isSyncing
                ? <Loader2 size={14} className="animate-spin text-accent-400" />
                : <RefreshCw size={14} />}
            </span>
            {!compact && <span>{isSyncing ? 'Syncing...' : 'Sync now'}</span>}
          </button>
        )}
        <NavLink to="/settings/integrations" title={compact ? 'Add platform' : undefined}
          className={({ isActive }) => cn(rowClass(isActive), 'w-full')}>
          <span className="shrink-0"><Plus size={14} /></span>
          {!compact && <span>Add platform</span>}
        </NavLink>
        <NavLink to="/settings" end title={compact ? 'Settings' : undefined}
          className={({ isActive }) => cn(rowClass(isActive), 'w-full')}>
          <span className="shrink-0"><Settings size={14} /></span>
          {!compact && <span>Settings</span>}
        </NavLink>
      </div>
    </aside>
  )
}
