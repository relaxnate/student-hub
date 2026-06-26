import { create } from 'zustand'
import { api } from '../lib/ipc'
import type { AppTab } from '@shared/types/ipc'

// ─── Browser-style tabs (Phase 4) ───────────────────────────────────────────────
// Session/UI state persisted via app preferences (keys `tabs` / `activeTabId`),
// mirroring the workspace store — no DB table. The TabBar keeps the active tab's
// route in sync with the router; switching tabs navigates to the stored route.

let nextId = 1
const newId = () => `tab-${Date.now()}-${nextId++}`

// Max secondary split panes (main pane + up to 3 = 4 panes total, per request).
export const MAX_SPLIT_PANES = 3

interface TabsState {
  tabs:        AppTab[]
  activeTabId: string | null
  /** Tabs pulled out of the main strip into their own side-by-side panes. */
  splitTabIds: string[]
  ready:       boolean

  initialize:    () => Promise<void>
  /** Ensure there is at least one tab showing the given route (first paint). */
  ensureSeed:    (route: string, title: string) => void
  /** Open a new tab and make it active. */
  openTab:       (route: string, title: string) => void
  setActive:     (id: string) => void
  closeTab:      (id: string) => string | null   // returns the route to navigate to, if any
  reorder:       (tabs: AppTab[]) => void
  /** Update the active tab to reflect a navigation (route + title). */
  syncActiveRoute: (route: string, title: string) => void

  // Split-screen
  /** Pull a tab out of the main strip into its own pane (side-by-side). */
  splitTab:      (id: string) => void
  /** Return a split pane's tab to the main strip. */
  unsplitTab:    (id: string) => void
  /** Update a specific tab's route/title (used by independently-navigated panes). */
  updateTabRoute:(id: string, route: string, title: string) => void
}

export const useTabsStore = create<TabsState>((set, get) => {
  const persist = () => {
    const { tabs, activeTabId, splitTabIds } = get()
    api.app.setPreferences({ tabs, activeTabId, splitTabIds } as never)
  }

  return {
    tabs:        [],
    activeTabId: null,
    splitTabIds: [],
    ready:       false,

    initialize: async () => {
      const r = await api.app.getPreferences()
      if (!r.ok) { set({ ready: true }); return }
      const stored = r.data as Record<string, unknown>
      const tabs = (stored.tabs as AppTab[] | undefined) ?? []
      const activeTabId = (stored.activeTabId as string | undefined) ?? (tabs[0]?.id ?? null)
      const tabIds = new Set(tabs.map(t => t.id))
      const splitTabIds = ((stored.splitTabIds as string[] | undefined) ?? [])
        .filter(id => tabIds.has(id)).slice(0, MAX_SPLIT_PANES)
      // Don't let a split tab also be the main-active one.
      const mainTabs = tabs.filter(t => !splitTabIds.includes(t.id))
      set({
        tabs,
        splitTabIds,
        activeTabId: mainTabs.some(t => t.id === activeTabId) ? activeTabId : (mainTabs[0]?.id ?? null),
        ready: true,
      })
    },

    ensureSeed: (route, title) => {
      const { tabs } = get()
      if (tabs.length) return
      const tab: AppTab = { id: newId(), route, title }
      set({ tabs: [tab], activeTabId: tab.id })
      persist()
    },

    openTab: (route, title) => {
      const tab: AppTab = { id: newId(), route, title }
      set(s => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
      persist()
    },

    setActive: (id) => {
      set({ activeTabId: id })
      persist()
    },

    closeTab: (id) => {
      const { tabs, activeTabId, splitTabIds } = get()
      const idx = tabs.findIndex(t => t.id === id)
      if (idx === -1) return null
      const next = tabs.filter(t => t.id !== id)
      const nextSplit = splitTabIds.filter(s => s !== id)
      // Closing the main-active tab → activate a neighbour among the MAIN tabs.
      let nextActive = activeTabId
      let navRoute: string | null = null
      if (activeTabId === id) {
        const mainTabs = next.filter(t => !nextSplit.includes(t.id))
        const neighbour = mainTabs[idx - 1] ?? mainTabs[idx] ?? mainTabs[0] ?? null
        nextActive = neighbour?.id ?? null
        navRoute = neighbour?.route ?? null
      }
      set({ tabs: next, splitTabIds: nextSplit, activeTabId: nextActive })
      persist()
      return navRoute
    },

    reorder: (tabs) => {
      set({ tabs })
      persist()
    },

    syncActiveRoute: (route, title) => {
      const { tabs, activeTabId } = get()
      if (!activeTabId) return
      const active = tabs.find(t => t.id === activeTabId)
      if (!active || active.route === route) return  // no-op if unchanged
      set({
        tabs: tabs.map(t => t.id === activeTabId ? { ...t, route, title } : t),
      })
      persist()
    },

    splitTab: (id) => {
      const { tabs, activeTabId, splitTabIds } = get()
      if (splitTabIds.includes(id)) return
      if (splitTabIds.length >= MAX_SPLIT_PANES) return
      // Keep at least one tab in the main strip.
      const mainCount = tabs.filter(t => !splitTabIds.includes(t.id)).length
      if (mainCount <= 1) return
      const nextSplit = [...splitTabIds, id]
      // If the split tab was main-active, move main focus to another main tab.
      let nextActive = activeTabId
      if (activeTabId === id) {
        const main = tabs.find(t => !nextSplit.includes(t.id))
        nextActive = main?.id ?? null
      }
      set({ splitTabIds: nextSplit, activeTabId: nextActive })
      persist()
    },

    unsplitTab: (id) => {
      set(s => ({ splitTabIds: s.splitTabIds.filter(x => x !== id) }))
      persist()
    },

    updateTabRoute: (id, route, title) => {
      const { tabs } = get()
      const t = tabs.find(x => x.id === id)
      if (!t || t.route === route) return
      set({ tabs: tabs.map(x => x.id === id ? { ...x, route, title } : x) })
      persist()
    },
  }
})
