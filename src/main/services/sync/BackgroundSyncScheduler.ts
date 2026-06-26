import type { BrowserWindow } from 'electron'
import { SyncEngine } from './SyncEngine'
import type { OAuthManager } from '../auth/OAuthManager'

/**
 * Runs background syncs on a configurable interval.
 * Only runs when the app window is open and not already syncing.
 */
export class BackgroundSyncScheduler {
  private timer:      ReturnType<typeof setInterval> | null = null
  private engine:     SyncEngine
  private isBusy:     boolean = false
  private lastSyncAt: number = 0

  // Minimum gap before a window-focus event is allowed to trigger a sync, so
  // refocusing the window repeatedly doesn't hammer the LMS.
  private static FOCUS_STALE_MS = 10 * 60 * 1000

  constructor() {
    this.engine = new SyncEngine()
  }

  start(
    intervalMinutes: number,
    oauthManager:    OAuthManager,
    window:          BrowserWindow
  ): void {
    this.stop()

    const ms = Math.max(intervalMinutes, 5) * 60 * 1000   // minimum 5 min
    // Treat startup as "just synced" so refocusing right after launch doesn't
    // immediately fire a focus-sync; the staleness window starts from here.
    this.lastSyncAt = Date.now()
    console.log(`[Scheduler] Auto-sync every ${intervalMinutes} min`)

    this.timer = setInterval(() => {
      this.runSync(oauthManager, window).catch(err => {
        console.error('[Scheduler] Sync error:', err)
      })
    }, ms)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
      console.log('[Scheduler] Stopped')
    }
  }

  /** Restart with a new interval (called when the user changes preferences). */
  restart(intervalMinutes: number, oauthManager: OAuthManager, window: BrowserWindow): void {
    this.stop()
    this.start(intervalMinutes, oauthManager, window)
  }

  /**
   * Called when the app window regains focus. Runs a sync only if it has been a
   * while since the last one, so data is fresh when the user returns — without
   * syncing on every quick alt-tab.
   */
  async syncOnFocus(oauthManager: OAuthManager, window: BrowserWindow): Promise<void> {
    if (this.isBusy) return
    if (Date.now() - this.lastSyncAt < BackgroundSyncScheduler.FOCUS_STALE_MS) return
    console.log('[Scheduler] Window focused after idle — refreshing')
    await this.runSync(oauthManager, window)
  }

  private async runSync(oauthManager: OAuthManager, window: BrowserWindow): Promise<void> {
    if (this.isBusy) {
      console.log('[Scheduler] Skipping — previous sync still running')
      return
    }

    const integrations = oauthManager.getConnectedIntegrations()
    if (integrations.length === 0) return

    this.isBusy = true
    console.log(`[Scheduler] Auto-sync starting for ${integrations.length} integration(s)`)

    try {
      await Promise.allSettled(
        integrations.map(i => this.engine.syncIntegration(i, window))
      )
    } finally {
      this.isBusy = false
      this.lastSyncAt = Date.now()
      console.log('[Scheduler] Auto-sync complete')
    }
  }
}
