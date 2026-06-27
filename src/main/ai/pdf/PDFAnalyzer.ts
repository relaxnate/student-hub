// Orchestrates AI analysis over a PDF (Phase 4 — experimental). Fully supports
// fillable AcroForm PDFs: read the fields, ask the active AI provider to generate
// an appropriate answer per field, and return a fieldName→answer map for
// PDFService.fillFormFields. Flat/scanned analysis needs node-canvas (not in this
// build) and throws PDFNotAvailableError.
import { pdfService, type FormFieldInfo } from './PDFService'
import { getAdapter } from '../registry'
import { AIPreferencesRepository } from '../../database/repositories'
import { FreeTierAdapter } from '../providers/FreeTierAdapter'
import type { ChatMessage } from '@shared/types/entities'

const prefs = new AIPreferencesRepository()

export interface FieldAnswers {
  fields: FormFieldInfo[]
  answers: Record<string, string>   // fieldName → answer
}

export async function analyzeAndAnswerFillable(filePath: string, courseContext: string): Promise<FieldAnswers> {
  const fields = await pdfService.getFillableFields(filePath)
  const answerable = fields.filter(f => f.type === 'text' || f.type === 'dropdown' || f.type === 'radio' || f.type === 'checkbox' || f.type === 'optionlist')
  if (answerable.length === 0) return { fields, answers: {} }

  const fieldList = answerable.map(f => {
    const opts = f.options?.length ? ` (choose one of: ${f.options.join(', ')})` : ''
    return `- "${f.name}" [${f.type}]${opts}`
  }).join('\n')

  const system = `You are filling out a student's worksheet/form. ${courseContext ? `Course context: ${courseContext}. ` : ''}` +
    `For each field below, produce a concise, correct answer a student would write. For checkboxes answer "true" or "false". ` +
    `For dropdown/radio/optionlist answer EXACTLY one of the given options. ` +
    `Respond with ONLY a JSON object mapping each field name to its answer string — no prose, no code fences.`
  const user = `Fields:\n${fieldList}`

  const raw = await completeChat(system, user)
  const answers = parseJsonMap(raw, answerable.map(f => f.name))
  return { fields, answers }
}

// ─── Flat / scanned PDFs ─────────────────────────────────────────────────────
// The RENDERER extracts the questions (from the PDF text layer) and computes
// exact placement; here we only generate the answer TEXT for each question.

/** Answer a batch of extracted questions. Returns answers aligned by index to
 *  `questions` (empty string where the model gave nothing). */
export async function answerQuestions(questions: string[], courseContext: string): Promise<string[]> {
  if (questions.length === 0) return []
  const numbered = questions.map((q, i) => `${i + 1}. ${q.replace(/\s+/g, ' ').trim()}`).join('\n')
  const system =
    `You are helping a student fill out a worksheet/form. ${courseContext ? `The student's courses: ${courseContext}. ` : ''}` +
    `Below are numbered prompts pulled from the document. Give the SHORT answer that belongs in each blank — ` +
    `just the value (a number, word, short phrase, or name), no explanation, no restating the question. ` +
    `If a prompt is a label like "Name" or "Date", leave it blank (empty string). ` +
    `Respond with ONLY a JSON array of strings, one per prompt, in order — no prose, no code fences.`
  const raw = await completeChat(system, `Prompts:\n${numbered}`, 2000)
  return parseJsonArray(raw, questions.length)
}

/** Answer a scanned/image-only page from its rendered PNG using a vision model.
 *  Returns answers + normalized 0..1000 anchor coords (where to write each one).
 *  Best-effort: weak/non-vision models may return little. */
