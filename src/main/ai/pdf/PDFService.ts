// Core PDF processing (Phase 4). Uses pdf-lib (pure JS) for two paths, both
// writing to a NEW file (the original is never touched):
//   1. Fillable AcroForm forms — detect fields, fill, save.
//   2. Flat / scanned PDFs — stamp answer text at exact PDF-point coordinates that
//      the RENDERER computes from the page's text layer (pdfjs, native Chromium
//      canvas — no native module) or, for image-only pages, a vision model.
// Page rendering + geometry now live in the renderer, so nothing here needs
// node-canvas anymore.
import fs from 'fs'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { PDFKind, PDFPlacement } from '@shared/types/ipc'

export class PDFNotAvailableError extends Error {
  constructor(feature: string) {
    super(`${feature} is not available in this build.`)
    this.name = 'PDFNotAvailableError'
  }
}

export interface FormFieldInfo {
  name: string
  type: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'optionlist' | 'button' | 'signature' | 'unknown'
  currentValue: string
  options?: string[]
}

export class PDFService {
  /** Fillable if the AcroForm exposes ≥1 field, else Flat. */
  async detectPDFType(filePath: string): Promise<PDFKind> {
    try {
      const doc = await this.load(filePath)
      const fields = doc.getForm().getFields()
      return fields.length > 0 ? 'fillable' : 'flat'
    } catch {
      return 'unknown'
    }
  }

  async getFillableFields(filePath: string): Promise<FormFieldInfo[]> {
    const doc = await this.load(filePath)
    const form = doc.getForm()
    return form.getFields().map(f => {
      const name = f.getName()
      const ctor = f.constructor.name   // PDFTextField, PDFCheckBox, …
      let type: FormFieldInfo['type'] = 'unknown'
      let currentValue = ''
      let options: string[] | undefined
      try {
        if (ctor === 'PDFTextField') { type = 'text'; currentValue = (form.getTextField(name).getText() ?? '') }
        else if (ctor === 'PDFCheckBox') { type = 'checkbox'; currentValue = form.getCheckBox(name).isChecked() ? 'true' : 'false' }
        else if (ctor === 'PDFRadioGroup') { type = 'radio'; const rg = form.getRadioGroup(name); options = rg.getOptions(); currentValue = rg.getSelected() ?? '' }
        else if (ctor === 'PDFDropdown') { type = 'dropdown'; const dd = form.getDropdown(name); options = dd.getOptions(); currentValue = (dd.getSelected()[0] ?? '') }
        else if (ctor === 'PDFOptionList') { type = 'optionlist'; const ol = form.getOptionList(name); options = ol.getOptions(); currentValue = (ol.getSelected()[0] ?? '') }
        else if (ctor === 'PDFButton') { type = 'button' }
        else if (ctor === 'PDFSignature') { type = 'signature' }
      } catch { /* keep defaults */ }
      return { name, type, currentValue, options }
    })
  }

  /** Fill fields by name and write to outputPath (the original is untouched). */
  async fillFormFields(filePath: string, outputPath: string, values: Record<string, string>): Promise<void> {
    const doc = await this.load(filePath)
    const form = doc.getForm()
    for (const f of form.getFields()) {
      const name = f.getName()
      if (!(name in values)) continue
      const value = values[name]
      const ctor = f.constructor.name
      try {
        if (ctor === 'PDFTextField') form.getTextField(name).setText(value)
        else if (ctor === 'PDFCheckBox') { const cb = form.getCheckBox(name); /^(true|yes|x|on|checked|1)$/i.test(value.trim()) ? cb.check() : cb.uncheck() }
        else if (ctor === 'PDFDropdown') form.getDropdown(name).select(value)
        else if (ctor === 'PDFRadioGroup') form.getRadioGroup(name).select(value)
        else if (ctor === 'PDFOptionList') form.getOptionList(name).select(value)
      } catch { /* skip a field that rejects its value rather than fail the whole fill */ }
    }
    const bytes = await doc.save()
    fs.writeFileSync(outputPath, bytes)
  }

  /** Stamp answer text at exact PDF-point coordinates (baseline at y, origin
   *  bottom-left) onto a flat PDF → new file. Each answer is shrunk to fit its
   *  maxWidth (then ellipsised as a last resort) so it never runs off the page.
   *  Answers are drawn in blue ink so they're clearly distinguishable as fill-ins. */
  async stampAnswersFlat(filePath: string, outputPath: string, placements: PDFPlacement[]): Promise<void> {
    const doc = await this.load(filePath)
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const pages = doc.getPages()
    const ink = rgb(0.05, 0.13, 0.62)   // ink blue
    for (const a of placements) {
      const page = pages[a.page]
      if (!page) continue
      const text = (a.text ?? '').toString()
      if (!text.trim()) continue
      const { size, fitted } = this.fitText(text, a.size || 11, a.maxWidth, font)
      page.drawText(fitted, { x: a.x, y: a.y, size, font, color: ink })
    }
    fs.writeFileSync(outputPath, await doc.save())
  }

  /** Shrink the font (down to 6pt) to fit maxWidth; if still too wide, truncate
   *  with an ellipsis. No maxWidth → draw as-is at the requested size. */
  private fitText(text: string, size: number, maxWidth: number | undefined,
    font: import('pdf-lib').PDFFont): { size: number; fitted: string } {
    if (!maxWidth || maxWidth <= 0) return { size, fitted: text }
    let s = size
    while (s > 6 && font.widthOfTextAtSize(text, s) > maxWidth) s -= 0.5
    if (font.widthOfTextAtSize(text, s) <= maxWidth) return { size: s, fitted: text }
    // Still too wide at the floor size → truncate with an ellipsis.
    let t = text
    while (t.length > 1 && font.widthOfTextAtSize(t + '…', s) > maxWidth) t = t.slice(0, -1)
    return { size: s, fitted: t + '…' }
  }

  // ── Deferred (study-highlight overlays still need a render path) ──
  async highlightText(): Promise<void> { throw new PDFNotAvailableError('Text highlighting') }

  private async load(filePath: string): Promise<PDFDocument> {
    const bytes = fs.readFileSync(filePath)
    return PDFDocument.load(bytes, { updateMetadata: false })
  }
}

export const pdfService = new PDFService()
