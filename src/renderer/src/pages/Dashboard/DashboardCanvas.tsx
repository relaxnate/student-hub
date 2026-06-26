import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import GridLayout, { WidthProvider, type Layout } from 'react-grid-layout'
import DraggableBase, { type DraggableData } from 'react-draggable'
import { motion } from 'framer-motion'
import { Plus, Pencil, Check, LayoutGrid, Move } from 'lucide-react'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { cn } from '../../lib/utils'
import { api } from '../../lib/ipc'
import {
  GRID_COLS, GRID_ROW_HEIGHT, GRID_MARGIN, getWidgetDef, DEFAULT_WIDGET_SEEDS,
} from '../../widgets/registry'
import { WidgetDataProvider } from '../../widgets/WidgetDataContext'
import WidgetWrapper from '../../widgets/WidgetWrapper'
import WidgetPicker from '../../widgets/WidgetPicker'
import WidgetConfigPanel from '../../widgets/WidgetConfigPanel'
import DashboardViewSwitch from './DashboardViewSwitch'
import type { WidgetConfig } from '../../widgets/types'
import type { WidgetInstance, WidgetMode } from '@shared/types/entities'

const ResponsiveGrid = WidthProvider(GridLayout)

// react-draggable v4's class `defaultProps` typing makes JSX demand every prop;
// alias it to a component type that only requires the props we actually pass.
interface DraggableLiteProps {
  handle?: string
  bounds?: string
  position?: { x: number; y: number }
  disabled?: boolean
  onStop?: (e: unknown, data: DraggableData) => void
  children?: ReactNode
}
const Draggable = DraggableBase as unknown as ComponentType<DraggableLiteProps>

const newId = () => `widget-${(crypto as Crypto).randomUUID()}`

function parseConfig(json: string): WidgetConfig {
  try { return json ? (JSON.parse(json) as WidgetConfig) : {} } catch { return {} }
}

// ─── Canvas ─────────────────────────────────────────────────────────────────

