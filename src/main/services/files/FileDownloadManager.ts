import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { getDb } from '../../database'
import { getAdapter } from '../../integrations/registry'

export interface DownloadProgress {
  fileId:    string
  received:  number
  total:     number | null
  done:      boolean
  localPath: string | null
  error:     string | null
}

/**
 * Downloads files from LMS platforms and caches them in the user's data directory.
 *
 * Layout on disk:
 *   {userData}/files/{integrationId}/{courseExternalId}/{folderPath}/{filename}
 *
 * Download flow:
 *   1. Retrieve file metadata from the local DB.
 *   2. Use the stored LMS URL directly (for Canvas, URLs are pre-signed — refresh
 *      by calling the files endpoint with the access token if they have expired).
 *   3. Stream the response to disk.
 *   4. Update `local_path` in the DB.
 */
export class FileDownloadManager {
  private readonly baseDir: string
  private active = new Map<string, AbortController>()

  constructor() {
    this.baseDir = path.join(app.getPath('userData'), 'files')
    fs.mkdirSync(this.baseDir, { recursive: true })
  }

  async downloadFile(
    fileId: string,
    onProgress?: (p: DownloadProgress) => void
  ): Promise<string | null> {
    const db = getDb()

    // Pull all the metadata we need in one query
    const row = db.prepare(`
      SELECT f.id, f.url, f.filename, f.display_name, f.folder_path, f.local_path,
             c.external_id AS course_ext_id,
             i.id          AS integration_id
      FROM files f
      JOIN courses c ON c.id = f.course_id
      JOIN integrations i ON i.id = c.integration_id
      WHERE f.id = ?
    `).get(fileId) as {
      id: string; url: string | null; filename: string; display_name: string
      folder_path: string; local_path: string | null
      course_ext_id: string; integration_id: string
    } | undefined

    if (!row) return null

    // Already downloaded
    if (row.local_path && fs.existsSync(row.local_path)) {
      onProgress?.({ fileId, received: 0, total: 0, done: true, localPath: row.local_path, error: null })
      return row.local_path
    }

    // Determine the download URL
    let downloadUrl = row.url
    if (!downloadUrl) {
      onProgress?.({ fileId, received: 0, total: null, done: false, localPath: null, error: 'No download URL available' })
      return null
    }

    // Build the local destination path
    const safeName   = sanitizeFilename(row.display_name || row.filename)
    const folderSegs = row.folder_path.split('/').map(sanitizeFilename).filter(Boolean)
    const destDir    = path.join(this.baseDir, row.integration_id, row.course_ext_id, ...folderSegs)
    const destPath   = path.join(destDir, safeName)

    fs.mkdirSync(destDir, { recursive: true })

    // Abort controller lets us cancel in-flight downloads
    const controller = new AbortController()
    this.active.set(fileId, controller)

    try {
      const adapter = getAdapter(row.integration_id)
      const headers: Record<string, string> = {}
      if (adapter?.['accessToken']) {
        headers['Authorization'] = `Bearer ${adapter['accessToken'] as string}`
      }

      const response = await fetch(downloadUrl, { signal: controller.signal, headers })
      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`)
      }

      const total    = response.headers.get('content-length')
      const totalNum = total ? parseInt(total) : null
      let received   = 0

      const writer = fs.createWriteStream(destPath)

      await new Promise<void>((resolve, reject) => {
        const reader = response.body!.getReader()

        const pump = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) { writer.end(); break }
              writer.write(value)
              received += value.byteLength
              onProgress?.({ fileId, received, total: totalNum, done: false, localPath: null, error: null })
            }
            resolve()
          } catch (err) {
            writer.destroy()
            reject(err)
          }
        }

        writer.on('error', reject)
        pump()
      })

      // Persist the local path
      db.prepare(`UPDATE files SET local_path = ? WHERE id = ?`).run(destPath, fileId)
      onProgress?.({ fileId, received, total: totalNum ?? received, done: true, localPath: destPath, error: null })
      return destPath

    } catch (err) {
      // Clean up partial download
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath)
      const msg = err instanceof Error ? err.message : String(err)
      onProgress?.({ fileId, received: 0, total: null, done: false, localPath: null, error: msg })
      return null

    } finally {
      this.active.delete(fileId)
    }
  }

  cancelDownload(fileId: string): void {
    this.active.get(fileId)?.abort()
    this.active.delete(fileId)
  }

  /** Delete a locally cached file and clear the path from the DB. */
  deleteLocal(fileId: string): void {
    const db  = getDb()
    const row = db.prepare(`SELECT local_path FROM files WHERE id = ?`).get(fileId) as
      { local_path: string | null } | undefined

    if (row?.local_path && fs.existsSync(row.local_path)) {
      fs.unlinkSync(row.local_path)
    }
    db.prepare(`UPDATE files SET local_path = NULL WHERE id = ?`).run(fileId)
  }
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}
