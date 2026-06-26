import * as Dialog from '@radix-ui/react-dialog'
import { X, Plus } from 'lucide-react'
import { cn } from '../lib/utils'
import { WIDGET_LIST } from './registry'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (type: string) => void
}

// Modal grid of every available widget. Picking one adds an instance to the
// canvas (handled by the parent) and closes the dialog.
export default function WidgetPicker({ open, onOpenChange, onAdd }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[560px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2',
            'rounded-xl border border-white/[0.09] bg-surface-800 p-5 shadow-2xl focus:outline-none',
          )}
        >
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Plus size={15} className="text-accent-400" /> Add a widget
            </Dialog.Title>
            <Dialog.Close className="text-zinc-500 hover:text-zinc-200 transition-colors">
              <X size={16} />
            </Dialog.Close>
          </div>

          <div className="grid grid-cols-2 gap-2.5 max-h-[60vh] overflow-y-auto">
            {WIDGET_LIST.map(def => {
              const Icon = def.icon
              return (
                <button key={def.type} onClick={() => { onAdd(def.type); onOpenChange(false) }}
                  className="text-left flex items-start gap-3 p-3 rounded-lg border border-white/5 bg-surface-700/40
                             hover:border-accent-500/40 hover:bg-surface-700/70 transition-colors">
                  <span className="w-8 h-8 rounded-lg bg-accent-500/15 flex items-center justify-center shrink-0">
                    <Icon size={15} className="text-accent-400" />
                  </span>
                  <div className="min-w-0">
                    <p className="t-body text-zinc-200">{def.name}</p>
                    <p className="t-caption text-zinc-500 leading-snug">{def.description}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
