import { useMemo, useState } from 'react'
import { Quote as QuoteIcon, RefreshCw } from 'lucide-react'
import type { WidgetProps } from '../types'

// Offline rotating motivational quotes — no network, no config. A fresh quote is
// picked per mount (stable via useMemo) with a manual shuffle button.
const QUOTES: { text: string; author: string }[] = [
  { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
  { text: "Don't watch the clock; do what it does. Keep going.", author: 'Sam Levenson' },
  { text: 'Success is the sum of small efforts repeated day in and day out.', author: 'Robert Collier' },
  { text: 'It always seems impossible until it’s done.', author: 'Nelson Mandela' },
  { text: 'Quality is not an act, it is a habit.', author: 'Aristotle' },
  { text: 'Believe you can and you’re halfway there.', author: 'Theodore Roosevelt' },
  { text: 'Little by little, one travels far.', author: 'J.R.R. Tolkien' },
  { text: 'Discipline is the bridge between goals and accomplishment.', author: 'Jim Rohn' },
  { text: 'The future depends on what you do today.', author: 'Mahatma Gandhi' },
  { text: 'Strive for progress, not perfection.', author: 'Unknown' },
]

export default function QuoteWidget(_props: WidgetProps) {
  const [seed, setSeed] = useState(0)
  const quote = useMemo(() => QUOTES[Math.floor(Math.random() * QUOTES.length)], [seed])

  return (
    <div className="h-full flex flex-col justify-center gap-2 relative group">
      <QuoteIcon size={16} className="text-accent-400/70 shrink-0" />
      <p className="t-body text-zinc-200 leading-snug">{quote.text}</p>
      <p className="t-caption text-zinc-500">— {quote.author}</p>
      <button onClick={() => setSeed(s => s + 1)} title="New quote"
        className="absolute top-0 right-0 p-1 text-zinc-600 hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity">
        <RefreshCw size={12} />
      </button>
    </div>
  )
}
