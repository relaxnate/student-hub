// PDF intelligence IPC (Phase 4). Split of responsibilities:
//   • main   — file picking + reading, AI answer generation (keys live here), and
//              the ONLY writes (always to a NEW file; the original is untouched).
//   • renderer — pdfjs page rendering + text-layer geometry + placement preview
//              (native Chromium canvas, no native module).
// Every modify path produces a PROPOSAL the renderer shows as an action card;
// pdf:stamp / pdf:confirm-apply are the only places a file is written.
import { ipcMain, dialog, shell, BrowserWindow, app } from 'electron'
import path from 'path'
import fs from 'fs'
import { IPC } from '@shared/ipc-channels'
import { pdfService, PDFNotAvailableError } from '../ai/pdf/PDFService'
import { analyzeAndAnswerFillable, answerQuestions, visionAnswerPage } from '../ai/pdf/PDFAnalyzer'
import { validateWritePath } from '../ai/tools/ToolExecutor'
import { CourseRepository } from '../database/repositories'
import type {
  PDFConfirmPayload, PDFProposal, PDFFieldAnswer, PDFPickResult,
  PDFAnswerPayload, PDFVisionPayload, PDFStampPayload,
} from '@shared/types/ipc'

const courseRepo = new CourseRepository()

function managedDir(): string {
  const dir = path.join(app.getPath('userData'), 'files')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function outputFor(fileName: string): string {
  return path.join(managedDir(), fileName.replace(/\.pdf$/i, '') + ' — filled.pdf')
}

function courseContext(): string {
  try { return courseRepo.getActive().map(c => c.name).join(', ') } catch { return '' }
}

export function registerPdfHandlers(): void {
  // Pick a PDF, detect its kind, and return the raw bytes so the renderer can
  // analyse the text layer / render previews. Nothing is written.
  ipcMain.handle(IPC.PDF.PICK, async (event): Promise<{ ok: true; data: PDFPickResult | null } | { ok: false; error: string }> => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender)
      const picked = await dialog.showOpenDialog(win!, {
        title: 'Choose a PDF',
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
        properties: ['openFile'],
      })
      if (picked.canceled || !picked.filePaths[0]) return { ok: true, data: null }
      const filePath = picked.filePaths[0]
      const fileName = path.basename(filePath)
      const kind = await pdfService.detectPDFType(filePath)
      const base64 = fs.readFileSync(filePath).toString('base64')
      return { ok: true, data: { filePath, fileName, kind, base64, outputPath: outputFor(fileName) } }
    } catch (err) { return { ok: false, error: String(err) } }
  })

  // Fillable AcroForm path: read fields → AI answers → proposal. (filePath comes
  // from a prior PDF.PICK so there's no second dialog.)
  ipcMain.handle(IPC.PDF.ANALYZE_FILLABLE, async (_e, payload: { filePath: string; mode: 'autofill' | 'help' }) => {
    try {
      const { filePath, mode } = payload
      const fileName = path.basename(filePath)
      const outputPath = outputFor(fileName)

      if (mode === 'help') {
        const fields = await pdfService.getFillableFields(filePath)
        const proposal: PDFProposal = {
          filePath, outputPath, fileName, kind: 'fillable', fieldCount: fields.length, answers: [],
          experimental: true, mode,
          note: `This form has ${fields.length} fields: ${fields.map(f => f.name).slice(0, 20).join(', ')}. (Help mode never modifies the file.)`,
        }
        return { ok: true, data: proposal }
      }

      const { fields, answers } = await analyzeAndAnswerFillable(filePath, courseContext())
      const byName = new Map(fields.map(f => [f.name, f]))
      const answerList: PDFFieldAnswer[] = Object.entries(answers).map(([name, answer]) => ({
        name, answer, question: name, type: byName.get(name)?.type ?? 'text',
      }))
      const proposal: PDFProposal = {
        filePath, outputPath, fileName, kind: 'fillable', fieldCount: fields.length, answers: answerList,
        experimental: true, mode,
        note: answerList.length === 0 ? 'The AI did not return any answers for this form.' : undefined,
      }
      return { ok: true, data: proposal }
    } catch (err) {
      const msg = err instanceof PDFNotAvailableError ? err.message : String(err)
      return { ok: false, error: msg }
    }
  })

  // Answer a batch of questions the renderer extracted from a flat PDF's text layer.
  ipcMain.handle(IPC.PDF.ANSWER, async (_e, payload: PDFAnswerPayload) => {
    try {
      const answers = await answerQuestions(payload.questions ?? [], payload.courseContext ?? courseContext())
      return { ok: true, data: answers }
    } catch (err) { return { ok: false, error: String(err) } }
  })

  // Answer a scanned/image-only page via a vision model (best-effort).
  ipcMain.handle(IPC.PDF.VISION_ANSWER, async (_e, payload: PDFVisionPayload) => {
    try {
      const anchors = await visionAnswerPage(payload.imageDataUrl, payload.courseContext ?? courseContext())
      return { ok: true, data: anchors }
    } catch (err) { return { ok: false, error: String(err) } }
  })

  // Stamp computed placements onto a flat PDF → new file. Only here for flat PDFs.
  ipcMain.handle(IPC.PDF.STAMP, async (_e, payload: PDFStampPayload) => {
    try {
      if (!payload.placements?.length) return { ok: false, error: 'Nothing to stamp.' }
      const check = validateWritePath(payload.outputPath)
      if (!check.ok) return { ok: false, error: check.error }
      await pdfService.stampAnswersFlat(payload.filePath, check.resolved!, payload.placements)
      return { ok: true, data: { path: check.resolved } }
    } catch (err) { return { ok: false, error: String(err) } }
  })

  // Apply a fillable-form proposal: fill + write to the (validated) output path.
  ipcMain.handle(IPC.PDF.CONFIRM_APPLY, async (_e, payload: PDFConfirmPayload) => {
    try {
      const p = payload.proposal
      if (p.kind !== 'fillable' || p.answers.length === 0) {
        return { ok: false, error: 'Nothing to apply for this PDF.' }
      }
      const check = validateWritePath(p.outputPath)
      if (!check.ok) return { ok: false, error: check.error }
      const values: Record<string, string> = {}
      for (const a of p.answers) values[a.name] = a.answer
      await pdfService.fillFormFields(p.filePath, check.resolved!, values)
      return { ok: true, data: { path: check.resolved } }
    } catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.PDF.OPEN, async (_e, filePath: string) => {
    try { const err = await shell.openPath(filePath); return err ? { ok: false, error: err } : { ok: true, data: null } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.PDF.REVEAL, (_e, filePath: string) => {
    try { shell.showItemInFolder(filePath); return { ok: true, data: null } }
    catch (err) { return { ok: false, error: String(err) } }
  })
}
