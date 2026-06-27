// Row of mascot skin thumbnails at the bottom of the mascot pane. Today there's
// just the built-in SVG "Byte"; additional Rive skins appear here automatically
// once dropped into resources/mascot. The choice persists to ai_preferences
// (mascot_skin).
import { useEffect, useState } from 'react'
import { api } from '../../lib/ipc'
import type { MascotSkin } from '@shared/types/ipc'

export function SkinSelector({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [skins, setSkins] = useState<MascotSkin[]>([])

  useEffect(() => { void (async () => { const r = await api.ai.getSkins(); if (r.ok) setSkins(r.data) })() }, [])

  if (skins.length <= 1) return null   // nothing to choose between yet

  return (
    <div className="flex items-center justify-center gap-2 flex-wrap">
      {skins.map(s => (
        <button key={s.id} title={`${s.name} — ${s.description}`}
          onClick={() => onChange(s.id)}
          className={`w-7 h-7 rounded-full border-2 grid place-items-center text-[10px] ${
            value === s.id ? 'border-[var(--accent,#6366f1)]' : 'border-[var(--border)]'}`}
          style={{ background: s.builtin ? '#5b9bf0' : 'var(--surface-2)' }}>
          {s.builtin ? '🫧' : s.name.slice(0, 1)}
        </button>
      ))}
    </div>
  )
}
