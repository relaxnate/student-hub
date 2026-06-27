// Renderer-side PDF analysis for the AI Helper's flat/scanned auto-fill.
//
// WHY HERE (not main): the renderer is Chromium, so pdfjs renders pages on a
// native <canvas> and exposes the text layer with EXACT glyph coordinates — no
// node-canvas / native module needed. We compute answer placement deterministically
// from that text geometry (reliable, unlike asking a model to guess pixel boxes),
// stamp via pdf-lib in main, and only fall back to a vision model for image-only
// (scanned) pages.
//
// Coordinate space: pdfjs text items report transform[4]=x, transform[5]=y in PDF
// user space (origin bottom-left, y-up) — the SAME space pdf-lib draws in — so the
// detected (x, baseline-y) flow straight through to the stamp with no flipping.
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import PdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker'
import type { PDFPlacement } from '@shared/types/ipc'

pdfjsLib.GlobalWorkerOptions.workerPort = new PdfjsWorker()

const MAX_PAGES = 15
const MAX_SLOTS = 80

export interface FlatSlot {
  page: number
  question: string
  x: number        // PDF points from left
  y: number        // PDF points from bottom (text baseline)
  size: number     // font size in points
  maxWidth: number // available width to the right of x
}

export interface FlatAnalysis {
  pageCount: number
  pageDims: { width: number; height: number }[]
  slots: FlatSlot[]
  scannedPages: number[]   // 0-based pages with no extractable text layer
  /** Render a page to a PNG data-URL (used for previews + the vision fallback). */
  renderPageDataUrl: (page: number, scale: number) => Promise<string>
  dispose: () => void
}

interface Glyph { x: number; y: number; w: number; h: number; str: string }
interface Line { y: number; h: number; items: Glyph[]; text: string; minX: number; maxX: number }

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export async function analyzeFlatPdf(base64: string): Promise<FlatAnalysis> {
  const data = decodeBase64(base64)
  // `data` is detached into the worker; pdfjs keeps its own copy.
  const doc: PDFDocumentProxy = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise
  const pageCount = Math.min(doc.numPages, MAX_PAGES)

  const pageDims: { width: number; height: number }[] = []
  const slots: FlatSlot[] = []
  const scannedPages: number[] = []

  for (let p = 0; p < pageCount; p++) {
    const page = await doc.getPage(p + 1)
    const viewport = page.getViewport({ scale: 1 })
    pageDims.push({ width: viewport.width, height: viewport.height })

    const glyphs = await extractGlyphs(page)
    if (glyphs.length === 0) { scannedPages.push(p); continue }

    const rightEdge = Math.min(viewport.width - 36, Math.max(...glyphs.map(g => g.x + g.w)) + 4)
    const lines = groupLines(glyphs)
    for (const line of lines) {
      if (slots.length >= MAX_SLOTS) break
      const slot = detectSlot(line, rightEdge, p)
      if (slot) slots.push(slot)
    }
  }

  return {
    pageCount,
    pageDims,
    slots,
    scannedPages,
    renderPageDataUrl: async (p: number, scale: number) => {
      const page = await doc.getPage(p + 1)
      return renderToDataUrl(page, scale)
    },
    dispose: () => { void doc.destroy() },
  }
}

// ── Text extraction ──────────────────────────────────────────────────────────
async function extractGlyphs(page: PDFPageProxy): Promise<Glyph[]> {
  const tc = await page.getTextContent()
  const out: Glyph[] = []
  for (const item of tc.items) {
    if (!('str' in item)) continue   // skip TextMarkedContent markers
    const t = item.transform as number[]
    const str = item.str
    if (str === '') continue
    const h = Math.hypot(t[2], t[3]) || item.height || 10
    out.push({ x: t[4], y: t[5], w: item.width || 0, h, str })
  }
  return out
}

// Group glyphs sharing a baseline into lines (top-to-bottom).
function groupLines(glyphs: Glyph[]): Line[] {
  const sorted = [...glyphs].sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: Line[] = []
  for (const g of sorted) {
    const tol = Math.max(2, g.h * 0.5)
    let line = lines.find(l => Math.abs(l.y - g.y) <= tol)
    if (!line) { line = { y: g.y, h: g.h, items: [], text: '', minX: g.x, maxX: g.x }; lines.push(line) }
    line.items.push(g)
    line.h = Math.max(line.h, g.h)
  }
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x)
    line.minX = line.items[0].x
    line.maxX = Math.max(...line.items.map(i => i.x + i.w))
    // Reconstruct text, inserting a space across wide gaps.
    let text = ''
    let prevRight: number | null = null
    for (const it of line.items) {
      if (prevRight != null && it.x - prevRight > it.h * 0.28 && !text.endsWith(' ')) text += ' '
      text += it.str
      prevRight = it.x + it.w
    }
    line.text = text.replace(/\s+/g, ' ').trim()
  }
  return lines
}

