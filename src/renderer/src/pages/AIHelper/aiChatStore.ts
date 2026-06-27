// Persistent controller store for the AI Helper chat.
//
// WHY A STORE (not component state): the AI Helper page unmounts when the user
// switches tabs, which previously wiped the in-progress chat. This Zustand store
// lives at MODULE scope, so the conversation, streaming text, and even the live
// IPC stream listeners survive navigation — the user can leave mid-answer and come
// back to find it exactly as they left it (and still streaming). The active
// conversation id is also persisted to ai_preferences so a chat is restored across
// full app restarts. Mascot reactions are surfaced as incrementing signals the
// AIHelper component maps to its CompanionRef (keeps the mascot ref out of the store).
import { create } from 'zustand'
import { api } from '../../lib/ipc'
import type {
  AIProvider, ModelInfo, UsageFraction, AIConversation, AIMessage, ChatMessage,
  StreamChunkEvent, StreamDoneEvent, StreamErrorEvent, ToolCallEvent, ToolResultEvent, ProposedFileEdit,
  PDFProposal, PDFPlacement, PDFFieldAnswer,
} from '@shared/types/ipc'

export interface ChatTurn { role: 'user' | 'assistant'; content: string }
export interface ToolActivity { id: string; name: string; status: string; content?: string; proposal?: ProposedFileEdit }

const ACTIVE_CONV_PREF = 'active_conversation_id'

// ── Module-scope plumbing (survives component unmount; not React state) ──────
let streamUnsubs: (() => void)[] = []
let listenTimer: ReturnType<typeof setTimeout> | null = null
let usagePollStarted = false
let initStarted = false

function clearStreamSubs() { streamUnsubs.forEach(u => u()); streamUnsubs = [] }
function persistActive(id: string | undefined) { void api.ai.setPreference(ACTIVE_CONV_PREF, id ?? '') }

