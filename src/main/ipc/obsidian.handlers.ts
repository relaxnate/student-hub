import { ipcMain, dialog, BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { ObsidianSyncService } from '../services/obsidian/ObsidianSyncService'
import { FileDownloadManager } from '../services/files/FileDownloadManager'
import { getDb } from '../database'

const obsidianService   = new ObsidianSyncService()
const downloadManager   = new FileDownloadManager()

export function registerObsidianHandlers(): void {
  // Sync entire vault
  ipcMain.handle(IPC.OBSIDIAN.SYNC_ALL, async (event) => {
    try {
      const db      = getDb()
      const prefRow = db.prepare(`SELECT value FROM preferences WHERE key = 'obsidianVaultPath'`).get() as
        { value?: string } | undefined
      const vaultPath = prefRow?.value ? JSON.parse(prefRow.value) as string : null

      if (!vaultPath) {
        return { ok: false, error: 'No Obsidian vault path configured. Go to Settings → Sync to set it.' }
      }

      const result = await obsidianService.syncAll(vaultPath)
      return { ok: true, data: result }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  // Sync a single course
  ipcMain.handle(IPC.OBSIDIAN.SYNC_COURSE, async (_event, courseId: string) => {
    try {
      const db      = getDb()
      const prefRow = db.prepare(`SELECT value FROM preferences WHERE key = 'obsidianVaultPath'`).get() as
        { value?: string } | undefined
      const vaultPath = prefRow?.value ? JSON.parse(prefRow.value) as string : null

      if (!vaultPath) return { ok: false, error: 'No Obsidian vault path configured.' }

      const courseRow = db.prepare(`SELECT * FROM courses WHERE id = ?`).get(courseId) as
        { id: string; name: string; course_code: string | null; description: string | null;
          color: string | null; term: string | null; start_date: number | null; end_date: number | null;
          integration_id: string; external_id: string; is_active: number; synced_at: number;
          current_score: number | null; current_grade: string | null; apply_group_weights: number } | undefined

      if (!courseRow) return { ok: false, error: `Course ${courseId} not found` }

      const course = {
        id: courseRow.id, integrationId: courseRow.integration_id, externalId: courseRow.external_id,
        name: courseRow.name, courseCode: courseRow.course_code, description: courseRow.description,
        color: courseRow.color, term: courseRow.term, startDate: courseRow.start_date,
        endDate: courseRow.end_date, isActive: courseRow.is_active === 1,
        currentScore: courseRow.current_score, currentGrade: courseRow.current_grade,
        applyGroupWeights: courseRow.apply_group_weights === 1, syncedAt: courseRow.synced_at,
      }

      const root   = require('path').join(vaultPath, 'Student Hub')
      const result = await obsidianService.syncCourse(course, root)
      return { ok: true, data: result }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  // Native directory picker for the vault path
  ipcMain.handle(IPC.OBSIDIAN.CHOOSE_VAULT_PATH, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win!, {
      title:      'Select your Obsidian vault folder',
      properties: ['openDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: true, data: null }
    }
    return { ok: true, data: result.filePaths[0] }
  })
}

export function registerDownloadHandlers(): void {
  // Download a file and stream progress back to the renderer
  ipcMain.handle(IPC.FILES.DOWNLOAD, async (event, fileId: string) => {
    try {
      const localPath = await downloadManager.downloadFile(fileId, progress => {
        event.sender.send('files:download-progress', progress)
      })
      return localPath
        ? { ok: true, data: { localPath } }
        : { ok: false, error: 'Download failed' }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle(IPC.FILES.CANCEL_DOWNLOAD, (_event, fileId: string) => {
    downloadManager.cancelDownload(fileId)
    return { ok: true, data: null }
  })

  ipcMain.handle(IPC.FILES.DELETE_LOCAL, (_event, fileId: string) => {
    try {
      downloadManager.deleteLocal(fileId)
      return { ok: true, data: null }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
}
