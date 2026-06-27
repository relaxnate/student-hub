// Thin React binding over the persistent AI-chat store. The store (aiChatStore)
// owns all state + the live streaming so the conversation survives tab navigation;
// this hook just (1) kicks off one-time init, (2) maps the store's mascot
// "signals" to the page's CompanionRef. Keeping the same return shape means
// ChatInterface/AIHelper consume it exactly as before.
import { useEffect, useRef } from 'react'
import type { CompanionRef } from '../../components/ai/Companion'
import { useAIChatStore } from './aiChatStore'
export type { ChatTurn, ToolActivity } from './aiChatStore'

export function useAIChat(companionRef: React.RefObject<CompanionRef>) {
  const s = useAIChatStore()

  // One-time load (idempotent in the store) — restores the last active chat.
  useEffect(() => { void useAIChatStore.getState().init() }, [])

  // Mascot reactions: fire only when a signal counter actually advances, so
  // returning to the tab (a fresh mount reading the current counters) doesn't
  // replay the last reaction.
  const seen = useRef({ u: s.sigUserMsg, r: s.sigResponse, e: s.sigError })
  useEffect(() => {
    if (s.sigUserMsg !== seen.current.u) { seen.current.u = s.sigUserMsg; companionRef.current?.triggerUserMessage() }
  }, [s.sigUserMsg, companionRef])
  useEffect(() => {
    if (s.sigResponse !== seen.current.r) { seen.current.r = s.sigResponse; companionRef.current?.triggerResponseReady() }
  }, [s.sigResponse, companionRef])
  useEffect(() => {
    if (s.sigError !== seen.current.e) { seen.current.e = s.sigError; companionRef.current?.triggerError() }
  }, [s.sigError, companionRef])

  return s
}