export async function visionAnswerPage(imageDataUrl: string, courseContext: string): Promise<{ question: string; answer: string; x: number; y: number }[]> {
  const provider = prefs.get('active_provider') ?? 'free'
  const adapter = getAdapter(provider)
  if (!adapter) throw new Error(`No AI provider is connected (${provider}). Connect a key in Settings → AI Helper, or use the Free tier.`)
  if (!adapter.supportsVision) {
    throw new Error(`The selected model can't read images. Pick a vision-capable model (e.g. a Gemini or GPT-4o model) in the AI Helper settings to auto-fill scanned PDFs.`)
  }
  const model = prefs.get('active_model') || (provider === 'free' ? FreeTierAdapter.DEFAULT_MODEL : '')
  const system =
    `You are reading a photo/scan of a student's worksheet. ${courseContext ? `The student's courses: ${courseContext}. ` : ''}` +
    `Find every place a student must write an answer (blanks, lines, boxes, after "="). For each, give the short answer ` +
    `and the pixel location to write it, as coordinates normalized to a 1000x1000 grid (x from left, y from top). ` +
    `Respond with ONLY a JSON array of objects {"question": string, "answer": string, "x": number, "y": number} — no prose, no code fences.`
  const messages: ChatMessage[] = [{
    role: 'user',
    content: [
      { type: 'text', text: 'Here is the worksheet page. Return the JSON array described.' },
      { type: 'image_url', image_url: { url: imageDataUrl } },
    ],
  }]
  let out = ''
  for await (const chunk of adapter.streamChat({ messages, model, systemPrompt: system, maxTokens: 2000, temperature: 0.2 })) {
    if (chunk.delta) out += chunk.delta
  }
  return parseVisionAnchors(out)
}

// ─── AI completion (non-streaming wrapper over the active provider) ──────────
async function completeChat(systemPrompt: string, userPrompt: string, maxTokens = 1500): Promise<string> {
  const provider = prefs.get('active_provider') ?? 'free'
  const adapter = getAdapter(provider)
  if (!adapter) throw new Error(`No AI provider is connected (${provider}). Connect a key in Settings → AI Helper, or use the Free tier.`)
  const model = prefs.get('active_model') || (provider === 'free' ? FreeTierAdapter.DEFAULT_MODEL : '')
  const messages: ChatMessage[] = [{ role: 'user', content: userPrompt }]

  let out = ''
  for await (const chunk of adapter.streamChat({ messages, model, systemPrompt, maxTokens, temperature: 0.3 })) {
    if (chunk.delta) out += chunk.delta
  }
  return out
}

function parseJsonArray(raw: string, expectedLen: number): string[] {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim()
  const start = cleaned.indexOf('['); const end = cleaned.lastIndexOf(']')
  const out: string[] = new Array(expectedLen).fill('')
  if (start === -1 || end === -1) return out
  try {
    const arr = JSON.parse(cleaned.slice(start, end + 1))
    if (Array.isArray(arr)) for (let i = 0; i < expectedLen; i++) out[i] = arr[i] == null ? '' : String(arr[i])
  } catch { /* leave blanks */ }
  return out
}

function parseVisionAnchors(raw: string): { question: string; answer: string; x: number; y: number }[] {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim()
  const start = cleaned.indexOf('['); const end = cleaned.lastIndexOf(']')
  if (start === -1 || end === -1) return []
  try {
    const arr = JSON.parse(cleaned.slice(start, end + 1))
    if (!Array.isArray(arr)) return []
    return arr
      .filter((o: unknown): o is Record<string, unknown> => !!o && typeof o === 'object')
      .map((o) => ({
        question: String(o.question ?? ''),
        answer: String(o.answer ?? ''),
        x: Number(o.x) || 0,
        y: Number(o.y) || 0,
      }))
      .filter(a => a.answer.trim() && a.x >= 0 && a.y >= 0)
  } catch { return [] }
}

function parseJsonMap(raw: string, validNames: string[]): Record<string, string> {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim()
  const start = cleaned.indexOf('{'); const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) return {}
  let obj: Record<string, unknown> = {}
  try { obj = JSON.parse(cleaned.slice(start, end + 1)) } catch { return {} }
  const valid = new Set(validNames)
  const result: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (valid.has(k) && v != null) result[k] = String(v)
  }
  return result
}