export default function DashboardCanvas() {
  const [mode, setMode]           = useState<WidgetMode>('grid')
  const [instances, setInstances] = useState<WidgetInstance[]>([])
  const [layout, setLayout]       = useState<Layout[]>([])
  const [loading, setLoading]     = useState(true)
  const [editing, setEditing]     = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [configId, setConfigId]   = useState<string | null>(null)

  const canvasRef = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState({ w: 1, h: 1 })
  const layoutSaveTimer = useRef<ReturnType<typeof setTimeout>>()

  // ── Initial load (seed defaults on first run) ──────────────────────────────
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const [layoutRes, instRes] = await Promise.all([
        api.widgets.getLayout(),
        api.widgets.getInstances(),
      ])
      if (cancelled) return

      let insts = instRes.ok ? instRes.data : []
      let gridLayout: Layout[] =
        layoutRes.ok ? safeParseLayout(layoutRes.data.layoutJson) : []
      const layoutMode: WidgetMode = layoutRes.ok ? layoutRes.data.mode : 'grid'

      // First run: nothing placed yet → seed the starter set.
      if (insts.length === 0) {
        const seeded = await seedDefaults()
        insts = seeded.instances
        gridLayout = seeded.layout
      } else if (gridLayout.length === 0) {
        // Instances exist but no grid layout saved → derive from instance coords.
        gridLayout = insts.map(toLayoutItem)
      }

      if (cancelled) return
      setInstances(insts)
      setLayout(reconcileLayout(gridLayout, insts))
      setMode(layoutMode)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  // ── Measure canvas for free-mode percent coords ────────────────────────────
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const update = () => setCanvasSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [mode, loading])

  // ── Persistence helpers ────────────────────────────────────────────────────
  const persistInstance = useCallback(async (inst: WidgetInstance) => {
    await api.widgets.saveInstance(inst)
  }, [])

  const persistLayout = useCallback((next: Layout[]) => {
    if (layoutSaveTimer.current) clearTimeout(layoutSaveTimer.current)
    layoutSaveTimer.current = setTimeout(() => {
      api.widgets.saveLayout({ layoutJson: JSON.stringify(next) })
    }, 500)
  }, [])

  // ── Widget config / title editing ──────────────────────────────────────────
  const updateInstance = useCallback((id: string, patch: Partial<WidgetInstance>) => {
    setInstances(prev => {
      const next = prev.map(i => (i.id === id ? { ...i, ...patch } : i))
      const target = next.find(i => i.id === id)
      if (target) persistInstance(target)
      return next
    })
  }, [persistInstance])

  const setWidgetConfig = useCallback((id: string, patch: WidgetConfig) => {
    setInstances(prev => {
      const next = prev.map(i => {
        if (i.id !== id) return i
        const merged = { ...parseConfig(i.configJson), ...patch }
        return { ...i, configJson: JSON.stringify(merged) }
      })
      const target = next.find(i => i.id === id)
      if (target) persistInstance(target)
      return next
    })
  }, [persistInstance])

  // ── Add / remove ───────────────────────────────────────────────────────────
  const addWidget = useCallback((type: string) => {
    const def = getWidgetDef(type)
    if (!def) return
    const id = newId()
    // Place new grid widgets at the bottom; free widgets near the top-left.
    const maxY = layout.reduce((m, l) => Math.max(m, l.y + l.h), 0)
    const inst: WidgetInstance = {
      id, layoutId: 'default', widgetType: type, title: null,
      configJson: JSON.stringify(def.defaultConfig ?? {}),
      posX: 2, posY: 2, width: def.free.width, height: def.free.height,
      isLocked: false, updatedAt: Date.now(),
    }
    const layoutItem: Layout = {
      i: id, x: 0, y: maxY, w: def.grid.w, h: def.grid.h, minW: def.grid.minW, minH: def.grid.minH,
    }
    setInstances(prev => [...prev, inst])
    setLayout(prev => {
      const next = [...prev, layoutItem]
      persistLayout(next)
      return next
    })
    persistInstance(inst)
  }, [layout, persistInstance, persistLayout])

  const removeWidget = useCallback((id: string) => {
    api.widgets.removeInstance(id)
    setInstances(prev => prev.filter(i => i.id !== id))
    setLayout(prev => {
      const next = prev.filter(l => l.i !== id)
      persistLayout(next)
      return next
    })
    if (configId === id) setConfigId(null)
  }, [configId, persistLayout])

  // ── Grid layout change ─────────────────────────────────────────────────────
  const onLayoutChange = useCallback((next: Layout[]) => {
    setLayout(next)
    persistLayout(next)
  }, [persistLayout])

  // ── Free-mode drag ─────────────────────────────────────────────────────────
  const onFreeDragStop = useCallback((id: string, xPx: number, yPx: number) => {
    const posX = canvasSize.w > 0 ? (xPx / canvasSize.w) * 100 : 0
    const posY = canvasSize.h > 0 ? (yPx / canvasSize.h) * 100 : 0
    updateInstance(id, { posX, posY })
  }, [canvasSize, updateInstance])

  // ── Mode toggle ────────────────────────────────────────────────────────────
  const switchMode = useCallback((next: WidgetMode) => {
    setMode(next)
    api.widgets.saveLayout({ mode: next })
  }, [])

  const configInstance = useMemo(
    () => instances.find(i => i.id === configId) ?? null,
    [instances, configId],
  )

  if (loading) {
    return (
      <div className="h-full grid grid-cols-3 gap-3 p-6 max-w-6xl mx-auto content-start">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-40 rounded-xl bg-surface-800 border border-white/5 animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <WidgetDataProvider>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-6">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <h1 className="t-display text-zinc-100">Dashboard</h1>
              <p className="t-caption text-zinc-500 mt-1">Your widgets</p>
            </div>
            <div className="flex items-center gap-2">
              <DashboardViewSwitch />
              {editing && (
                <>
                  <div className="flex rounded-lg border border-white/10 overflow-hidden">
                    <button onClick={() => switchMode('grid')} title="Grid layout"
                      className={cn('px-2.5 py-1.5 transition-colors',
                        mode === 'grid' ? 'bg-accent-500/20 text-accent-400' : 'text-zinc-500 hover:text-zinc-300')}>
                      <LayoutGrid size={14} />
                    </button>
                    <button onClick={() => switchMode('free')} title="Free layout"
                      className={cn('px-2.5 py-1.5 transition-colors',
                        mode === 'free' ? 'bg-accent-500/20 text-accent-400' : 'text-zinc-500 hover:text-zinc-300')}>
                      <Move size={14} />
                    </button>
                  </div>
                  <button onClick={() => setPickerOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-sm text-zinc-300 hover:border-accent-500/40 hover:text-accent-300 transition-colors">
                    <Plus size={14} /> Add widget
                  </button>
                </>
              )}
              <button onClick={() => setEditing(e => !e)}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all',
                  editing ? 'bg-accent-500 border-accent-400 text-white' : 'bg-surface-800 border-white/10 text-zinc-400 hover:text-zinc-200 hover:border-white/20')}>
                {editing ? <Check size={14} /> : <Pencil size={14} />}
                {editing ? 'Done' : 'Edit'}
              </button>
            </div>
          </div>

          {/* Canvas */}
          {instances.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
              <LayoutGrid size={22} className="text-zinc-600" />
              <p className="t-body text-zinc-300">No widgets yet</p>
              <p className="t-caption text-zinc-500">Turn on Edit, then add widgets to build your dashboard.</p>
            </div>
          ) : mode === 'grid' ? (
            <ResponsiveGrid
              className="-mx-2"
              cols={GRID_COLS}
              rowHeight={GRID_ROW_HEIGHT}
              margin={[GRID_MARGIN, GRID_MARGIN]}
              layout={layout}
              onLayoutChange={onLayoutChange}
              isDraggable={editing}
              isResizable={editing}
              draggableHandle=".widget-drag-handle"
              resizeHandles={editing ? ['se'] : []}
              compactType="vertical"
            >
              {instances.map(inst => (
                <div key={inst.id}>
                  <WidgetWrapper
                    instance={inst}
                    config={parseConfig(inst.configJson)}
                    setConfig={patch => setWidgetConfig(inst.id, patch)}
                    editing={editing}
                    onRemove={removeWidget}
                    onConfigure={setConfigId}
                  />
                </div>
              ))}
            </ResponsiveGrid>
          ) : (
            <div ref={canvasRef} className="relative w-full" style={{ height: 'calc(100vh - 200px)' }}>
              {instances.map(inst => {
                const xPx = (inst.posX / 100) * canvasSize.w
                const yPx = (inst.posY / 100) * canvasSize.h
                return (
                  <Draggable
                    key={inst.id}
                    handle=".widget-drag-handle"
                    bounds="parent"
                    position={{ x: xPx, y: yPx }}
                    disabled={!editing}
                    onStop={(_e, d) => onFreeDragStop(inst.id, d.x, d.y)}
                  >
                    <div className="absolute" style={{ width: inst.width, height: inst.height }}>
                      <WidgetWrapper
                        instance={inst}
                        config={parseConfig(inst.configJson)}
                        setConfig={patch => setWidgetConfig(inst.id, patch)}
                        editing={editing}
                        onRemove={removeWidget}
                        onConfigure={setConfigId}
                      />
                    </div>
                  </Draggable>
                )
              })}
            </div>
          )}
        </div>
      </motion.div>

      <WidgetPicker open={pickerOpen} onOpenChange={setPickerOpen} onAdd={addWidget} />
      <WidgetConfigPanel
        instance={configInstance}
        config={configInstance ? parseConfig(configInstance.configJson) : {}}
        onOpenChange={open => { if (!open) setConfigId(null) }}
        onChangeTitle={title => configInstance && updateInstance(configInstance.id, { title: title || null })}
        onChangeConfig={patch => configInstance && setWidgetConfig(configInstance.id, patch)}
      />
    </WidgetDataProvider>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function safeParseLayout(json: string): Layout[] {
  try { return json ? (JSON.parse(json) as Layout[]) : [] } catch { return [] }
}

