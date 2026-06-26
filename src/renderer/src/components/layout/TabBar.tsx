import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  DndContext, PointerSensor, useSensor, useSensors, closestCenter, DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, horizontalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, X, SplitSquareHorizontal } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useTabsStore, MAX_SPLIT_PANES } from '../../store/tabs.store'
import { routeTitle } from './navConfig'
import type { AppTab } from '@shared/types/ipc'

// ─── One tab (sortable) ─────────────────────────────────────────────────────────

function SortableTab({ tab, active, canSplit, onSelect, onClose, onSplit }: {
  tab: AppTab; active: boolean; canSplit: boolean
  onSelect: () => void; onClose: () => void; onSplit: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: tab.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity:   isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onSelect}
      className={cn(
        'group/tab relative flex items-center gap-1.5 h-8 pl-3 pr-1.5 rounded-t-md max-w-[180px] shrink-0 cursor-pointer select-none transition-colors duration-100 border-t border-x',
        active
          ? 'bg-surface-900 border-white/[0.08] text-zinc-100'
          : 'bg-surface-950 border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-surface-900/60'
      )}
    >
      <span className="flex-1 truncate text-[12.5px]">{tab.title}</span>
      {canSplit && (
        <button
          onClick={(e) => { e.stopPropagation(); onSplit() }}
          onPointerDown={(e) => e.stopPropagation()}
          title="Open in a split pane"
          className="shrink-0 flex items-center justify-center w-4 h-4 rounded text-zinc-600 opacity-0 group-hover/tab:opacity-100 hover:bg-surface-700 hover:text-zinc-200 transition-all"
        >
          <SplitSquareHorizontal size={11} />
        </button>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onClose() }}
        onPointerDown={(e) => e.stopPropagation()}
        title="Close tab"
        className="shrink-0 flex items-center justify-center w-4 h-4 rounded text-zinc-600 opacity-0 group-hover/tab:opacity-100 hover:bg-surface-700 hover:text-zinc-200 transition-all"
      >
        <X size={11} />
      </button>
    </div>
  )
}

// ─── Tab bar ─────────────────────────────────────────────────────────────────────
// Browser-style tabs. The active tab tracks the router location; switching tabs
// navigates to the tab's stored route. Only mounted when appearance.tabsEnabled.

export function TabBar() {
  const {
    tabs, activeTabId, splitTabIds, ensureSeed, openTab, setActive, closeTab,
    reorder, syncActiveRoute, splitTab,
  } = useTabsStore()
  const location = useLocation()
  const navigate = useNavigate()

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // The main strip only shows tabs that aren't pulled out into split panes.
  const mainTabs = tabs.filter(t => !splitTabIds.includes(t.id))
  const canSplit = mainTabs.length > 1 && splitTabIds.length < MAX_SPLIT_PANES

  // Seed a first tab from the current route, then keep the active tab in sync
  // with every navigation (sidebar/dock/palette/link clicks all land here).
  useEffect(() => {
    const title = routeTitle(location.pathname)
    ensureSeed(location.pathname, title)
    syncActiveRoute(location.pathname, title)
  }, [location.pathname])

  const handleSelect = (tab: AppTab) => {
    setActive(tab.id)
    if (tab.route !== location.pathname) navigate(tab.route)
  }

  const handleClose = (id: string) => {
    const navRoute = closeTab(id)
    if (navRoute) navigate(navRoute)
  }

  const handleNew = () => {
    openTab('/dashboard', routeTitle('/dashboard'))
    navigate('/dashboard')
  }

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIdx = tabs.findIndex(t => t.id === active.id)
    const newIdx = tabs.findIndex(t => t.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    reorder(arrayMove(tabs, oldIdx, newIdx))
  }

  return (
    <div className="surface-tabs flex items-end gap-0.5 h-9 px-2 pt-1 border-b border-white/[0.06] shrink-0 overflow-x-auto no-scrollbar">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={mainTabs.map(t => t.id)} strategy={horizontalListSortingStrategy}>
          {mainTabs.map(tab => (
            <SortableTab
              key={tab.id}
              tab={tab}
              active={tab.id === activeTabId}
              canSplit={canSplit}
              onSelect={() => handleSelect(tab)}
              onClose={() => handleClose(tab.id)}
              onSplit={() => splitTab(tab.id)}
            />
          ))}
        </SortableContext>
      </DndContext>
      <button
        onClick={handleNew}
        title="New tab"
        className="shrink-0 flex items-center justify-center w-7 h-7 mb-0.5 rounded-md text-zinc-500 hover:bg-surface-800 hover:text-zinc-200 transition-colors"
      >
        <Plus size={15} />
      </button>
    </div>
  )
}
