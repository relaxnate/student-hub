import { ipcMain, app, shell, BrowserWindow, nativeTheme, dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import { IPC } from '@shared/ipc-channels'
import { OAuthManager } from '../services/auth/OAuthManager'
import { registerAuthHandlers } from './auth.handlers'
import { registerDataHandlers } from './courses.handlers'
import { registerSyncHandlers } from './sync.handlers'
import { registerObsidianHandlers, registerDownloadHandlers } from './obsidian.handlers'
import { registerGradeRescueHandlers } from './gradeRescue.handlers'
import { registerExportHandlers } from './export.handlers'
import { getDb } from '../database'
import type { AppPreferences } from '@shared/types/ipc'

const DEFAULT_PREFERENCES: AppPreferences = {
  theme:                    'dark',
  obsidianVaultPath:        null,
  notificationsEnabled:     true,
  notificationAdvanceHours: 48,
  syncIntervalMinutes:      60,
  launchAtStartup:          false,
  customBackground:         null,
  backgroundOpacity:        30,
  showHistoryCourses:       false,
  appearance: {
    themeMode:          'dark',
    accentPrimary:      '',
    accentSecondary:    '#6366f1',
    cornerStyle:        'rounded',
    fontFamily:         'sans',
    fontScale:          1,
    uiScale:            1,
    statusSuccess:      '',
    statusWarning:      '',
    statusError:        '',
    statusNotification: '',
    contrast:           'normal',
    reduceTransparency: false,
    colorblind:         'none',
    lineSpacing:        'normal',
    motionLevel:        'standard',
    disableAnimations:  false,
    sidebarMode:        'standard',
    density:            'balanced',
    effectsPreset:      'balanced',
    dashboardPanels: [
      { id: 'stats',    visible: true, order: 0 },
      { id: 'overdue',  visible: true, order: 1 },
      { id: 'upcoming', visible: true, order: 2 },
      { id: 'courses',  visible: true, order: 3 },
      { id: 'grades',   visible: true, order: 4 },
    ],
    workspaceMode:      'default',
    workspaceProfiles:  [],
    workspaceActiveId:  'default',
    background: {
      type:           'none',
      image:          null,
      color:          '#0e0e14',
      gradientFrom:   '#1e175a',
      gradientTo:     '#0e0e14',
      gradientAngle:  135,
      scaling:        'fill',
      blur:           0,
      brightness:     100,
      contrast:       100,
      saturation:     100,
      opacity:        100,
      overlayOpacity: 30,
      adaptiveReadability: true,
    },
  },
}

export function registerAllHandlers(oauthManager: OAuthManager): void {
  registerAuthHandlers(oauthManager)
  registerDataHandlers()
  registerSyncHandlers(oauthManager)
  registerObsidianHandlers()
  registerDownloadHandlers()
  registerGradeRescueHandlers()
  registerExportHandlers()

  // ─── App / Window ─────────────────────────────────────────────────────
  ipcMain.handle(IPC.APP.GET_VERSION, () => ({ ok: true, data: app.getVersion() }))

  ipcMain.handle(IPC.APP.OPEN_EXTERNAL, async (_e, url: string) => {
    await shell.openExternal(url)
    return { ok: true, data: null }
  })

  ipcMain.on(IPC.APP.MINIMIZE_WINDOW, e => { BrowserWindow.fromWebContents(e.sender)?.minimize() })
  ipcMain.on(IPC.APP.MAXIMIZE_WINDOW, e => {
    const w = BrowserWindow.fromWebContents(e.sender)
    w?.isMaximized() ? w.unmaximize() : w?.maximize()
  })
  ipcMain.on(IPC.APP.CLOSE_WINDOW, e => { BrowserWindow.fromWebContents(e.sender)?.close() })
  ipcMain.handle(IPC.APP.IS_MAXIMIZED, e => ({
    ok: true, data: BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false,
  }))

  // ─── Background image picker ───────────────────────────────────────────
  ipcMain.handle(IPC.APP.CHOOSE_BACKGROUND_IMAGE, async event => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win!, {
      title: 'Choose background image',
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths[0]) return { ok: true, data: null }

    const filePath = result.filePaths[0]
    const stat     = fs.statSync(filePath)
    // Warn if > 3 MB — still encode but user should use smaller images
    const ext      = path.extname(filePath).slice(1).toLowerCase()
    const mime     = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif'
      : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    const b64 = fs.readFileSync(filePath).toString('base64')
    return { ok: true, data: `data:${mime};base64,${b64}` }
  })

  // ─── Vault path picker ─────────────────────────────────────────────────
  ipcMain.handle(IPC.APP.CHOOSE_VAULT_PATH, async event => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win!, {
      title: 'Select Obsidian vault folder',
      properties: ['openDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return { ok: true, data: null }
    return { ok: true, data: result.filePaths[0] }
  })

  // ─── Preferences ──────────────────────────────────────────────────────
  ipcMain.handle(IPC.APP.GET_PREFERENCES, () => {
    try {
      const rows = getDb().prepare(`SELECT key, value FROM preferences`).all() as
        { key: string; value: string }[]
      const stored = Object.fromEntries(rows.map(r => {
        try { return [r.key, JSON.parse(r.value)] } catch { return [r.key, r.value] }
      }))
      return { ok: true, data: { ...DEFAULT_PREFERENCES, ...stored } }
    } catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.APP.SET_PREFERENCES, (_e, patch: Partial<AppPreferences>) => {
    try {
      const db = getDb()
      const upsert = db.prepare(`
        INSERT INTO preferences (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `)
      db.transaction(() => {
        for (const [key, value] of Object.entries(patch)) upsert.run(key, JSON.stringify(value))
      })()
      if (patch.theme) {
        nativeTheme.themeSource = patch.theme === 'system' ? 'system'
          : patch.theme as 'light' | 'dark'
      }
      return { ok: true, data: null }
    } catch (err) { return { ok: false, error: String(err) } }
  })
}
