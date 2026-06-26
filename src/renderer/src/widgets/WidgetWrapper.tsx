import { GripVertical, Settings2, X } from 'lucide-react'
import { cn } from '../lib/utils'
import { WidgetErrorBoundary } from './WidgetErrorBoundary'
import { getWidgetDef } from './registry'
import type { WidgetConfig } from './types'
import type { WidgetInstance } from '@shared/types/entities'

interface Props {
  instance: WidgetInstance
  config: WidgetConfig
  setConfig: (patch: WidgetConfig) => void
  editing: boolean
  onRemove: (id: string) => void
  onConfigure: (id: string) => void
}

// The card chrome around every widget. The header carries the drag handle
// (`.widget-drag-handle`, which react-grid-layout uses as draggableHandle) and,
// in edit mode, the configure/remove controls. The widget body is wrapped in an
// error boundary so one crash can't break the canvas.
export default function WidgetWrapper({
  instance, config, setConfig, editing, onRemove, onConfigure,
}: Props) {
  const def = getWidgetDef(instance.widgetType)

  if (!def) {
    return (
      <div className="h-full w-full rounded-xl border border-white/5 bg-surface-800 flex items-center justify-center">
        <p className="t-caption text-zinc-500">Unknown widget: {instance.widgetType}</p>
      </div>
    )
  }

  const Icon = def.icon
  const Body = def.component
  const title = instance.title || def.name
  const hasConfig = (def.configFields?.length ?? 0) > 0

  return (
    <div className={cn(
      'h-full w-full flex flex-col rounded-xl border bg-surface-800 overflow-hidden',
      editing ? 'border-accent-500/30 ring-1 ring-accent-500/10' : 'border-white/5')}>
      {/* Header — always present so widgets read clearly; drag handle in edit mode. */}
      <div className={cn(
        'flex items-center gap-1.5 px-3 h-8 shrink-0 border-b border-white/5',
        editing && 'widget-drag-handle cursor-grab active:cursor-grabbing select-none')}>
        {editing && <GripVertical size={13} className="text-zinc-600 shrink-0" />}
        <Icon size={12} className="text-zinc-500 shrink-0" />
        <span className="t-caption text-zinc-400 truncate flex-1">{title}</span>
        {editing && (
          <div className="flex items-center gap-0.5 shrink-0">
            {hasConfig && (
              <button onClick={() => onConfigure(instance.id)} title="Configure"
                className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors">
                <Settings2 size={13} />
              </button>
            )}
            <button onClick={() => onRemove(instance.id)} title="Remove widget"
              className="p-1 text-zinc-500 hover:text-red-400 transition-colors">
              <X size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 p-3">
        <WidgetErrorBoundary widgetName={def.name}>
          <Body instanceId={instance.id} config={config} setConfig={setConfig} editing={editing} />
        </WidgetErrorBoundary>
      </div>
    </div>
  )
}
