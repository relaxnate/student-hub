import { cn } from '../../lib/utils'

// ─── Institution avatar (Phase 7) ───────────────────────────────────────────────
// Fully-offline institution "logo": deterministic initials + a stable colour
// hashed from the institution name. No network, no API key, no cache — two
// different schools on the same provider get distinct, consistent avatars.

// Words that shouldn't contribute an initial (so "University of Washington" → UW).
const STOP_WORDS = new Set([
  'of', 'the', 'at', 'for', 'and', 'a', 'an', 'in', 'on', '&',
  'university', 'college', 'school', 'institute', 'academy',
])

export function institutionInitials(name: string): string {
  const clean = name.trim()
  if (!clean) return '?'
  const words = clean.split(/[\s\-_]+/).filter(Boolean)
  const significant = words.filter(w => !STOP_WORDS.has(w.toLowerCase()))
  const pick = significant.length ? significant : words
  if (pick.length === 1) {
    // Single word → first two letters (e.g. "Moodle" → "MO").
    return pick[0].slice(0, 2).toUpperCase()
  }
  return (pick[0][0] + pick[pick.length - 1][0]).toUpperCase()
}

// Deterministic hue from the name so the same institution always looks the same.
function hashHue(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return Math.abs(h) % 360
}

export function InstitutionAvatar({ name, size = 36, className }: {
  name: string; size?: number; className?: string
}) {
  const initials = institutionInitials(name)
  const hue = hashHue(name)
  // Saturated, mid-dark fill keeps white text at AA contrast across all hues.
  const bg = `hsl(${hue} 52% 42%)`

  return (
    <div
      className={cn('rounded-xl flex items-center justify-center text-white font-bold shrink-0 select-none', className)}
      style={{
        width:    size,
        height:   size,
        background: bg,
        fontSize: Math.round(size * 0.4),
      }}
      title={name}
      aria-label={name}
    >
      {initials}
    </div>
  )
}
