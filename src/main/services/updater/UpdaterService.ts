import { app, ipcMain, BrowserWindow, dialog } from 'electron'
import electronUpdater, { type AppUpdater, type UpdateInfo, type ProgressInfo } from 'electron-updater'
import { IPC } from '@shared/ipc-channels'
import type { UpdateState } from '@shared/types/ipc'
import { logDebug } from '../../crash-logger'

// electron-updater is CommonJS; the documented-safe interop is to take the
// default export and destructure `autoUpdater` from it, rather than relying on
// a named ESM import (which can resolve to undefined under some bundlers).
function getAutoUpdater(): AppUpdater {
  const { autoUpdater } = electronUpdater
  return autoUpdater
}

function notesToString(notes: UpdateInfo['releaseNotes']): string | null {
  if (!notes) return null
  if (typeof notes === 'string') return notes
  // releaseNotes can be an array of { version, note } across multiple releases
  return notes.map(n => n.note ?? '').filter(Boolean).join('\n\n') || null
}

/**
 * Wraps electron-updater into a single, IPC-driven service.
 *
 * Behaviour:
 *  - Auto-checks on launch and every 6h (packaged builds only).
 *  - Auto-downloads in the background once an update is found.
 *  - When downloaded, the renderer shows a "Restart to update" toast.
 *  - If the user dismisses it, the update installs automatically on next quit
 *    (autoInstallOnAppQuit), so they're never stuck on an old version.
 *
 * In development (`!app.isPackaged`) it stays inert unless FORCE_UPDATE_CHECK=1
 * AND a dev-app-update.yml exists — electron-updater otherwise throws in dev.
 */
export class UpdaterService {
  private win: BrowserWindow | null = null
  private initialized = false
  private state: UpdateState = {
    status: 'idle', version: null, releaseNotes: null, percent: 0, error: null,
  }

  /** Bind (or re-bind) the window that receives status events, init handlers once. */
  attach(win: BrowserWindow): void {
    this.win = win
    if (this.initialized) return
    this.initialized = true
    this.registerHandlers()
    this.wireUpdaterEvents()

    if (this.canRun()) {
      // Check shortly after launch (don't block first paint), then periodically.
      setTimeout(() => this.check(), 8_000)
      setInterval(() => this.check(), 6 * 60 * 60 * 1000)
    }
  }

  private canRun(): boolean {
    return app.isPackaged || process.env.FORCE_UPDATE_CHECK === '1'
  }

  private wireUpdaterEvents(): void {
    const au = getAutoUpdater()
    au.autoDownload          = true   // pull the package as soon as we find one
    au.autoInstallOnAppQuit  = true   // fail-safe: install on quit if not sooner
    au.logger = {
      info:  (m: unknown) => logDebug(`[updater] ${String(m)}`),
      warn:  (m: unknown) => logDebug(`[updater] WARN ${String(m)}`),
      error: (m: unknown) => logDebug(`[updater] ERROR ${String(m)}`),
      debug: () => {},
    } as AppUpdater['logger']

    au.on('checking-for-update', () => this.set({ status: 'checking', error: null }))
    au.on('update-available',    (info: UpdateInfo) =>
      this.set({ status: 'available', version: info.version, releaseNotes: notesToString(info.releaseNotes) }))
    au.on('update-not-available', () => this.set({ status: 'not-available' }))
    au.on('download-progress',    (p: ProgressInfo) =>
      this.set({ status: 'downloading', percent: Math.round(p.percent) }))
    au.on('update-downloaded',    (info: UpdateInfo) => {
      this.set({ status: 'downloaded', version: info.version, percent: 100 })
      this.promptInstall(info.version)
    })
    au.on('error', (err: Error) =>
      this.set({ status: 'error', error: err?.message ?? String(err) }))
  }

  /**
   * Native dialog shown once an update is staged. "Restart now" installs
   * immediately; "Later" defers — autoInstallOnAppQuit applies it on next quit.
   * Wrapped in try/catch so a dialog failure can never crash the app.
   */
  private async promptInstall(version: string | null): Promise<void> {
    try {
      const win = this.win && !this.win.isDestroyed() ? this.win : undefined
      const result = await dialog.showMessageBox(win as BrowserWindow, {
        type: 'info',
        buttons: ['Restart now', 'Later'],
        defaultId: 0,
        cancelId: 1,
        title: 'Update ready',
        message: `Student Hub ${version ? `v${version} ` : ''}is ready to install.`,
        detail: 'Restart now to apply the update, or it will install automatically the next time you quit.',
        noLink: true,
      })
      if (result.response === 0) {
        setImmediate(() => getAutoUpdater().quitAndInstall(false, true))
      }
    } catch (err) {
      logDebug(`[updater] install prompt failed (non-fatal): ${String(err)}`)
    }
  }

  private registerHandlers(): void {
    ipcMain.handle(IPC.UPDATER.GET_STATE, () => ({ ok: true, data: this.state }))

    ipcMain.handle(IPC.UPDATER.CHECK, async () => {
      try { await this.check(); return { ok: true, data: null } }
      catch (err) { return { ok: false, error: String(err) } }
    })

    ipcMain.handle(IPC.UPDATER.DOWNLOAD, async () => {
      try { await getAutoUpdater().downloadUpdate(); return { ok: true, data: null } }
      catch (err) { return { ok: false, error: String(err) } }
    })

    ipcMain.handle(IPC.UPDATER.INSTALL, () => {
      // isSilent=false (show NSIS progress), forceRunAfter=true (relaunch).
      setImmediate(() => getAutoUpdater().quitAndInstall(false, true))
      return { ok: true, data: null }
    })
  }

  async check(): Promise<void> {
    if (!this.canRun()) { this.set({ status: 'idle' }); return }
    try {
      await getAutoUpdater().checkForUpdates()
    } catch (err) {
      this.set({ status: 'error', error: String(err) })
    }
  }

  private set(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch }
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send(IPC.UPDATER.STATUS, this.state)
    }
  }
}
