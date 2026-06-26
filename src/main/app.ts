import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createWindow, getMainWindow } from './window'
import { initDb, closeDb } from './database'
import { registerAllHandlers } from './ipc'
import { registerAdapter, createAdapter } from './integrations/registry'
import { TokenStore } from './services/auth/TokenStore'
import { OAuthManager } from './services/auth/OAuthManager'
import { BackgroundSyncScheduler } from './services/sync/BackgroundSyncScheduler'
import { NotificationService } from './services/notifications/NotificationService'
import { UpdaterService } from './services/updater/UpdaterService'
import { getDb } from './database'
import type { IntegrationProvider } from '@shared/types/entities'
import type { AppPreferences } from '@shared/types/ipc'
import { logCrash, logDebug } from './crash-logger'

const scheduler      = new BackgroundSyncScheduler()
const notifications  = new NotificationService()
const oauthManager   = new OAuthManager()
const updater        = new UpdaterService()

// ─── Single instance lock ─────────────────────────────────────────────────────
// This is an EXPECTED, normal exit path (not a crash) whenever the app is
// already running and gets launched a second time — Electron's convention is
// for the second instance to quit silently and let the first instance take
// focus instead. We still log it (no dialog) purely so that if this ever
// turns out to be misfiring against a stale/zombie lock, there's a record of
// it rather than another silent "nothing happened".
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  logDebug('Another instance already holds the single-instance lock — quitting silently. This is expected if Student Hub is already running.')
  app.quit()
  process.exit(0)
}

app.on('second-instance', (_event, argv) => {
  const win = getMainWindow()
  if (win) { if (win.isMinimized()) win.restore(); win.focus() }
  const deepLink = argv.find(arg => arg.startsWith('student-hub://'))
  if (deepLink) handleDeepLink(deepLink)
})

// ─── Custom protocol ──────────────────────────────────────────────────────────

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('student-hub', process.execPath, [process.argv[1]])
  }
} else {
  app.setAsDefaultProtocolClient('student-hub')
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
// Everything inside the whenReady callback is wrapped in try/catch, and the
// promise chain ends in .catch(), so a synchronous failure anywhere in here
// (e.g. better-sqlite3's native binding failing to load inside initDb() —
// which only happens lazily on the first `new Database(...)` call, i.e.
// right here, not at import time) is guaranteed to be reported via
// logCrash() instead of becoming an invisible unhandled promise rejection.

app.whenReady().then(() => {
  try {
    electronApp.setAppUserModelId('com.studenthub.app')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    initDb()
    restoreAdapters()
    registerAllHandlers(oauthManager, notifications)  // pass the shared instances

    const win = createWindow()

    // Wire the auto-updater to this window. Handlers register once; the window
    // reference is (re)bound here so events always reach a live window. Safe to
    // call again on macOS 'activate' when a new window is created.
    updater.attach(win)

    // Start background services after window is shown so startup feels fast
    win.once('ready-to-show', () => {
      try {
        const prefs = loadPreferences()
        if (prefs.notificationsEnabled) notifications.start(prefs)
        scheduler.start(prefs.syncIntervalMinutes, oauthManager, win)

        // Focus-sync: when the user returns to the window after being away,
        // refresh in the background if the data is stale (guarded internally).
        win.on('focus', () => {
          scheduler.syncOnFocus(oauthManager, win).catch(err =>
            logDebug(`Focus-sync failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`))
        })
      } catch (err) {
        // Non-fatal — the window is already showing at this point, so this
        // is a background-feature failure, not a startup failure. Log only.
        logDebug(`Failed to start background services (window already shown, app remains usable): ${err instanceof Error ? err.stack ?? err.message : String(err)}`)
      }
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) updater.attach(createWindow())
    })

    app.on('open-url', (_event, url) => handleDeepLink(url))
  } catch (err) {
    logCrash('Failed during app startup', err)
  }
}).catch(err => {
  logCrash('app.whenReady() rejected', err)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    scheduler.stop()
    notifications.stop()
    closeDb()
    app.quit()
  }
})

app.on('will-quit', () => {
  scheduler.stop()
  notifications.stop()
  closeDb()
})

// ─── Deep link handler ────────────────────────────────────────────────────────

function handleDeepLink(url: string): void {
  console.log(`[DeepLink] ${url}`)
  oauthManager.handleCallback(url).catch(err => {
    console.error('[DeepLink] OAuth callback failed:', err)
  })
}

// ─── Restore saved integrations ───────────────────────────────────────────────

function restoreAdapters(): void {
  try {
    const db   = getDb()
    const rows = db.prepare(`
      SELECT id, provider, base_url FROM integrations WHERE is_active = 1
    `).all() as { id: string; provider: IntegrationProvider; base_url: string | null }[]

    const tokenStore = new TokenStore()

    for (const row of rows) {
      const stored   = tokenStore.load(row.id)
      if (!stored) continue
      const clientId = getClientIdForProvider(row.provider)
      if (!clientId) continue

      try {
        const adapter = createAdapter(row.provider, row.base_url ?? '', clientId)
        adapter.setTokens(stored.accessToken, stored.refreshToken, stored.expiresAt)
        registerAdapter(row.id, adapter)
        console.log(`[Startup] Restored adapter: ${row.id}`)
      } catch (err) {
        console.error(`[Startup] Failed to restore adapter ${row.id}:`, err)
      }
    }
  } catch (err) {
    console.error('[Startup] Failed to restore adapters:', err)
  }
}

function getClientIdForProvider(provider: IntegrationProvider): string | undefined {
  const map: Record<string, string | undefined> = {
    'canvas':             process.env.CANVAS_CLIENT_ID,
    'google-classroom':   process.env.GOOGLE_CLIENT_ID,
    'google-calendar':    process.env.GOOGLE_CLIENT_ID,
    'microsoft-teams':    process.env.MICROSOFT_CLIENT_ID,
    'outlook-calendar':   process.env.MICROSOFT_CLIENT_ID,
  }
  return map[provider]
}

function loadPreferences(): AppPreferences {
  const defaults: AppPreferences = {
    theme: 'dark', obsidianVaultPath: null, notificationsEnabled: true,
    notificationAdvanceHours: 48, syncIntervalMinutes: 60, launchAtStartup: false,
    customBackground: null, backgroundOpacity: 30,
  }
  try {
    const db   = getDb()
    const rows = db.prepare(`SELECT key, value FROM preferences`).all() as { key: string; value: string }[]
    const stored = Object.fromEntries(rows.map(r => {
      try { return [r.key, JSON.parse(r.value)] } catch { return [r.key, r.value] }
    }))
    return { ...defaults, ...stored }
  } catch {
    return defaults
  }
}
