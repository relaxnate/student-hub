import { useEffect, useMemo } from 'react'
import {
  createMemoryRouter, RouterProvider, Outlet, useLocation,
  UNSAFE_LocationContext, UNSAFE_NavigationContext,
} from 'react-router-dom'
import { X } from 'lucide-react'
import { PAGE_ROUTES } from '../../router'
import { useTabsStore } from '../../store/tabs.store'
import { routeTitle } from './navConfig'

// ─── Split pane (Phase 4 split-screen) ──────────────────────────────────────────
// A secondary content pane shown side-by-side with the main view. Each pane runs
// its own in-memory router seeded to its tab's route, so it navigates completely
// independently (clicking a course in one pane doesn't affect the others). Global
// zustand stores + IPC are shared, so data stays consistent across panes.

function PaneLayout({ tabId }: { tabId: string }) {
  const location       = useLocation()
  const updateTabRoute = useTabsStore(s => s.updateTabRoute)
  const unsplitTab     = useTabsStore(s => s.unsplitTab)
  const title          = routeTitle(location.pathname)

  // Persist this pane's own navigation back onto its tab (survives restart/merge).
  useEffect(() => {
    updateTabRoute(tabId, location.pathname, title)
  }, [location.pathname])

  return (
    <div className="flex flex-col h-full min-w-0">
      <div className="surface-tabs flex items-center gap-2 h-8 px-2.5 border-b border-white/[0.06] shrink-0">
        <span className="flex-1 truncate text-[12px] font-medium text-zinc-300">{title}</span>
        <button
          onClick={() => unsplitTab(tabId)}
          title="Close split · return to tab bar"
          className="shrink-0 flex items-center justify-center w-5 h-5 rounded text-zinc-500 hover:bg-surface-700 hover:text-zinc-200 transition-colors"
        >
          <X size={12} />
        </button>
      </div>
      <div className="flex-1 overflow-hidden relative">
        <Outlet />
      </div>
    </div>
  )
}

export function SplitPane({ tabId }: { tabId: string }) {
  const initialRoute = useTabsStore(s => s.tabs.find(t => t.id === tabId)?.route) ?? '/dashboard'

  // Created once per pane (stable on tabId) so in-pane navigation history is kept;
  // initialRoute is only used at creation time.
  const router = useMemo(
    () => createMemoryRouter(
      [{ path: '/', element: <PaneLayout tabId={tabId} />, children: PAGE_ROUTES }],
      { initialEntries: [initialRoute] },
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabId],
  )

  // React Router forbids a <Router> inside another <Router>. Each split pane is
  // an independent router, so we null out the parent's Location/Navigation
  // contexts first — this is the supported way to run a second, isolated router
  // in the same React tree (the pane's own RouterProvider re-establishes them).
  return (
    <div className="flex-1 min-w-0 border-l border-white/[0.07] overflow-hidden">
      <UNSAFE_LocationContext.Provider value={null as never}>
        <UNSAFE_NavigationContext.Provider value={null as never}>
          <RouterProvider router={router} />
        </UNSAFE_NavigationContext.Provider>
      </UNSAFE_LocationContext.Provider>
    </div>
  )
}
