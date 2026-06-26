import { format } from 'date-fns'
import { RefreshCw } from 'lucide-react'
import { cn } from '../../lib/utils'
import { api } from '../../lib/ipc'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { useAppStore } from '../../store/app.store'
import { useSyncStore } from '../../store/sync.store'
import type { WidgetProps } from '../types'

// Last-sync status + integrations + a sync button. Self-sufficient (reads the
// app/sync stores directly rather than WidgetDataContext).
export default function SyncStatusWidget({ editing }: WidgetProps) {
  const integrations = useAppStore(s => s.integrations)
  const isSyncing    = useAppStore(s => s.isSyncing)
  const setIsSyncing = useAppStore(s => s.setIsSyncing)
  const { progress, errors } = useSyncStore()

  const lastSyncedAt = integrations.reduce<number | null>(
    (m, i) => (i.lastSyncedAt && (!m || i.lastSyncedAt > m) ? i.lastSyncedAt : m), null)
  const hasError = Object.values(errors).some(Boolean)
  const syncing  = isSyncing || Object.keys(progress).length > 0

  return (
    <div className="h-full flex flex-col gap-3 justify-center">
      <div className="flex items-center gap-2">
        <span className={cn('w-2 h-2 rounded-full shrink-0',
          hasError ? 'bg-red-500' : syncing ? 'bg-amber-500' : 'bg-green-500')} />
        <p className="t-body text-zinc-200 flex-1 truncate">
          {hasError ? 'Sync failed' : syncing ? 'Syncing…'
            : lastSyncedAt ? `Synced ${format(lastSyncedAt, 'MMM d, h:mm a')}` : 'Not synced yet'}
        </p>
      </div>
      {integrations.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {integrations.map(i => <Badge key={i.id} variant="default">{i.displayName}</Badge>)}
        </div>
      )}
      <Button variant="secondary" size="sm" className="w-full" disabled={editing}
        icon={<RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />}
        loading={syncing} onClick={() => { setIsSyncing(true); api.sync.startAll() }}>
        Sync now
      </Button>
    </div>
  )
}
