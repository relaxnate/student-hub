import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { SyncEngine } from '../services/sync/SyncEngine'
import { OAuthManager } from '../services/auth/OAuthManager'

const syncEngine = new SyncEngine()

export function registerSyncHandlers(oauthManager: OAuthManager): void {
  ipcMain.handle(IPC.SYNC.START_ALL, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return { ok: false, error: 'No window found' }

    const integrations = oauthManager.getConnectedIntegrations()
    if (integrations.length === 0) {
      return { ok: false, error: 'No integrations connected' }
    }

    // Run each integration sync concurrently.
    // IMPORTANT: SyncEngine.syncIntegration() never rejects — it catches its
    // own errors internally and resolves with { success: false, error }.
    // So we must inspect each fulfilled result's `success` flag, not just
    // look for rejected promises (which will never happen here). Checking
    // only `status === 'rejected'` was the bug that made this handler
    // always report ok:true even when every integration failed to sync.
    const results = await Promise.allSettled(
      integrations.map(i => syncEngine.syncIntegration(i, window))
    )

    const failures: string[] = []
    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      const label  = integrations[i].displayName
      if (result.status === 'rejected') {
        failures.push(`${label}: ${String(result.reason)}`)
      } else if (!result.value.success) {
        failures.push(`${label}: ${result.value.error ?? 'Unknown sync error'}`)
      }
      // Note: result.value.success === true with an `error` set means a
      // *partial* sync (some courses/phases had issues but most data came
      // through) — that's surfaced via the SYNC.ERROR toast event already,
      // so we don't treat it as a hard failure here.
    }

    if (failures.length > 0) {
      return { ok: false, error: failures.join('; ') }
    }
    return { ok: true, data: null }
  })

  ipcMain.handle(IPC.SYNC.START_INTEGRATION, async (event, integrationId: string) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return { ok: false, error: 'No window found' }

    const integrations = oauthManager.getConnectedIntegrations()
    const integration  = integrations.find(i => i.id === integrationId)
    if (!integration) return { ok: false, error: `Integration ${integrationId} not found` }

    const result = await syncEngine.syncIntegration(integration, window)
    return result.success
      ? { ok: true, data: null }
      : { ok: false, error: result.error }
  })

  ipcMain.handle(IPC.SYNC.GET_STATUS, (_event, integrationId: string) => {
    return {
      ok: true,
      data: { isSyncing: syncEngine.isSyncing(integrationId) },
    }
  })
}
