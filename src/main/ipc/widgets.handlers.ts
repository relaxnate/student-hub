import { ipcMain, app, dialog, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'
import { IPC } from '@shared/ipc-channels'
import { WidgetRepository, DEFAULT_LAYOUT_ID } from '../database/repositories'
import type { WidgetInstance, WidgetMode, UserWidgetAsset } from '@shared/types/entities'

const widgets = new WidgetRepository()

// All uploaded widget images live here — always inside userData, never elsewhere.
function assetsDir(): string {
  const dir = path.join(app.getPath('userData'), 'widget-assets')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])

export function registerWidgetHandlers(): void {
  ipcMain.handle(IPC.WIDGETS.GET_LAYOUT, () => {
    try { return { ok: true, data: widgets.getOrCreateDefaultLayout() } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.WIDGETS.SAVE_LAYOUT, (_e, patch: { mode?: WidgetMode; layoutJson?: string }) => {
    try { return { ok: true, data: widgets.saveLayout(patch ?? {}) } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.WIDGETS.GET_INSTANCES, () => {
    try { return { ok: true, data: widgets.getInstances(DEFAULT_LAYOUT_ID) } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.WIDGETS.SAVE_INSTANCE, (_e, instance: WidgetInstance) => {
    try {
      // Guarantee the parent layout exists (FK) and stamp updated_at.
      widgets.getOrCreateDefaultLayout()
      widgets.saveInstance({
        ...instance,
        layoutId: instance.layoutId || DEFAULT_LAYOUT_ID,
        updatedAt: Date.now(),
      })
      return { ok: true, data: null }
    } catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.WIDGETS.REMOVE_INSTANCE, (_e, id: string) => {
    try { widgets.removeInstance(id); return { ok: true, data: null } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  // Open a file picker, COPY the chosen image into userData/widget-assets/, and
  // record only the copied path (never the original absolute path, never the
  // file content) in the DB. Returns the new asset.
  ipcMain.handle(IPC.WIDGETS.UPLOAD_ASSET, async (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender)
      const result = await dialog.showOpenDialog(win!, {
        title: 'Choose an image',
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
        properties: ['openFile'],
      })
      if (result.canceled || !result.filePaths[0]) return { ok: true, data: null }

      const src = result.filePaths[0]
      const ext = path.extname(src).slice(1).toLowerCase()
      if (!IMAGE_EXTS.has(ext)) return { ok: false, error: 'Unsupported image type' }

      const id = `widget-asset-${randomUUID()}`
      const destName = `${id}.${ext}`
      const dest = path.join(assetsDir(), destName)
      fs.copyFileSync(src, dest)

      const asset: UserWidgetAsset = {
        id,
        name: path.basename(src),
        // Stored relative-safe: an absolute path inside userData. Always within
        // userData so it is portable with the app's data directory.
        filePath: dest,
        fileType: ext,
        createdAt: Date.now(),
      }
      widgets.saveAsset(asset)
      return { ok: true, data: asset }
    } catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.WIDGETS.GET_ASSETS, () => {
    try { return { ok: true, data: widgets.getAssets() } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.WIDGETS.DELETE_ASSET, (_e, id: string) => {
    try {
      const asset = widgets.getAsset(id)
      widgets.deleteAsset(id)
      // Best-effort remove the copied file; only if it really sits under our dir.
      if (asset && asset.filePath.startsWith(assetsDir())) {
        try { fs.unlinkSync(asset.filePath) } catch { /* already gone — fine */ }
      }
      return { ok: true, data: null }
    } catch (err) { return { ok: false, error: String(err) } }
  })
}
