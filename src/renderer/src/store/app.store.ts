import { create } from 'zustand'
import type { Integration } from '@shared/types/entities'
import type { AppPreferences, AppearanceSettings } from '@shared/types/ipc'
import { api } from '../lib/ipc'
import { applyAppearance, normalizeAppearance, DEFAULT_APPEARANCE } from '../lib/appearance'

interface AppState {
  isReady:      boolean
  integrations: Integration[]
  preferences:  AppPreferences | null
  isSyncing:    boolean
  initialize:        () => Promise<void>
  addIntegration:    (i: Integration) => void
  removeIntegration: (id: string) => void
  setPreferences:    (patch: Partial<AppPreferences>) => Promise<void>
  setAppearance:     (patch: Partial<AppearanceSettings>) => Promise<void>
  setIsSyncing:      (v: boolean) => void
}

const DEFAULT_PREFS: AppPreferences = {
  theme:                    'dark',
  obsidianVaultPath:        null,
  notificationsEnabled:     true,
  notificationAdvanceHours: 48,
  syncIntervalMinutes:      60,
  launchAtStartup:          false,
  customBackground:         null,
  backgroundOpacity:        30,
  showHistoryCourses:       false,
  appearance:               DEFAULT_APPEARANCE,
}

export const useAppStore = create<AppState>((set, get) => ({
  isReady:      false,
  integrations: [],
  preferences:  null,
  isSyncing:    false,

  initialize: async () => {
    const [intResult, prefResult] = await Promise.all([
      api.auth.getIntegrations(),
      api.app.getPreferences(),
    ])
    const stored = prefResult.ok ? prefResult.data : DEFAULT_PREFS
    // Deep-merge appearance so older saves (missing fields added in later
    // phases) fall back to defaults rather than wiping the whole object.
    const appearance = normalizeAppearance(stored.appearance)

    // One-time migration: carry a legacy top-level customBackground into the
    // new background system if the user hasn't configured one yet.
    if (appearance.background.type === 'none' && !appearance.background.image && stored.customBackground) {
      appearance.background = {
        ...appearance.background,
        type:    'image',
        image:   stored.customBackground,
        opacity: stored.backgroundOpacity ?? 100,
      }
    }

    const prefs: AppPreferences = { ...DEFAULT_PREFS, ...stored, appearance }

    // Apply the full visual identity immediately on startup.
    applyAppearance(appearance)

    set({
      integrations: intResult.ok ? intResult.data : [],
      preferences:  prefs,
      isReady:      true,
    })
  },

  addIntegration: integration =>
    set(s => ({ integrations: [...s.integrations.filter(i => i.id !== integration.id), integration] })),

  removeIntegration: id =>
    set(s => ({ integrations: s.integrations.filter(i => i.id !== id) })),

  setPreferences: async patch => {
    const result = await api.app.setPreferences(patch)
    if (result.ok) {
      const next = { ...(get().preferences ?? DEFAULT_PREFS), ...patch }
      set({ preferences: next })
      if (patch.appearance) applyAppearance(next.appearance)
    }
  },

  setAppearance: async patch => {
    const current = get().preferences?.appearance ?? DEFAULT_APPEARANCE
    const appearance = normalizeAppearance({ ...current, ...patch })

    // Mirror the theme to the legacy `theme` pref so the main process keeps
    // nativeTheme in sync (OLED maps to dark for the OS chrome).
    const theme: AppPreferences['theme'] =
      appearance.themeMode === 'oled' ? 'dark' : appearance.themeMode

    // Apply instantly for a snappy feel, then persist.
    applyAppearance(appearance)

    const result = await api.app.setPreferences({ appearance, theme })
    if (result.ok) {
      const next = { ...(get().preferences ?? DEFAULT_PREFS), appearance, theme }
      set({ preferences: next })
    }
  },

  setIsSyncing: v => set({ isSyncing: v }),
}))