// ── Slot detection ───────────────────────────────────────────────────────────
const UNDERSCORE_RUN = /[_—]{2,}/        // ___ or em-dashes used as a blank
const QUESTION_LEAD = /^\s*\(?\d{1,3}[.)]/    // "1.", "12)", "(3)"
const FILL_HINT = /(?::\s*$)|[?=]\s*$/         // ends with colon / question mark / equals

function detectSlot(line: Line, rightEdge: number, page: number): FlatSlot | null {
  const size = clamp(line.h * 0.95, 8, 14)
  const text = line.text
  if (!text) return null

  // 1) Inline blank made of underscores → write ON the blank.
  for (const it of line.items) {
    const m = it.str.match(UNDERSCORE_RUN)
    if (m && it.w > 6) {
      const idx = it.str.indexOf(m[0])
      const per = it.w / Math.max(it.str.length, 1)
      const bx = it.x + per * idx
      const bw = per * m[0].length
      return { page, question: text, x: bx + 1, y: line.y + size * 0.12, size, maxWidth: Math.max(bw - 2, 24) }
    }
  }

  // 2) Label/prompt with a wide empty run to the right → write in that gap.
  const gap = rightEdge - line.maxX
  const looksLikePrompt = FILL_HINT.test(text) || QUESTION_LEAD.test(text) || text.includes('?')
  if (looksLikePrompt && gap > 50) {
    return { page, question: text, x: line.maxX + size * 0.6, y: line.y, size, maxWidth: gap - size * 0.6 }
  }

  // 3) Numbered question filling the line (no room to the right) → write just
  //    after it; overlap is acceptable per the spec ("text can overlap").
  if (QUESTION_LEAD.test(text) && gap > 14) {
    return { page, question: text, x: line.maxX + size * 0.4, y: line.y, size, maxWidth: Math.max(gap - size * 0.4, 28) }
  }

  return null
}

// ── Rendering (preview + vision fallback) ────────────────────────────────────
async function renderToDataUrl(page: PDFPageProxy, scale: number): Promise<string> {
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d')!
  await page.render({ canvasContext: ctx, viewport }).promise
  return canvas.toDataURL('image/png')
}

// Draw a faithful preview: the rendered page with each answer stamped (in blue)
// exactly where it will be written, so the student can sanity-check placement.
export async function composePreviews(
  analysis: FlatAnalysis,
  placements: PDFPlacement[],
  scale = 1.4,
): Promise<string[]> {
  const byPage = new Map<number, PDFPlacement[]>()
  for (const pl of placements) {
    if (!byPage.has(pl.page)) byPage.set(pl.page, [])
    byPage.get(pl.page)!.push(pl)
  }
  const previews: string[] = []
  for (const p of [...byPage.keys()].sort((a, b) => a - b)) {
    const dim = analysis.pageDims[p]
    if (!dim) continue
    try {
      const baseUrl = await analysis.renderPageDataUrl(p, scale)
      const url = await drawOverlay(baseUrl, dim, byPage.get(p)!, scale)
      previews.push(url)
    } catch { /* skip a page that fails to render; placement still applies */ }
  }
  return previews
}

function drawOverlay(
  baseUrl: string,
  dim: { width: number; height: number },
  placements: PDFPlacement[],
  scale: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      ctx.fillStyle = '#0d22a0'
      ctx.textBaseline = 'alphabetic'
      for (const pl of placements) {
        const fontPx = pl.size * scale
        ctx.font = `${fontPx}px Helvetica, Arial, sans-serif`
        const dx = pl.x * scale
        const dy = (dim.height - pl.y) * scale   // flip y (canvas origin is top-left)
        let text = pl.text
        if (pl.maxWidth) {
          const maxPx = pl.maxWidth * scale
          while (text.length > 1 && ctx.measureText(text).width > maxPx) text = text.slice(0, -1)
        }
        ctx.fillText(text, dx, dy)
      }
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src = baseUrl
  })
}

function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)) }
