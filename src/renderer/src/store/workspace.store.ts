import { create } from 'zustand'
import { api } from '../lib/ipc'
import type {
  WorkspaceProfile, WidgetConfig, SidebarItemConfig, SidebarSection, PagePreferences,
  NavItemId, DashboardView,
} from '@shared/types/ipc'

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_PAGE_PREFS: PagePreferences = {
  coursesLayout:     'cards',
  coursesSortBy:     'name',
  assignmentsLayout: 'list',
  assignmentsSortBy: 'due-date',
  modulesLayout:     'lms',
  gradesLayout:      'overview',
}

export const DEFAULT_SIDEBAR_ITEMS: SidebarItemConfig[] = [
  { id: 'dashboard',        label: 'Dashboard',        visible: true,  order: 0, sectionId: null },
  { id: 'courses',          label: 'Courses',           visible: true,  order: 1, sectionId: null },
  { id: 'modules',          label: 'Modules',           visible: true,  order: 2, sectionId: null },
  { id: 'assignments',      label: 'Assignments',       visible: true,  order: 3, sectionId: null },
  { id: 'grades',           label: 'Grades',            visible: true,  order: 4, sectionId: null },
  { id: 'grade-calculator', label: 'Grade & GPA Calc.', visible: true,  order: 5, sectionId: null },
  { id: 'grade-rescue',     label: 'Grade Rescue',      visible: true,  order: 6, sectionId: null },
  { id: 'simulator',        label: 'Simulator',         visible: true,  order: 7, sectionId: null },
  { id: 'calendar',         label: 'Calendar',          visible: true,  order: 8, sectionId: null },
  { id: 'files',            label: 'Files',             visible: true,  order: 9, sectionId: null },
  { id: 'history',         label: 'History',           visible: true,  order: 10, sectionId: null },
]

export const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: 'w-stats',   type: 'stats',        size: 'full',   visible: true,  collapsed: false, pinned: false, order: 0 },
  { id: 'w-overdue', type: 'overdue',      size: 'medium', visible: true,  collapsed: false, pinned: false, order: 1 },
  { id: 'w-upcoming',type: 'upcoming',     size: 'medium', visible: true,  collapsed: false, pinned: false, order: 2 },
  { id: 'w-courses', type: 'courses',      size: 'full',   visible: true,  collapsed: false, pinned: false, order: 3 },
  { id: 'w-grades',  type: 'grades',       size: 'medium', visible: true,  collapsed: false, pinned: false, order: 4 },
  { id: 'w-rescue',  type: 'grade-rescue', size: 'medium', visible: false, collapsed: false, pinned: false, order: 5 },
  { id: 'w-cal',     type: 'calendar',     size: 'medium', visible: false, collapsed: false, pinned: false, order: 6 },
  { id: 'w-gpa',     type: 'gpa',          size: 'small',  visible: false, collapsed: false, pinned: false, order: 7 },
]

export const DEFAULT_WORKSPACE: WorkspaceProfile = {
  id:              'default',
  name:            'Default',
  icon:            '📚',
  widgets:         DEFAULT_WIDGETS,
  sidebarItems:    DEFAULT_SIDEBAR_ITEMS,
  sidebarSections: [],
  pagePrefs:       DEFAULT_PAGE_PREFS,
  dashboardShowHistoryCourses: false,
  dashboardView:   'focused',
  createdAt:       Date.now(),
  updatedAt:       Date.now(),
}

// Fill in any missing widget IDs that were added after the profile was created.
function mergeWidgets(stored: WidgetConfig[]): WidgetConfig[] {
  const byId = new Map(stored.map(w => [w.id, w]))
  const merged = DEFAULT_WIDGETS.map(d => byId.get(d.id) ?? { ...d, visible: false })
  // Preserve order of stored widgets; append new ones at the end.
  const known = new Set(DEFAULT_WIDGETS.map(d => d.id))
  const extras = stored.filter(w => !known.has(w.id))
  return [...merged, ...extras]
}

function mergeSidebarItems(stored: SidebarItemConfig[]): SidebarItemConfig[] {
  const byId = new Map(stored.map(i => [i.id, i]))
  return DEFAULT_SIDEBAR_ITEMS.map(d => byId.get(d.id as NavItemId) ?? d)
}

function normalizeProfile(p: WorkspaceProfile): WorkspaceProfile {
  return {
    ...DEFAULT_WORKSPACE,
    ...p,
    widgets:         mergeWidgets(p.widgets ?? []),
    sidebarItems:    mergeSidebarItems(p.sidebarItems ?? []),
    sidebarSections: p.sidebarSections ?? [],
    pagePrefs:       { ...DEFAULT_PAGE_PREFS, ...(p.pagePrefs ?? {}) },
  }
}

// ─── Store interface ───────────────────────────────────────────────────────────

interface WorkspaceStoreState {
  profiles:   WorkspaceProfile[]
  activeId:   string
  ready:      boolean

  // Derived
  active: () => WorkspaceProfile

  // Lifecycle
  initialize:    () => Promise<void>