// Map stored messages → chat turns: drop system prompts and any empty assistant
// turn (e.g. a row created right before the app was closed mid-stream) so a
// restored conversation never shows a blank bubble.
function toTurns(data: AIMessage[]): ChatTurn[] {
  return data
    .filter((m: AIMessage) => m.role !== 'system' && !(m.role === 'assistant' && !m.content.trim()))
    .map((m: AIMessage) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
}

interface AIChatState {
  providers: AIProvider[]
  provider: string
  models: ModelInfo[]
  model: string
  conversations: AIConversation[]
  activeId: string | undefined
  messages: ChatTurn[]
  streamingText: string
  isStreaming: boolean
  isThinking: boolean
  isListening: boolean
  tools: ToolActivity[]
  usage: UsageFraction | null
  error: string | null
  pdfProposal: PDFProposal | null
  pdfBusy: boolean
  pdfSaved: string | null
  // Mascot reaction signals (monotonic counters the component watches).
  sigUserMsg: number
  sigResponse: number
  sigError: number
  streamId: string | null

  init: () => Promise<void>
  refreshProviders: () => Promise<void>
  refreshConversations: () => Promise<void>
  refreshUsage: () => Promise<void>
  setProvider: (p: string) => Promise<void>
  selectModel: (m: string) => void
  noteTyping: (hasContent: boolean) => void
  send: (text: string) => Promise<void>
  stop: () => Promise<void>
  newChat: () => void
  loadConversation: (id: string) => Promise<void>
  deleteConversation: (id: string) => Promise<void>
  deleteAll: () => Promise<void>
  archiveConversation: (id: string, archived: boolean) => Promise<void>
  applyEdit: (t: ToolActivity) => Promise<void>
  dismissEdit: (t: ToolActivity) => void
  analyzePdf: (mode: 'autofill' | 'help') => Promise<void>
  applyPdf: () => Promise<void>
  dismissPdf: () => void
  openSaved: (p: string) => void
  revealSaved: (p: string) => void
}

export const useAIChatStore = create<AIChatState>((set, get) => ({
  providers: [],
  provider: 'studenthub',   // built-in offline assistant — $0, works out of the box
  models: [],
  model: '',
  conversations: [],
  activeId: undefined,
  messages: [],
  streamingText: '',
  isStreaming: false,
  isThinking: false,
  isListening: false,
  tools: [],
  usage: null,
  error: null,
  pdfProposal: null,
  pdfBusy: false,
  pdfSaved: null,
  sigUserMsg: 0,
  sigResponse: 0,
  sigError: 0,
  streamId: null,

  init: async () => {
    if (initStarted) { void get().refreshConversations(); return }
    initStarted = true

    const p = await api.ai.getProviders()
    if (p.ok) set({ providers: p.data })

    const prefs = await api.ai.getPreferences()
    const data = prefs.ok ? prefs.data : {}
    const provider = data.active_provider || get().provider
    set({ provider })

    const mr = await api.ai.getModels(provider)
    const models: ModelInfo[] = mr.ok ? mr.data : []
    const model = models.find((m: ModelInfo) => m.id === data.active_model)?.id ?? models[0]?.id ?? ''
    set({ models, model })

    await get().refreshConversations()
    await get().refreshUsage()

    // Restore the last active conversation so the chat is exactly where they left it.
    const activeId = data[ACTIVE_CONV_PREF]
    if (activeId) {
      const r = await api.ai.getMessages(activeId)
      if (r.ok && r.data.length) {
        const turns = toTurns(r.data)
        if (turns.length) set({ activeId, messages: turns })
      }
    }

    if (!usagePollStarted) {
      usagePollStarted = true
      setInterval(() => void get().refreshUsage(), 30_000)
    }
  },

  refreshProviders: async () => {
    const p = await api.ai.getProviders(); if (p.ok) set({ providers: p.data })
    const r = await api.ai.getModels(get().provider); if (r.ok) set({ models: r.data })
  },
  refreshConversations: async () => {
    const r = await api.ai.getConversations(); if (r.ok) set({ conversations: r.data })
  },
  refreshUsage: async () => {
    const r = await api.ai.getUsageFraction(); if (r.ok) set({ usage: r.data })
  },

  setProvider: async (p: string) => {
    set({ provider: p }); void api.ai.setPreference('active_provider', p)
    const r = await api.ai.getModels(p)
    if (r.ok) {
      const models: ModelInfo[] = r.data
      set({ models, model: models.find((m: ModelInfo) => m.id === get().model)?.id ?? models[0]?.id ?? '' })
    } else set({ models: [], model: '' })
  },
  selectModel: (m: string) => { set({ model: m }); void api.ai.setPreference('active_model', m) },

  noteTyping: (hasContent: boolean) => {
    set({ isListening: hasContent })
    if (listenTimer) clearTimeout(listenTimer)
    if (hasContent) listenTimer = setTimeout(() => set({ isListening: false }), 2000)
  },

  send: async (text: string) => {
    const st = get()
    if (!text.trim() || st.isStreaming || !st.model) return
    set({ error: null, tools: [], sigUserMsg: st.sigUserMsg + 1 })
    const nextMessages: ChatTurn[] = [...st.messages, { role: 'user', content: text.trim() }]
    set({ messages: nextMessages, streamingText: '', isStreaming: true, isThinking: true, isListening: false })

    const streamId = crypto.randomUUID()
    set({ streamId })
    const wire: ChatMessage[] = nextMessages.map(m => ({ role: m.role, content: m.content }))
    let acc = ''
    let thinkingCleared = false

    clearStreamSubs()
    streamUnsubs = [
      api.ai.onStreamChunk((d: StreamChunkEvent) => {
        if (d.streamId !== streamId) return
        if (!thinkingCleared) { thinkingCleared = true; set({ isThinking: false }) }
        acc += d.delta; set({ streamingText: acc })
      }),
      api.ai.onStreamDone((d: StreamDoneEvent) => {
        if (d.streamId !== streamId) return
        set(s => ({
          messages: [...s.messages, { role: 'assistant', content: d.content || acc }],
          streamingText: '', isStreaming: false, isThinking: false,
          activeId: d.conversationId, sigResponse: s.sigResponse + 1,
        }))
        persistActive(d.conversationId)
        clearStreamSubs(); void get().refreshUsage(); void get().refreshConversations()
      }),
      api.ai.onStreamError((d: StreamErrorEvent) => {
        if (d.streamId !== streamId) return
        set(s => ({ error: d.error, isStreaming: false, isThinking: false, sigError: s.sigError + 1 }))
        clearStreamSubs(); void get().refreshUsage()
      }),
      api.ai.onToolCall((d: ToolCallEvent) => {
        if (d.streamId !== streamId) return
        set(s => ({ tools: [...s.tools, { id: d.id, name: d.name, status: d.status, proposal: d.proposal }] }))
      }),
      api.ai.onToolResult((d: ToolResultEvent) => {
        if (d.streamId !== streamId) return
        set(s => ({ tools: s.tools.map(x => x.id === d.id ? { ...x, status: 'done', content: d.content } : x) }))
      }),
    ]

    const r = await api.ai.startStream({ streamId, provider: st.provider, model: st.model, messages: wire, conversationId: st.activeId })
    if (!r.ok) { set({ error: r.error, isStreaming: false, isThinking: false }); clearStreamSubs() }
  },

  stop: async () => {
    const id = get().streamId
    if (id) await api.ai.cancelStream(id)
    set({ isStreaming: false, isThinking: false }); clearStreamSubs()
  },

  newChat: () => {
    set({ activeId: undefined, messages: [], streamingText: '', tools: [], error: null })
    persistActive(undefined)
  },

  loadConversation: async (id: string) => {
    const r = await api.ai.getMessages(id)
    if (r.ok) {
      set({ messages: toTurns(r.data), activeId: id, streamingText: '', tools: [], error: null })
      persistActive(id)
    }
  },

  deleteConversation: async (id: string) => {
    await api.ai.deleteConversation(id)
    if (id === get().activeId) get().newChat()
    await get().refreshConversations()
  },

  deleteAll: async () => {
    await api.ai.deleteAllConversations(); get().newChat(); await get().refreshConversations()
  },

  archiveConversation: async (id: string, archived: boolean) => {
    await api.ai.archiveConversation(id, archived)
    if (archived && id === get().activeId) get().newChat()
    await get().refreshConversations()
  },

  applyEdit: async (t: ToolActivity) => {
    if (!t.proposal) return
    const r = await api.ai.applyFileEdit({ filePath: t.proposal.filePath, proposedContent: t.proposal.proposedContent })
    set(s => ({ tools: s.tools.map(x => x.id === t.id
      ? { ...x, status: r.ok ? 'applied' : 'failed', content: r.ok ? `Saved ${t.proposal!.filePath}` : r.error } : x) }))
  },
  dismissEdit: (t: ToolActivity) => {
    set(s => ({ tools: s.tools.map(x => x.id === t.id ? { ...x, status: 'dismissed' } : x) }))
  },

  // ── PDF intelligence (unchanged logic; mascot via signals) ──
  analyzePdf: async (mode: 'autofill' | 'help') => {
    set(s => ({ pdfSaved: null, error: null, pdfBusy: true, sigUserMsg: s.sigUserMsg + 1 }))
    try {
      const picked = await api.pdf.pick()
      if (!picked.ok) { set(s => ({ error: picked.error, sigError: s.sigError + 1 })); return }
      if (!picked.data) return
      const { filePath, fileName, kind, base64, outputPath } = picked.data

      if (kind === 'fillable') {
        const r = await api.pdf.analyzeFillable({ filePath, mode })
        if (!r.ok) { set(s => ({ error: r.error, sigError: s.sigError + 1 })); return }
        set({ pdfProposal: r.data }); return
      }

      const { analyzeFlatPdf, composePreviews } = await import('../../lib/pdf/pdfAnalyze')
      const analysis = await analyzeFlatPdf(base64)
      try {
        if (mode === 'help') {
          const qs = analysis.slots.map(s => s.question).slice(0, 20)
          set({ pdfProposal: {
            filePath, outputPath, fileName, kind: 'flat', fieldCount: analysis.slots.length, answers: [],
            experimental: true, mode, detection: 'textlayer',
            note: analysis.slots.length
              ? `I found ${analysis.slots.length} answer spots (e.g. ${qs.slice(0, 5).join(' · ')}). Switch to Auto-fill to place answers. (Help mode never modifies the file.)`
              : 'I could not find fill-in spots in this PDF’s text. If it’s a photo/scan, Auto-fill will try image reading instead.',
          } })
          return
        }

        const placements: PDFPlacement[] = []
        const answersForCard: PDFFieldAnswer[] = []
        if (analysis.slots.length) {
          const ar = await api.pdf.answer({ questions: analysis.slots.map(s => s.question) })
          const answers = ar.ok ? ar.data : []
          analysis.slots.forEach((s, i) => {
            const ans = (answers[i] ?? '').trim()
            if (!ans) return
            placements.push({ page: s.page, x: s.x, y: s.y, text: ans, size: s.size, maxWidth: s.maxWidth })
            answersForCard.push({ name: `slot-${i}`, question: s.question, answer: ans, type: 'text' })
          })
        }

        let usedVision = false
        for (const p of analysis.scannedPages) {
          const dim = analysis.pageDims[p]
          if (!dim) continue
          try {
            const imageDataUrl = await analysis.renderPageDataUrl(p, 1.6)
            const vr = await api.pdf.visionAnswer({ imageDataUrl })
            if (!vr.ok) { if (!placements.length) set({ error: vr.error }); continue }
            for (const a of vr.data) {
              usedVision = true
              const x = (a.x / 1000) * dim.width
              const y = dim.height - (a.y / 1000) * dim.height
              placements.push({ page: p, x, y, text: a.answer, size: 11, maxWidth: Math.max(dim.width - x - 8, 30) })
              answersForCard.push({ name: `vision-${p}-${answersForCard.length}`, question: a.question, answer: a.answer, type: 'text' })
            }
          } catch (e) { if (!placements.length) set({ error: String(e) }) }
        }

        const previews = placements.length ? await composePreviews(analysis, placements) : []
        set({ pdfProposal: {
          filePath, outputPath, fileName, kind: 'flat',
          fieldCount: placements.length, answers: answersForCard, placements, previews,
          experimental: true, mode, detection: usedVision ? (analysis.slots.length ? 'mixed' : 'vision') : 'textlayer',
          note: placements.length ? undefined
            : 'I could not place any answers. If this is a scanned/photo PDF, pick a vision-capable model (e.g. Gemini or GPT-4o) in the gear settings and try again.',
        } })
      } finally {
        analysis.dispose()
      }
    } catch (err) {
      set(s => ({ error: String(err), sigError: s.sigError + 1 }))
    } finally {
      set({ pdfBusy: false })
    }
  },

  applyPdf: async () => {
    const proposal = get().pdfProposal
    if (!proposal) return
    set({ pdfBusy: true })
    const r = proposal.kind === 'fillable'
      ? await api.pdf.confirmApply({ proposal })
      : await api.pdf.stamp({ filePath: proposal.filePath, outputPath: proposal.outputPath, placements: proposal.placements ?? [] })
    set({ pdfBusy: false })
    if (!r.ok) { set({ error: r.error }); return }
    set(s => ({ pdfSaved: r.data.path, pdfProposal: null, sigResponse: s.sigResponse + 1 }))
  },

  dismissPdf: () => set({ pdfProposal: null }),
  openSaved: (p: string) => { void api.pdf.open(p) },
  revealSaved: (p: string) => { void api.pdf.reveal(p) },
}))
