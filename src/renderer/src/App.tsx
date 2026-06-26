import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { router } from './router'
import { useAppStore } from './store/app.store'
import { useSyncStore } from './store/sync.store'
import { api } from './lib/ipc'
import { applyAppearance, watchSystemTheme, framerReducedMotion, DEFAULT_APPEARANCE } from './lib/appearance'
import { ColorblindFilters } from './components/ui/ColorblindFilters'
import { TooltipProvider } from './components/ui/Tooltip'
import { useWorkspaceStore } from './store/workspace.store'
import { useTabsStore } from './store/tabs.store'
import type { SyncProgress } from '@shared/types/ipc'

function AppBootstrap() {
  const initialize   = useAppStore(s => s.initialize)
  const integrations = useAppStore(s => s.integrations)
  const isReady      = useAppStore(s => s.isReady)
  const preferences  = useAppStore(s => s.preferences)
  const setIsSyncing = useAppStore(s => s.setIsSyncing)
  const { setProgress, setError, clearProgress } = useSyncStore()

  const initWorkspace = useWorkspaceStore(s => s.initialize)
  const initTabs      = useTabsStore(s => s.initialize)
  useEffect(() => {
    initialize()
    initWorkspace()
    initTabs()
    // Phase-2 design is the default (data-ui="new"); Legacy UI swaps token sets.
    // Read the stored preference so the right token set is active before paint.
    const legacy = localStorage.getItem('sh.legacy-ui') === '1'
    document.documentElement.dataset.ui = legacy ? 'legacy' : 'new'
  }, [])

  useEffect(() => {
    const appearance = preferences?.appearance
    if (!appearance) return
    applyAppearance(appearance)
    if (appearance.themeMode === 'system') {
      return watchSystemTheme(() => applyAppearance(appearance))
    }
  }, [preferences?.appearance])

  useEffect(() => {
    const offProgress = api.sync.onProgress((p: SyncProgress) => { setProgress(p); setIsSyncing(true) })
    const offComplete = api.sync.onComplete(({ integrationId }: { integrationId: string }) => { clearProgress(integrationId); setIsSyncing(false) })
    const offError    = api.sync.onError(({ integrationId, error }: { integrationId: string; error: string }) => { setError(integrationId, error); clearProgress(integrationId); setIsSyncing(false) })
    return () => { offProgress(); offComplete(); offError() }
  }, [])

  // A clicked OS notification (e.g. a reminder) asks the app to navigate.
  useEffect(() => {
    return api.notifications.onNavigate(({ route }: { route: string }) => {
      router.navigate(route)
    })
  }, [])

  useEffect(() => {
    if (!isReady) return
    const hash = window.location.hash
    if (integrations.length === 0) {
      router.navigate('/welcome', { replace: true })
    } else if (hash === '#/' || hash === '' || hash === '#/welcome') {
      router.navigate('/dashboard', { replace: true })
    }
  }, [isReady, integrations.length])

  return null
}

export default function App() {
  const appearance = useAppStore(s => s.preferences?.appearance) ?? DEFAULT_APPEARANCE

  return (
    <MotionConfig reducedMotion={framerReducedMotion(appearance)}>
      <TooltipProvider delayDuration={400} skipDelayDuration={300}>
        <ColorblindFilters />
        <AppBootstrap />
        <RouterProvider router={router} />
      </TooltipProvider>
    </MotionConfig>
  )
}
