import { useEffect, useState } from 'react'

// Reads the active UI mode from the root data-ui attribute and stays reactive to
// live changes (the Legacy UI toggle dispatches 'sh-ui-mode-change'). Used by
// components that render a different structure in Legacy vs the Phase-2 redesign.

export type UiMode = 'new' | 'legacy'

function read(): UiMode {
  return document.documentElement.dataset.ui === 'legacy' ? 'legacy' : 'new'
}

export function useUiMode(): UiMode {
  const [mode, setMode] = useState<UiMode>(read)
  useEffect(() => {
    const handler = () => setMode(read())
    window.addEventListener('sh-ui-mode-change', handler)
    return () => window.removeEventListener('sh-ui-mode-change', handler)
  }, [])
  return mode
}
