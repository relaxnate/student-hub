import { useEffect, useRef, useState } from 'react'
import type { WidgetProps } from '../types'

// A free-text sticky note. Content lives in this instance's config (`text`),
// persisted (debounced) through setConfig → saveInstance.
export default function NotesWidget({ config, setConfig }: WidgetProps) {
  const initial = typeof config.text === 'string' ? config.text : ''
  const [text, setText] = useState(initial)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  // Keep in sync if the instance config changes externally (e.g. reload).
  useEffect(() => { setText(typeof config.text === 'string' ? config.text : '') }, [config.text])

  const onChange = (v: string) => {
    setText(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setConfig({ text: v }), 500)
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return (
    <textarea
      value={text}
      onChange={e => onChange(e.target.value)}
      placeholder="Jot something down…"
      className="h-full w-full resize-none bg-transparent text-zinc-200 t-body leading-relaxed
                 placeholder:text-zinc-600 focus:outline-none"
    />
  )
}
