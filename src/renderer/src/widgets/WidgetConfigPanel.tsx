import * as Dialog from '@radix-ui/react-dialog'
import { X, Settings2 } from 'lucide-react'
import { cn } from '../lib/utils'
import { Select } from '../components/ui/Controls'
import { getWidgetDef } from './registry'
import type { WidgetConfig } from './types'
import type { WidgetInstance } from '@shared/types/entities'

interface Props {
  instance: WidgetInstance | null
  config: WidgetConfig
  onOpenChange: (open: boolean) => void
  onChangeTitle: (title: string) => void
  onChangeConfig: (patch: WidgetConfig) => void
}

const inputCls =
  'w-full h-9 px-3 rounded-md bg-surface-700 border border-white/[0.08] text-[13px] text-zinc-200 ' +
  'placeholder:text-zinc-600 focus:outline-none focus:border-accent-500/60 transition-colors'
const labelCls = 'text-[11px] font-medium uppercase tracking-wide text-zinc-500 mb-1.5 block'

// Live per-widget settings. Changes apply immediately (no explicit save) — the
// canvas persists each patch through saveInstance.
export default function WidgetConfigPanel({
  instance, config, onOpenChange, onChangeTitle, onChangeConfig,
}: Props) {
  const def = instance ? getWidgetDef(instance.widgetType) : undefined
  const open = instance !== null && def !== undefined

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[400px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2',
            'rounded-xl border border-white/[0.09] bg-surface-800 p-5 shadow-2xl focus:outline-none',
          )}
        >
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Settings2 size={15} className="text-accent-400" /> {def?.name} settings
            </Dialog.Title>
            <Dialog.Close className="text-zinc-500 hover:text-zinc-200 transition-colors">
              <X size={16} />
            </Dialog.Close>
          </div>

          <div className="space-y-3.5">
            {/* Title override — applies to every widget. */}
            <div>
              <label className={labelCls}>Title</label>
              <input
                value={instance?.title ?? ''}
                onChange={e => onChangeTitle(e.target.value)}
                placeholder={def?.name}
                className={inputCls}
              />
            </div>

            {def?.configFields?.map(field => {
              const value = config[field.key]
              if (field.type === 'select') {
                return (
                  <div key={field.key}>
                    <label className={labelCls}>{field.label}</label>
                    <Select
                      value={String(value ?? field.options?.[0]?.value ?? '')}
                      onChange={e => onChangeConfig({ [field.key]: coerce(e.target.value) })}
                    >
                      {field.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </Select>
                  </div>
                )
              }
              if (field.type === 'number') {
                return (
                  <div key={field.key}>
                    <label className={labelCls}>{field.label}</label>
                    <input
                      type="number" min={field.min} max={field.max}
                      value={typeof value === 'number' ? value : ''}
                      onChange={e => onChangeConfig({ [field.key]: clampNum(Number(e.target.value), field.min, field.max) })}
                      className={inputCls}
                    />
                  </div>
                )
              }
              // text / textarea
              return (
                <div key={field.key}>
                  <label className={labelCls}>{field.label}</label>
                  <input
                    value={typeof value === 'string' ? value : ''}
                    placeholder={field.placeholder}
                    onChange={e => onChangeConfig({ [field.key]: e.target.value })}
                    className={inputCls}
                  />
                </div>
              )
            })}

            {(!def?.configFields || def.configFields.length === 0) && (
              <p className="t-caption text-zinc-500">This widget has no extra settings.</p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// Select values are strings; turn 'true'/'false' into real booleans so widgets
// can compare strictly.
function coerce(v: string): string | boolean {
  if (v === 'true') return true
  if (v === 'false') return false
  return v
}

function clampNum(n: number, min?: number, max?: number): number {
  if (Number.isNaN(n)) return min ?? 0
  if (min !== undefined && n < min) return min
  if (max !== undefined && n > max) return max
  return n
}
