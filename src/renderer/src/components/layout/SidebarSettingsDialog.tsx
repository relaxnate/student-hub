import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  X, PanelLeft, LayoutGrid, ChevronUp, ChevronDown, CheckCircle2, SlidersHorizontal,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { Switch } from '../ui/Controls'
import { useAppStore } from '../../store/app.store'
import { useWorkspaceStore } from '../../store/workspace.store'
import { OPEN_SIDEBAR_SETTINGS_EVENT } from './navConfig'
import type { NavType, SidebarMode } from '@shared/types/ipc'

// ─── Dedicated sidebar / taskbar settings ───────────────────────────────────────
// Opened by the pencil "edit sidebar" button (sidebar/dock/palette) via the
// OPEN_SIDEBAR_SETTINGS_EVENT. Collects every navigation/taskbar setting in one
// place, separate from the app-wide Settings page.

function Segmented<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]
}) {
  return (
    <div className="flex gap-1 p-1 rounded-lg bg-surface-900 border border-white/[0.06]">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors',
            value === o.value
              ? 'bg-accent-500 text-white'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-surface-700'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Field({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode
}) {
  return (
    <div>
      <p className="text-[12px] font-medium text-zinc-200">{label}</p>
      {hint && <p className="text-[11px] text-zinc-500 mb-1.5 mt-0.5">{hint}</p>}
      {!hint && <div className="mb-1.5" />}
      {children}
    </div>
  )
}

export function SidebarSettingsDialog() {
  const [open, setOpen] = useState(false)

  const setAppearance = useAppStore(s => s.setAppearance)
  const navType     = useAppStore(s => s.preferences?.appearance?.navType ?? 'standard')
  const sidebarMode = useAppStore(s => s.preferences?.appearance?.sidebarMode ?? 'standard')
  const tabsEnabled = useAppStore(s => s.preferences?.appearance?.tabsEnabled ?? false)

  const ws    = useWorkspaceStore()
  const items = [...ws.active().sidebarItems].sort((a, b) => a.order - b.order)

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(OPEN_SIDEBAR_SETTINGS_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_SIDEBAR_SETTINGS_EVENT, onOpen)
  }, [])

  const moveItem = (id: string, dir: -1 | 1) => {
    const idx  = items.findIndex(i => i.id === id)
    const swap = idx + dir
    if (swap < 0 || swap >= items.length) return
    const next = items.map(i => ({ ...i }))
    const tmp        = next[idx].order
    next[idx].order  = next[swap].order
    next[swap].order = tmp
    ws.updateSidebarItems(next)
  }

  const toggleItem = (id: string) => {
    ws.updateSidebarItems(items.map(i => i.id === id ? { ...i, visible: !i.visible } : i))
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={cn(
            'fixed left-1/2 top-1/2 z-[90] w-[460px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-4rem)] overflow-y-auto',
            '-translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/[0.09] bg-surface-800 p-5 shadow-2xl focus:outline-none'
          )}
        >
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <SlidersHorizontal size={15} className="text-accent-400" />
              Sidebar &amp; navigation
            </Dialog.Title>
            <Dialog.Close className="text-zinc-500 hover:text-zinc-200 transition-colors">
              <X size={16} />
            </Dialog.Close>
          </div>

          <div className="space-y-5">
            <Field label="Navigation style"
              hint="Standard sidebar · Rail icon bar · Dock top bar · Palette ⌘K launcher.">
              <Segmented<NavType>
                value={navType}
                onChange={v => setAppearance({ navType: v })}
                options={[
                  { value: 'standard', label: 'Standard' },
                  { value: 'rail',     label: 'Rail' },
                  { value: 'dock',     label: 'Dock' },
                  { value: 'palette',  label: 'Palette' },
                ]}
              />
            </Field>

            <Field label="Sidebar width" hint="Applies to the Standard sidebar.">
              <Segmented<SidebarMode>
                value={sidebarMode}
                onChange={v => setAppearance({ sidebarMode: v, sidebarWidth: null })}
                options={[
                  { value: 'compact',  label: 'Compact' },
                  { value: 'standard', label: 'Standard' },
                  { value: 'expanded', label: 'Expanded' },
                ]}
              />
            </Field>

            <div className="flex items-center justify-between gap-3 py-1">
              <div>
                <p className="text-[12px] font-medium text-zinc-200 flex items-center gap-1.5">
                  <LayoutGrid size={12} /> Browser-style tabs
                </p>
                <p className="text-[11px] text-zinc-500">Keep multiple pages open and switch between them.</p>
              </div>
              <Switch checked={tabsEnabled} onChange={v => setAppearance({ tabsEnabled: v })}
                aria-label="Browser-style tabs" />
            </div>

            <div>
              <p className="text-[12px] font-medium text-zinc-200 flex items-center gap-1.5">
                <PanelLeft size={12} /> Sidebar items
              </p>
              <p className="text-[11px] text-zinc-500 mb-2">Toggle visibility and reorder with the arrows.</p>
              <div className="space-y-1">
                {items.map((item, i) => (
                  <div key={item.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-900 border border-white/5">
                    <button onClick={() => toggleItem(item.id)}
                      className={cn('w-4 h-4 rounded border shrink-0 flex items-center justify-center',
                        item.visible ? 'bg-accent-500 border-accent-500' : 'border-zinc-600 bg-transparent')}>
                      {item.visible && <CheckCircle2 size={10} className="text-white" />}
                    </button>
                    <span className={cn('flex-1 text-xs', item.visible ? 'text-zinc-200' : 'text-zinc-500 line-through')}>
                      {item.label}
                    </span>
                    <div className="flex gap-0.5 shrink-0">
                      <button onClick={() => moveItem(item.id, -1)} disabled={i === 0}
                        className="p-0.5 text-zinc-600 hover:text-zinc-300 disabled:opacity-30">
                        <ChevronUp size={12} />
                      </button>
                      <button onClick={() => moveItem(item.id, 1)} disabled={i === items.length - 1}
                        className="p-0.5 text-zinc-600 hover:text-zinc-300 disabled:opacity-30">
                        <ChevronDown size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
