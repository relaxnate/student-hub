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
      console.log('[Scheduler] Auto-sync complete')
    }
  }
}
