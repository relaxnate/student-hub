import React, { useEffect, useState } from 'react'
import { Minus, Square, X, Maximize2 } from 'lucide-react'
import { api } from '../../lib/ipc'
import { cn } from '../../lib/utils'

// On macOS the native traffic lights are used (titleBarStyle: 'hidden').
// On Windows/Linux this component renders custom window controls.
const isMac = navigator.userAgent.includes('Mac')

export function Titlebar() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    api.app.isMaximized().then(r => { if (r.ok) setMaximized(r.data) })
  }, [])

  if (isMac) {
    // macOS: just a slim draggable bar — native traffic lights handle the rest
    return (
      <div
        className="drag-region fixed top-0 left-0 right-0 h-10 z-50"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />
    )
  }

  return (
    <div
      className={cn(
        'surface-titlebar drag-region fixed top-0 left-0 right-0 z-50 flex items-center justify-between',
        'h-10 px-4 border-b border-white/[0.06]'
      )}
    >
      {/* App name */}
      <span className="no-drag text-xs font-medium text-zinc-500 select-none">
        Student Hub
      </span>

      {/* Window controls */}
      <div className="no-drag flex items-center gap-0.5">
        <button
          onClick={() => api.app.minimize()}
          className="w-8 h-8 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/8 transition-colors"
          aria-label="Minimize"
        >
          <Minus size={12} />
        </button>
        <button
          onClick={() => { api.app.maximize(); setMaximized(m => !m) }}
          className="w-8 h-8 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/8 transition-colors"
          aria-label={maximized ? 'Restore' : 'Maximize'}
        >
          {maximized ? <Square size={11} /> : <Maximize2 size={11} />}
        </button>
        <button
          onClick={() => api.app.close()}
          className="w-8 h-8 flex items-center justify-center rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/15 transition-colors"
          aria-label="Close"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  )
}
