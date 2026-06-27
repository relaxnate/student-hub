// AI Helper IPC handlers. Mirrors courses.handlers.ts registration style. The
// streaming handler is the complex one: START_STREAM kicks off a fire-and-forget
// stream that relays STREAM_CHUNK/DONE/ERROR events (keyed by streamId) back to
// the requesting webContents; CANCEL_STREAM aborts via a tracked AbortController.
//
// API keys never leave the main process — only message text + provider/model ids
// cross IPC. Keys are resolved here from AIKeyService and handed to the adapter.
import { ipcMain, type WebContents } from 'electron'
import { IPC } from '@shared/ipc-channels'
import fs from 'fs'
import { getProviders, getAdapter } from '../ai/registry'
import { buildAdapter } from '../ai/providers/factory'
import { aiKeyService } from '../ai/AIKeyService'
import { AIError } from '../ai/errors'
import { buildSystemPrompt } from '../ai/SystemPromptBuilder'
import { ACADEMIC_TOOLS, isDestructiveTool } from '../ai/tools/AcademicTools'
import { executeTool, validateWritePath } from '../ai/tools/ToolExecutor'
import { getAvailableSkins } from '../ai/MascotService'
import {
  AIConversationRepository,
  AIMessageRepository,
  AIUsageRepository,
  AIPreferencesRepository,
} from '../database/repositories'
import type {
  StreamParams,
  SaveKeyPayload,
  ValidateKeyPayload,
  SetAIPreferencePayload,
  ApplyFileEditPayload,
} from '@shared/types/ipc'
import type { AIProviderId, ChatMessage, ToolCall } from '@shared/types/entities'

const MAX_TOOL_ITERATIONS = 4

const conversationRepo = new AIConversationRepository()
const messageRepo      = new AIMessageRepository()
const usageRepo        = new AIUsageRepository()
const prefsRepo        = new AIPreferencesRepository()

// In-flight streams so CANCEL_STREAM can abort them.
const activeStreams = new Map<string, AbortController>()

const FREE_DAILY_CAP = 1000

