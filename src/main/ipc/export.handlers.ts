import { ipcMain, dialog, BrowserWindow } from 'electron'
import fs from 'fs'
import { IPC } from '@shared/ipc-channels'

export function registerExportHandlers(): void {

  // ── Markdown: generate in renderer, save here ──────────────────────────────
  ipcMain.handle(IPC.EXPORT.SAVE_MARKDOWN, async (event, {
    filename, content,
  }: { filename: string; content: string }) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender)!
      const result = await dialog.showSaveDialog(win, {
        title:       'Save Markdown Report',
        defaultPath: filename,
        filters:     [{ name: 'Markdown', extensions: ['md'] }, { name: 'All files', extensions: ['*'] }],
      })
      if (result.canceled || !result.filePath) return { ok: true, data: null }
      fs.writeFileSync(result.filePath, content, 'utf-8')
      return { ok: true, data: result.filePath }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  // ── PDF: render styled HTML in hidden window → printToPDF → save ───────────
  ipcMain.handle(IPC.EXPORT.SAVE_PDF, async (event, {
    filename, html,
  }: { filename: string; html: string }) => {
    try {
      const mainWin = BrowserWindow.fromWebContents(event.sender)!

      // Hidden window to render the HTML report
      const printWin = new BrowserWindow({
        width: 900, height: 1100, show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      })

      // Load report HTML via data URL
      await printWin.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
      )

      // Give Chrome time to finish painting
      await new Promise<void>(res => setTimeout(res, 600))

      const pdfData = await printWin.webContents.printToPDF({
        printBackground: true,
        pageSize:        'A4',
        margins:         { marginType: 'custom', top: 0.8, bottom: 0.8, left: 0.8, right: 0.8 },
      })
      printWin.close()

      const result = await dialog.showSaveDialog(mainWin, {
        title:       'Save PDF Report',
        defaultPath: filename,
        filters:     [{ name: 'PDF', extensions: ['pdf'] }, { name: 'All files', extensions: ['*'] }],
      })
      if (result.canceled || !result.filePath) return { ok: true, data: null }
      fs.writeFileSync(result.filePath, pdfData)
      return { ok: true, data: result.filePath }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
}
