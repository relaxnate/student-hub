// The right pane of the AI Helper tab: model selector, scrollable message list
// (with live streaming + tool/proposed-edit cards), conversation history, an
// empty state with data-aware suggestions, and the input area. Presentational —
// all state/logic lives in useAIChat.
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Square, Paperclip, Plus, History, Trash2, X, Camera, FileText, Settings as SettingsIcon, Archive, ArchiveRestore, ChevronDown, ChevronRight } from 'lucide-react'
import type { useAIChat } from '../../pages/AIHelper/useAIChat'
import { PDFActionCard, PDFSavedCard } from './pdf/PDFActionCard'
import { CustomSelect } from '../ui/CustomSelect'
import { SearchableCombobox } from '../ui/SearchableCombobox'

type Chat = ReturnType<typeof useAIChat>

export function ChatInterface({ chat, suggestions, onAttach, onOpenSettings }: {
  chat: Chat
  suggestions: string[]
  onAttach?: (file: File) => void
  onOpenSettings?: () => void
}) {
  const [input, setInput] = useState('')
  const [showHistory, setShowHistory] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  // Autoscroll to newest.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [chat.messages, chat.streamingText, chat.tools])

  // Auto-grow textarea up to ~5 lines.
  useEffect(() => {
    const ta = taRef.current; if (!ta) return
    ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 130)}px`
  }, [input])

  function submit() {
    const text = input.trim()
    if (!text || chat.isStreaming) return
    void chat.send(text); setInput('')
  }

  const empty = chat.messages.length === 0 && !chat.streamingText
    && !chat.pdfProposal && !chat.pdfSaved && chat.tools.length === 0

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Top bar: model selector + history/new */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.08]">
        <CustomSelect
          value={chat.provider}
          onChange={chat.setProvider}
          options={chat.providers.map(p => ({
            value: p.id,
            label: p.displayName + (p.isFree ? ' (free)' : '') + (p.isConnected ? '' : ' — no key'),
            disabled: !p.isConnected,
          }))}
          className="w-40 shrink-0"
        />
        <SearchableCombobox
          value={chat.model}
          onChange={chat.selectModel}
          options={
            chat.models.length > 0
              ? chat.models.map(m => ({
                  value: m.id,
                  label: m.displayName + (m.supportsVision ? ' 📷' : '') + (m.isFree ? ' (free)' : ''),
                }))
              : [{ value: '', label: '— no models —', disabled: true }]
          }
          searchPlaceholder="Search models…"
          className="flex-1 min-w-0"
        />
        <button title="Conversation history" onClick={() => setShowHistory(s => !s)}
          className="p-1.5 rounded hover:bg-surface-700/60"><History size={16} /></button>
        <button title="New chat" onClick={chat.newChat}
          className="p-1.5 rounded hover:bg-surface-700/60"><Plus size={16} /></button>
        {onOpenSettings && (
          <button title="AI Helper settings — API keys, models, mascot" onClick={onOpenSettings}
            className="p-1.5 rounded hover:bg-surface-700/60"><SettingsIcon size={16} /></button>
        )}
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Chat list panel */}
        {showHistory && (
          <ChatList chat={chat} showArchived={showArchived} setShowArchived={setShowArchived} />
        )}

        {/* Messages */}
        <div ref={listRef} className="flex-1 min-w-0 overflow-y-auto p-4 space-y-3">
          {empty ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4">
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
                className="text-sm text-[var(--text-secondary)] max-w-sm">
                Hi, I’m <b>Byte</b> — your study companion. I can see your real Canvas data. Ask me anything.
              </motion.div>
              <div className="flex flex-col gap-2 w-full max-w-sm">
                {suggestions.map((s, i) => (
                  <motion.button key={i} onClick={() => { setInput(''); void chat.send(s) }}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: 0.1 + i * 0.07 }}
                    whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.98 }}
                    className="text-left text-sm rounded-lg border border-white/[0.08] px-3 py-2 hover:bg-surface-700/60 hover:border-[var(--accent,#6366f1)] transition-colors">{s}</motion.button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {chat.messages.map((m, i) => (
                <Bubble key={i} role={m.role}>{m.content}</Bubble>
              ))}
              {chat.tools.map(t => <ToolCard key={t.id} t={t} chat={chat} />)}
              {chat.pdfProposal && (
                <PDFActionCard proposal={chat.pdfProposal} busy={chat.pdfBusy}
                  onApply={() => void chat.applyPdf()} onDismiss={chat.dismissPdf} />
              )}
              {chat.pdfSaved && (
                <PDFSavedCard path={chat.pdfSaved}
                  onOpen={() => chat.openSaved(chat.pdfSaved!)} onReveal={() => chat.revealSaved(chat.pdfSaved!)} />
              )}
              {chat.isThinking && <ThinkingBubble />}
              {chat.isStreaming && chat.streamingText && (
                <Bubble role="assistant">
                  {chat.streamingText}
                  <motion.span className="inline-block w-[3px] h-4 ml-0.5 align-middle rounded-full bg-[var(--accent,#6366f1)]"
                    animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 0.9, repeat: Infinity }} />
                </Bubble>
              )}
              {chat.error && (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  className="text-xs text-[var(--status-error,#ef4444)]">⚠ {chat.error}</motion.div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-white/[0.08] p-3">
        {/* PDF tools (experimental) */}
        <div className="flex items-center gap-2 mb-2 text-[11px]">
          <FileText size={13} className="text-[var(--text-secondary)]" />
          <button onClick={() => void chat.analyzePdf('autofill')} disabled={chat.pdfBusy}
            className="px-2 py-1 rounded border border-white/[0.08] hover:bg-surface-700/60 disabled:opacity-50">Auto-fill a PDF</button>
          <button onClick={() => void chat.analyzePdf('help')} disabled={chat.pdfBusy}
            className="px-2 py-1 rounded border border-white/[0.08] hover:bg-surface-700/60 disabled:opacity-50">Help me with a PDF</button>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--status-warning,#f59e0b)] text-black">Experimental</span>
        </div>
        <div className="flex items-end gap-2">
          <button title="Attach a PDF, image, or text file" onClick={() => fileRef.current?.click()}
            className="p-2 rounded hover:bg-surface-700/60 shrink-0"><Paperclip size={16} /></button>
          <input ref={fileRef} type="file" accept=".pdf,.txt,.md,image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onAttach?.(f); e.currentTarget.value = '' }} />
          <textarea
            ref={taRef} rows={1} value={input}
            onChange={e => { setInput(e.target.value); chat.noteTyping(!!e.target.value) }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
            placeholder="Ask Byte…  (Enter to send, Shift+Enter for newline)"
            className="flex-1 resize-none bg-[var(--surface-2)] border border-white/[0.08] rounded-lg px-3 py-2 text-sm leading-snug max-h-[130px]" />
          {chat.isStreaming
            ? <button onClick={() => void chat.stop()} title="Stop" className="p-2 rounded-lg bg-[var(--status-error,#ef4444)] text-white shrink-0"><Square size={16} /></button>
            : <button onClick={submit} disabled={!input.trim() || !chat.model} title="Send" className="p-2 rounded-lg bg-[var(--accent,#6366f1)] text-white disabled:opacity-40 shrink-0"><Send size={16} /></button>}
        </div>
        {input.length > 600 && <div className="text-[11px] text-[var(--text-secondary)] mt-1 text-right">{input.length} chars</div>}
        <div className="text-[10px] text-[var(--text-secondary)] mt-1 flex items-center gap-1">
          <Camera size={11} /> models marked 📷 accept images. Byte sees your Canvas data and proposes edits before changing anything.
        </div>
      </div>
    </div>
  )
}

// The left chat-list panel: new chat, the active conversations, and a collapsible
// Archived section. Per-row hover actions archive/unarchive or delete.
function ChatList({ chat, showArchived, setShowArchived }: {
  chat: Chat; showArchived: boolean; setShowArchived: (v: boolean) => void
}) {
  const active = chat.conversations.filter(c => !c.isArchived)
  const archived = chat.conversations.filter(c => c.isArchived)
  return (
    <div className="w-52 border-r border-white/[0.08] overflow-y-auto p-2 space-y-0.5 shrink-0">
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wide">Chats</span>
        <button title="New chat" onClick={chat.newChat}
          className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded hover:bg-surface-700/60 text-[var(--accent,#6366f1)]">
          <Plus size={13} /> New
        </button>
      </div>

      {active.length === 0 && <div className="text-xs text-[var(--text-secondary)] p-2">No chats yet — say hi to Byte.</div>}
      {active.map(c => <ChatRow key={c.id} c={c} chat={chat} archived={false} />)}

      {archived.length > 0 && (
        <div className="pt-2">
          <button onClick={() => setShowArchived(!showArchived)}
            className="w-full flex items-center gap-1 text-[11px] text-[var(--text-secondary)] px-1 py-1 hover:text-[var(--text)]">
            {showArchived ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Archived ({archived.length})
          </button>
          {showArchived && archived.map(c => <ChatRow key={c.id} c={c} chat={chat} archived />)}
        </div>
      )}

      {chat.conversations.length > 0 && (
        <button onClick={() => void chat.deleteAll()}
          className="w-full mt-2 flex items-center justify-center gap-1 text-[11px] text-[var(--text-secondary)] hover:text-[var(--status-error,#ef4444)]">
          <Trash2 size={12} /> Clear all
        </button>
      )}
    </div>
  )
}

function ChatRow({ c, chat, archived }: { c: Chat['conversations'][number]; chat: Chat; archived: boolean }) {
  return (
    <div
      className={`group flex items-center gap-1 rounded px-2 py-1.5 text-xs cursor-pointer hover:bg-surface-700/60 ${
        c.id === chat.activeId ? 'bg-[var(--surface-2)] ring-1 ring-[var(--accent,#6366f1)]' : ''}`}
      onClick={() => void chat.loadConversation(c.id)}>
      <span className="flex-1 truncate">{c.title ?? 'New chat'}</span>
      <button title={archived ? 'Unarchive' : 'Archive for later'}
        onClick={e => { e.stopPropagation(); void chat.archiveConversation(c.id, !archived) }}
        className="opacity-0 group-hover:opacity-100 text-[var(--text-secondary)] hover:text-[var(--accent,#6366f1)]">
        {archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
      </button>
      <button title="Delete chat"
        onClick={e => { e.stopPropagation(); void chat.deleteConversation(c.id) }}
        className="opacity-0 group-hover:opacity-100 text-[var(--text-secondary)] hover:text-[var(--status-error,#ef4444)]"><X size={13} /></button>
    </div>
  )
}

function Bubble({ role, children }: { role: 'user' | 'assistant'; children: React.ReactNode }) {
  const isUser = role === 'user'
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className={isUser ? 'flex justify-end' : 'flex justify-start'}>
      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words shadow-sm ${
        isUser
          ? 'bg-[var(--accent,#6366f1)] text-white rounded-br-md'
          : 'bg-[var(--surface-2,rgba(255,255,255,0.06))] rounded-bl-md'}`}>
        {children}
      </div>
    </motion.div>
  )
}