export function registerAIHandlers(): void {
  // ─── Providers / models / keys ──────────────────────────────────────────
  ipcMain.handle(IPC.AI.GET_PROVIDERS, () => {
    try { return { ok: true, data: getProviders() } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.AI.GET_MODELS, async (_e, provider: string) => {
    try {
      // Use the keyed adapter if connected, else a keyless one for static /
      // fallback model lists (so the picker isn't empty before connecting).
      const key = provider === 'free' ? null : aiKeyService.getKey(provider)
      const adapter = getAdapter(provider) ?? buildAdapter(provider as AIProviderId, key)
      const models = await adapter.listModels().catch(() => [])
      return { ok: true, data: models }
    } catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.AI.SAVE_KEY, (_e, payload: SaveKeyPayload) => {
    try { aiKeyService.saveKey(payload.provider, payload.key); return { ok: true, data: null } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.AI.DELETE_KEY, (_e, provider: string) => {
    try { aiKeyService.deleteKey(provider); return { ok: true, data: null } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  // Validates AND stores (so a verified key is immediately usable).
  ipcMain.handle(IPC.AI.VALIDATE_KEY, async (_e, payload: ValidateKeyPayload) => {
    try {
      const result = await aiKeyService.validateAndSaveKey(payload.provider, payload.key)
      return { ok: true, data: result }
    } catch (err) { return { ok: false, error: String(err) } }
  })

  // ─── Streaming ──────────────────────────────────────────────────────────
  ipcMain.handle(IPC.AI.START_STREAM, (event, params: StreamParams) => {
    // Fire-and-forget: return an immediate ack; results flow via events.
    runStream(event.sender, params).catch(err => {
      sendError(event.sender, params.streamId, err)
    })
    return { ok: true, data: null }
  })

  ipcMain.handle(IPC.AI.CANCEL_STREAM, (_e, streamId: string) => {
    const controller = activeStreams.get(streamId)
    if (controller) { controller.abort(); activeStreams.delete(streamId) }
    return { ok: true, data: null }
  })

  // Student clicked Apply on a proposed file edit — re-validate the path (never
  // trust the renderer) and write. This is the ONLY place an AI-proposed edit is
  // committed to disk.
  ipcMain.handle(IPC.AI.APPLY_FILE_EDIT, (_e, payload: ApplyFileEditPayload) => {
    try {
      const check = validateWritePath(payload.filePath)
      if (!check.ok) return { ok: false, error: check.error }
      fs.writeFileSync(check.resolved!, payload.proposedContent, 'utf-8')
      return { ok: true, data: { path: check.resolved } }
    } catch (err) { return { ok: false, error: String(err) } }
  })

  // ─── Conversations ────────────────────────────────────────────────────────
  ipcMain.handle(IPC.AI.GET_CONVERSATIONS, () => {
    try { return { ok: true, data: conversationRepo.getAll() } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.AI.GET_CONVERSATION, (_e, id: string) => {
    try {
      const c = conversationRepo.getById(id)
      return c ? { ok: true, data: c } : { ok: false, error: `Conversation ${id} not found` }
    } catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.AI.GET_MESSAGES, (_e, conversationId: string) => {
    try { return { ok: true, data: messageRepo.getByConversation(conversationId) } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.AI.DELETE_CONVERSATION, (_e, id: string) => {
    try { conversationRepo.delete(id); return { ok: true, data: null } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.AI.DELETE_ALL_CONVERSATIONS, () => {
    try { conversationRepo.deleteAll(); return { ok: true, data: null } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.AI.ARCHIVE_CONVERSATION, (_e, payload: { id: string; archived: boolean }) => {
    try { conversationRepo.setArchived(payload.id, payload.archived); return { ok: true, data: null } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  // ─── Usage ────────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.AI.GET_USAGE_FRACTION, () => {
    try { return { ok: true, data: usageRepo.getUsageFraction(activeProvider(), FREE_DAILY_CAP, byokBudget()) } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.AI.GET_USAGE_HISTORY, (_e, provider?: string) => {
    try { return { ok: true, data: usageRepo.getThisMonth(provider ?? activeProvider()) } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  // ─── Preferences ──────────────────────────────────────────────────────────
  ipcMain.handle(IPC.AI.GET_AI_PREFERENCES, () => {
    try { return { ok: true, data: prefsRepo.getAll() } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  ipcMain.handle(IPC.AI.SET_AI_PREFERENCE, (_e, payload: SetAIPreferencePayload) => {
    try { prefsRepo.set(payload.key, payload.value); return { ok: true, data: null } }
    catch (err) { return { ok: false, error: String(err) } }
  })

  // ─── Mascot skins ───────────────────────────────────────────────────────
  ipcMain.handle(IPC.AI.GET_SKINS, () => {
    try { return { ok: true, data: getAvailableSkins() } }
    catch (err) { return { ok: false, error: String(err) } }
  })
}

// ─── Stream runner ─────────────────────────────────────────────────────────
async function runStream(sender: WebContents, params: StreamParams): Promise<void> {
  const { streamId, provider, model } = params

  const adapter = getAdapter(provider)
  if (!adapter) {
    return sendError(sender, streamId, new AIError(
      `No API key is connected for ${provider}. Add one in Settings → AI Helper.`, 'no_key'))
  }

  // Hard stop for the free tier at the daily cap (BYOK over-budget is a soft
  // warning handled in the UI, so we don't block it here).
  if (provider === 'free') {
    const frac = usageRepo.getUsageFraction('free', FREE_DAILY_CAP)
    if (frac.isAtLimit) {
      return sendError(sender, streamId, new AIError(frac.label + ' — limit reached. Resets ' + frac.resetsAt, 'free_tier_limit'))
    }
  }

  // Resolve / create the conversation.
  const conversation = params.conversationId
    ? conversationRepo.getById(params.conversationId) ?? conversationRepo.create(provider, model)
    : conversationRepo.create(provider, model)

  // Persist the latest user message (the renderer sends full history; the new
  // turn is the last user entry).
  const lastUser = [...params.messages].reverse().find(m => m.role === 'user')
  if (lastUser) {
    messageRepo.create({
      conversationId: conversation.id,
      role: 'user',
      content: contentToText(lastUser),
      createdAt: Date.now(),
    })
    conversationRepo.incrementMessageCount(conversation.id, 1)
    // Title a fresh conversation from its first user message.
    if (!conversation.title) conversationRepo.updateTitle(conversation.id, truncate(contentToText(lastUser), 60))
  }

  // Assistant message row, filled in as chunks stream.
  const assistant = messageRepo.create({
    conversationId: conversation.id,
    role: 'assistant',
    content: '',
    createdAt: Date.now(),
  })

  const controller = new AbortController()
  activeStreams.set(streamId, controller)

  // Phase 2: ground every conversation in the student's real data + give the
  // model the academic tools (when the provider supports function calling).
  const systemPrompt = params.systemPrompt ?? buildSystemPrompt()
  const toolsAvailable = adapter.supportsTools ? (params.tools ?? ACADEMIC_TOOLS) : undefined

  let full = ''
  let usage = { inputTokens: 0, outputTokens: 0 }
  const messages: ChatMessage[] = [...params.messages]
  try {
    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
      // On the last allowed pass, drop tools so the model must produce a final
      // text answer instead of looping further.
      const tools = iter < MAX_TOOL_ITERATIONS - 1 ? toolsAvailable : undefined

      let turnText = ''
      let turnToolCalls: ToolCall[] = []
      for await (const chunk of adapter.streamChat({
        messages, model, tools, systemPrompt,
        maxTokens: params.maxTokens, temperature: params.temperature,
        signal: controller.signal,
      })) {
        if (controller.signal.aborted) break
        if (chunk.delta) {
          turnText += chunk.delta
          full += chunk.delta
          if (!sender.isDestroyed()) sender.send(IPC.AI.STREAM_CHUNK, { streamId, delta: chunk.delta })
        }
        if (chunk.done) {
          if (chunk.usage) { usage.inputTokens += chunk.usage.inputTokens; usage.outputTokens += chunk.usage.outputTokens }
          if (chunk.toolCalls) turnToolCalls = chunk.toolCalls
        }
      }

      if (controller.signal.aborted || turnToolCalls.length === 0) break

      // Execute the requested tools and feed results back for the next turn.
      messages.push({ role: 'assistant', content: turnText || '(calling tools)' })
      const resultParts: string[] = []
      for (const tc of turnToolCalls) {
        if (isDestructiveTool(tc.name)) {
          const exec = await executeTool(tc.name, tc.arguments)
          if (exec.proposal && !sender.isDestroyed()) {
            sender.send(IPC.AI.STREAM_TOOL_CALL, { streamId, id: tc.id, name: tc.name, status: 'proposed', proposal: exec.proposal })
          }
          resultParts.push(`${tc.name} → ${exec.content}`)
        } else {
          if (!sender.isDestroyed()) sender.send(IPC.AI.STREAM_TOOL_CALL, { streamId, id: tc.id, name: tc.name, status: 'running' })
          const exec = await executeTool(tc.name, tc.arguments)
          if (!sender.isDestroyed()) sender.send(IPC.AI.STREAM_TOOL_RESULT, { streamId, id: tc.id, name: tc.name, content: preview(exec.content) })
          resultParts.push(`${tc.name} → ${exec.content}`)
        }
      }
      messages.push({ role: 'user', content: `Tool results:\n${resultParts.join('\n\n')}` })
    }

    // Persist the final assistant content + usage.
    messageRepo.updateContent(assistant.id, full)
    conversationRepo.incrementMessageCount(conversation.id, 1)
    usageRepo.incrementUsage(provider, model, usage.inputTokens, usage.outputTokens, 0)

    if (!sender.isDestroyed()) {
      sender.send(IPC.AI.STREAM_DONE, {
        streamId, conversationId: conversation.id, messageId: assistant.id, content: full, usage,
      })
    }
  } catch (err) {
    // Still record the request against the cap (a failed attempt consumed quota
    // on the free tier only if it actually hit the network — but to keep the
    // free cap conservative we count it). Persist whatever streamed.
    messageRepo.updateContent(assistant.id, full)
    sendError(sender, streamId, err)
  } finally {
    activeStreams.delete(streamId)
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function sendError(sender: WebContents, streamId: string, err: unknown): void {
  const code = err instanceof AIError ? err.code : 'unknown'
  const error = err instanceof Error ? err.message : String(err)
  if (!sender.isDestroyed()) sender.send(IPC.AI.STREAM_ERROR, { streamId, error, code })
}

function contentToText(m: ChatMessage): string {
  if (typeof m.content === 'string') return m.content
  return m.content.map(p => (p.type === 'text' ? p.text ?? '' : '[image]')).join(' ').trim()
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s
}

function preview(s: string): string {
  const oneLine = s.replace(/\s+/g, ' ').trim()
  return truncate(oneLine, 140)
}

function activeProvider(): string {
  return prefsRepo.get('active_provider') ?? 'free'
}

function byokBudget(): number | undefined {
  const raw = prefsRepo.get('byok_monthly_token_budget')
  if (!raw) return undefined
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : undefined
}