  // Workspace CRUD
  setActive:       (id: string) => void
  createWorkspace: (name: string, icon: string) => WorkspaceProfile
  renameWorkspace: (id: string, name: string, icon: string) => void
  duplicateWorkspace:(id: string) => WorkspaceProfile
  deleteWorkspace: (id: string) => void

  // Widget updates
  updateWidgets:   (widgets: WidgetConfig[]) => void
  updateWidget:    (id: string, patch: Partial<WidgetConfig>) => void

  // Sidebar updates
  updateSidebarItems:   (items: SidebarItemConfig[]) => void
  updateSidebarSections:(sections: SidebarSection[]) => void

  // Page prefs
  updatePagePrefs: (patch: Partial<PagePreferences>) => void

  // Dashboard history toggle (per-workspace, independent of global setting)
  setDashboardShowHistory: (v: boolean) => void

  // Dashboard surface: focused fixed layout vs. customizable widget canvas
  setDashboardView: (v: DashboardView) => void
}

// ─── Store ─────────────────────────────────────────────────────────────────────

export const useWorkspaceStore = create<WorkspaceStoreState>((set, get) => {

  const persist = async () => {
    const { profiles, activeId } = get()
    await api.app.setPreferences({
      workspaceProfiles: profiles,
      workspaceActiveId: activeId,
    } as never)
  }

  const patchActive = (patcher: (p: WorkspaceProfile) => WorkspaceProfile) => {
    set(state => ({
      profiles: state.profiles.map(p =>
        p.id === state.activeId ? patcher({ ...p, updatedAt: Date.now() }) : p
      ),
    }))
    persist()
  }

  return {
    profiles: [DEFAULT_WORKSPACE],
    activeId: DEFAULT_WORKSPACE.id,
    ready:    false,

    active: () => {
      const { profiles, activeId } = get()
      return profiles.find(p => p.id === activeId) ?? profiles[0] ?? DEFAULT_WORKSPACE
    },

    initialize: async () => {
      const r = await api.app.getPreferences()
      if (!r.ok) { set({ ready: true }); return }
      const stored = r.data as Record<string, unknown>

      const rawProfiles = (stored.workspaceProfiles as WorkspaceProfile[] | undefined) ?? []
      const profiles = rawProfiles.length
        ? rawProfiles.map(normalizeProfile)
        : [DEFAULT_WORKSPACE]
      const activeId = (stored.workspaceActiveId as string | undefined)
        ?? profiles[0].id

      set({ profiles, activeId: profiles.some(p => p.id === activeId) ? activeId : profiles[0].id, ready: true })
    },

    setActive: (id) => {
      set({ activeId: id })
      persist()
    },

    createWorkspace: (name, icon) => {
      const now = Date.now()
      const nw: WorkspaceProfile = normalizeProfile({
        ...DEFAULT_WORKSPACE,
        id:        `ws-${now}`,
        name,
        icon,
        createdAt: now,
        updatedAt: now,
      })
      set(s => ({ profiles: [...s.profiles, nw] }))
      persist()
      return nw
    },

    renameWorkspace: (id, name, icon) => {
      set(s => ({
        profiles: s.profiles.map(p =>
          p.id === id ? { ...p, name, icon, updatedAt: Date.now() } : p
        ),
      }))
      persist()
    },

    duplicateWorkspace: (id) => {
      const src = get().profiles.find(p => p.id === id) ?? DEFAULT_WORKSPACE
      const now = Date.now()
      const dup: WorkspaceProfile = {
        ...src,
        id:        `ws-${now}`,
        name:      `${src.name} (copy)`,
        createdAt: now,
        updatedAt: now,
      }
      set(s => ({ profiles: [...s.profiles, dup] }))
      persist()
      return dup
    },

    deleteWorkspace: (id) => {
      const { profiles, activeId } = get()
      if (profiles.length <= 1) return  // keep at least one
      const next = profiles.filter(p => p.id !== id)
      const nextActive = activeId === id ? next[0].id : activeId
      set({ profiles: next, activeId: nextActive })
      persist()
    },

    updateWidgets: (widgets) => {
      patchActive(p => ({ ...p, widgets }))
    },

    updateWidget: (id, patch) => {
      patchActive(p => ({
        ...p,
        widgets: p.widgets.map(w => w.id === id ? { ...w, ...patch } : w),
      }))
    },

    updateSidebarItems: (items) => {
      patchActive(p => ({ ...p, sidebarItems: items }))
    },

    updateSidebarSections: (sections) => {
      patchActive(p => ({ ...p, sidebarSections: sections }))
    },

    updatePagePrefs: (patch) => {
      patchActive(p => ({ ...p, pagePrefs: { ...p.pagePrefs, ...patch } }))
    },

    setDashboardView: (v) => {
      patchActive(p => ({ ...p, dashboardView: v }))
    },

    setDashboardShowHistory: (v) => {
      patchActive(p => ({ ...p, dashboardShowHistoryCourses: v }))
    },
  }
})