// A floating "Byte is thinking…" indicator: three bouncing dots inside a softly
// glowing, gently floating bubble — shown before the first token streams in.
function ThinkingBubble() {
  return (
    <AnimatePresence>
      <motion.div className="flex justify-start"
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
        <motion.div
          className="flex items-center gap-2 rounded-2xl rounded-bl-md px-4 py-2.5 bg-[var(--surface-2,rgba(255,255,255,0.06))]"
          animate={{
            y: [0, -2.5, 0],
            boxShadow: [
              '0 0 0px rgba(99,102,241,0.0)',
              '0 0 18px -2px rgba(99,102,241,0.55)',
              '0 0 0px rgba(99,102,241,0.0)',
            ],
          }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}>
          <span className="text-xs text-[var(--text-secondary)]">Byte is thinking</span>
          <span className="flex items-center gap-1">
            {[0, 1, 2].map(i => (
              <motion.span key={i} className="w-1.5 h-1.5 rounded-full bg-[var(--accent,#6366f1)]"
                animate={{ y: [0, -4, 0], opacity: [0.45, 1, 0.45] }}
                transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut', delay: i * 0.16 }} />
            ))}
          </span>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function ToolCard({ t, chat }: { t: Chat['tools'][number]; chat: Chat }) {
  if (t.status === 'proposed' && t.proposal) {
    return (
      <div className="rounded-xl border border-[var(--accent,#6366f1)] bg-[var(--surface-2,rgba(255,255,255,0.04))] p-3 text-xs space-y-2">
        <div className="font-medium">✏️ Byte proposes an edit — review before applying</div>
        <div className="text-[var(--text-secondary)]"><b>File:</b> {t.proposal.filePath}</div>
        <div className="text-[var(--text-secondary)]"><b>Why:</b> {t.proposal.reason}</div>
        <pre className="max-h-40 overflow-auto bg-[var(--surface-1,rgba(0,0,0,0.2))] rounded p-2 whitespace-pre-wrap">{t.proposal.proposedContent.slice(0, 800)}</pre>
        <div className="flex gap-2">
          <button onClick={() => void chat.applyEdit(t)} className="px-3 py-1 rounded bg-[var(--accent,#6366f1)] text-white">Apply &amp; Save</button>
          <button onClick={() => chat.dismissEdit(t)} className="px-3 py-1 rounded border border-white/[0.08]">Dismiss</button>
        </div>
      </div>
    )
  }
  return (
    <div className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1.5">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--accent,#6366f1)]" />
      Tool: {t.name} {t.status === 'done' ? '✓' : '…'}{t.content ? ` — ${t.content}` : ''}
    </div>
  )
}
