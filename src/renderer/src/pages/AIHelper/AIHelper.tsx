// The AI Helper tab — two-pane layout: mascot Byte (left, fixed width) + chat
// (right). The page owns the CompanionRef and wires the streaming lifecycle (via
// useAIChat) to mascot reactions. The mascot pane can be disabled in Settings
// (ai preference `mascot_enabled`), leaving a full-width chat. Byte's look is
// customizable via the dresser (wardrobe) and persisted in `mascot_config`.
import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Shirt } from 'lucide-react'
import { api } from '../../lib/ipc'
import { Companion, type CompanionRef } from '../../components/ai/Companion'
import { UsageMeter } from '../../components/ai/UsageMeter'
import { ChatInterface } from '../../components/ai/ChatInterface'
import { AISettingsSection } from '../../components/ai/AISettingsSection'
import { MascotWardrobe } from '../../components/ai/MascotWardrobe'
import { parseMascotConfig, DEFAULT_MASCOT_CONFIG, type MascotConfig } from '../../components/ai/mascotCatalog'
import { useAIChat } from './useAIChat'

export default function AIHelper() {
  const companionRef = useRef<CompanionRef>(null)
  const chat = useAIChat(companionRef)

  const [mascotEnabled, setMascotEnabled] = useState(true)
  const [mascotConfig, setMascotConfig] = useState<MascotConfig>(DEFAULT_MASCOT_CONFIG)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [wardrobeOpen, setWardrobeOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([
    'What assignments do I have due this week?',
    'What is my current GPA?',
  ])

  // Load AI prefs (mascot on/off, wardrobe config) + build data-aware suggestions.
  useEffect(() => {
    void (async () => {
      const prefs = await api.ai.getPreferences()
      if (prefs.ok) {
        if (prefs.data.mascot_enabled === 'false') setMascotEnabled(false)
        setMascotConfig(parseMascotConfig(prefs.data.mascot_config))
      }
      const courses = await api.courses.getAll()
      const upcoming = await api.assignments.getUpcoming()
      const s: string[] = []
      if (upcoming.ok && upcoming.data.length) s.push('What assignments do I have due this week?')
      s.push('What is my current GPA?')
      if (courses.ok && courses.data.length) {
        const lowest = [...courses.data].filter(c => c.currentScore != null)
          .sort((a, b) => (a.currentScore ?? 100) - (b.currentScore ?? 100))[0]
        if (lowest) s.push(`How can I raise my ${lowest.name} grade?`)
      }
      if (s.length) setSuggestions(s.slice(0, 3))
    })()
  }, [])

  function changeMascotConfig(cfg: MascotConfig) {
    setMascotConfig(cfg)
    void api.ai.setPreference('mascot_config', JSON.stringify(cfg))
  }

  function onAttach(file: File) {
    companionRef.current?.triggerUserMessage()
    void chat.send(`I've attached "${file.name}". To auto-fill or get help with a PDF, use the PDF buttons just below the chat box — otherwise tell me what you'd like help with.`)
  }

  const usageFraction = chat.usage?.fraction ?? 0

  return (
    <div className="relative flex h-full min-h-0">
      {/* AI Helper settings (keys/provider/model/mascot) — opened from the gear in the chat top bar. */}
      <Dialog.Root open={settingsOpen} onOpenChange={o => { setSettingsOpen(o); if (!o) void chat.refreshProviders() }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[min(680px,92vw)] max-h-[88vh] overflow-y-auto rounded-2xl border border-white/[0.08] bg-surface-800 p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <Dialog.Title className="text-base font-semibold">AI Helper settings</Dialog.Title>
              <Dialog.Close asChild>
                <button className="p-1.5 rounded hover:bg-surface-700/60" aria-label="Close"><X size={16} /></button>
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">Configure AI Helper providers, API keys, model, and mascot.</Dialog.Description>
            <AISettingsSection />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Byte's wardrobe (dresser) */}
      <MascotWardrobe open={wardrobeOpen} onOpenChange={setWardrobeOpen} config={mascotConfig} onChange={changeMascotConfig} />

      {mascotEnabled && (
        <div className="w-[240px] shrink-0 border-r border-white/[0.08] flex flex-col items-center p-4 gap-4">
          <div className="flex-1 flex items-center justify-center w-full">
            <Companion
              ref={companionRef}
              usageFraction={usageFraction}
              isThinking={chat.isThinking}
              isListening={chat.isListening}
              onFileDropped={onAttach}
              size={180}
              config={mascotConfig}
            />
          </div>
          <div className="w-full">
            <UsageMeter usage={chat.usage} />
          </div>
          <button onClick={() => setWardrobeOpen(true)}
            className="w-full flex items-center justify-center gap-2 text-xs px-3 py-2 rounded-lg border border-white/[0.08] hover:bg-surface-700/60 hover:border-[var(--accent,#6366f1)] transition">
            <Shirt size={14} /> Customize Byte
          </button>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <ChatInterface chat={chat} suggestions={suggestions} onAttach={onAttach}
          onOpenSettings={() => setSettingsOpen(true)} />
      </div>
    </div>
  )
}