function toLayoutItem(inst: WidgetInstance): Layout {
  const def = getWidgetDef(inst.widgetType)
  return {
    i: inst.id,
    x: Math.round(inst.posX), y: Math.round(inst.posY),
    w: inst.width || def?.grid.w || 4,
    h: inst.height || def?.grid.h || 4,
    minW: def?.grid.minW, minH: def?.grid.minH,
  }
}

// Ensure every instance has a layout item and drop orphans.
function reconcileLayout(layout: Layout[], instances: WidgetInstance[]): Layout[] {
  const byId = new Map(layout.map(l => [l.i, l]))
  const result: Layout[] = []
  let nextY = layout.reduce((m, l) => Math.max(m, l.y + l.h), 0)
  for (const inst of instances) {
    const existing = byId.get(inst.id)
    if (existing) { result.push(existing); continue }
    const def = getWidgetDef(inst.widgetType)
    result.push({
      i: inst.id, x: 0, y: nextY,
      w: def?.grid.w ?? 4, h: def?.grid.h ?? 4,
      minW: def?.grid.minW, minH: def?.grid.minH,
    })
    nextY += def?.grid.h ?? 4
  }
  return result
}

// Create the starter instances + grid layout in the DB on first run.
async function seedDefaults(): Promise<{ instances: WidgetInstance[]; layout: Layout[] }> {
  const instances: WidgetInstance[] = []
  const layout: Layout[] = []
  for (const seed of DEFAULT_WIDGET_SEEDS) {
    const def = getWidgetDef(seed.type)
    const inst: WidgetInstance = {
      id: seed.id, layoutId: 'default', widgetType: seed.type, title: null,
      configJson: JSON.stringify(def?.defaultConfig ?? {}),
      posX: seed.x, posY: seed.y, width: def?.free.width ?? 280, height: def?.free.height ?? 200,
      isLocked: false, updatedAt: Date.now(),
    }
    instances.push(inst)
    layout.push({
      i: seed.id, x: seed.x, y: seed.y, w: seed.w, h: seed.h,
      minW: def?.grid.minW, minH: def?.grid.minH,
    })
    await api.widgets.saveInstance(inst)
  }
  await api.widgets.saveLayout({ mode: 'grid', layoutJson: JSON.stringify(layout) })
  return { instances, layout }
}
