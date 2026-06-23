import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, RefreshCw, X, Sparkles, AlertCircle } from 'lucide-react'
import { api } from '../../lib/ipc'
import { cn } from '../../lib/utils'
import type { UpdateState } from '@shared/types/ipc'

const INITIAL: UpdateState = { status: 'idle', version: null, releaseNotes: null, percent: 0, error: null }

/**
 * Bottom-left update toast. Driven entirely by the main-process UpdaterService
 * via IPC. Appears when an update is available/downloading/ready, stays out of
 * the way otherwise. The Sync toast lives bottom-right, so these never collide.
 */
export function UpdateToast() {
  const [state,     setState]     = useState<UpdateState>(INITIAL)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Hydrate current state, then subscribe to live changes.
    api.updater.getState().then((r: { ok: boolean; data: UpdateState }) => { if (r.ok) setState(r.data) })
    const off = api.updater.onStatus((s: UpdateState) => {
      setState(s)
      setDismissed(false)  // re-surface on any new transition (e.g. downloaded)
    })
    return off
  }, [])

  // Only these states are worth interrupting the user for.
  const visible =
    !dismissed &&
    (state.status === 'available' ||
     state.status === 'downloading' ||
     state.status === 'downloaded' ||
     state.status === 'error')

  if (!visible) return null

  const restart = () => api.updater.install()

  return (
    <div className="fixed bottom-4 left-4 z-50 pointer-events-none">
      <AnimatePresence>
        <motion.div
          key={state.status}
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          transition={{ duration: 0.2 }}
          className={cn(
            'pointer-events-auto w-[300px] rounded-xl border shadow-xl backdrop-blur-sm overflow-hidden',
            state.status === 'error'
              ? 'bg-red-950/90 border-red-700/40'
              : 'bg-surface-800/95 border-white/10'
          )}
        >
          <div className="flex items-start gap-3 p-3.5">
            <span className="shrink-0 mt-0.5">
              {state.status === 'error'
                ? <AlertCircle size={15} className="text-red-400" />
                : state.status === 'downloaded'
                  ? <Sparkles size={15} className="text-accent-400" />
                  : <Download size={15} className="text-accent-400" />}
            </span>

            <div className="flex-1 min-w-0">
              {state.status === 'available' && (
                <>
                  <p className="text-xs font-medium text-zinc-200">Update available</p>
                  <p className="text-2xs text-zinc-500 mt-0.5">
                    Version {state.version} is downloading in the background…
                  </p>
                </>
              )}

              {state.status === 'downloading' && (
                <>
                  <p className="text-xs font-medium text-zinc-200">Downloading update</p>
                  <div className="mt-2 h-1.5 bg-surface-600 rounded-full overflow-hidden">
                    <div className="h-full bg-accent-500 rounded-full transition-all"
                      style={{ width: `${state.percent}%` }} />
                  </div>
                  <p className="text-2xs text-zinc-500 mt-1">{state.percent}%</p>
                </>
              )}

              {state.status === 'downloaded' && (
                <>
                  <p className="text-xs font-medium text-zinc-200">
                    Update ready{state.version ? ` · v${state.version}` : ''}
                  </p>
                  <p className="text-2xs text-zinc-500 mt-0.5">
                    Restart to finish installing, or it'll apply next time you quit.
                  </p>
                  <button onClick={restart}
                    className="mt-2.5 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent-500 hover:bg-accent-400 text-white text-xs font-medium transition-colors">
                    <RefreshCw size={12} /> Restart &amp; update
                  </button>
                </>
              )}

              {state.status === 'error' && (
                <>
                  <p className="text-xs font-medium text-red-300">Update failed</p>
                  <p className="text-2xs text-red-400/80 mt-0.5 max-h-20 overflow-y-auto whitespace-pre-wrap">
                    {state.error}
                  </p>
                </>
              )}
            </div>

            <button onClick={() => setDismissed(true)}
              className="shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors">
              <X size={12} />
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
