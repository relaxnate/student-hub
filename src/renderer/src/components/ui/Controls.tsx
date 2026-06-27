import React from 'react'
import { Check } from 'lucide-react'
import { cn } from '../../lib/utils'

// ─── Phase-1 design-system form controls ──────────────────────────────────────
// Token-based, accessible, animation-token timed (no spring). These centralize
// the toggle/checkbox/select/progress patterns that pages previously hand-rolled,
// so future surfaces (Settings, widget config panels, dialogs) share one look.

// ─── Switch / Toggle ──────────────────────────────────────────────────────────
// 36×20 track, 16px thumb. Accent when on, surface track when off. Keyboard:
// the underlying <button> is focusable; Space/Enter activate it natively.
interface SwitchProps {
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
  id?: string
  'aria-label'?: string
}

export function Switch({ checked, onChange, disabled, id, ...aria }: SwitchProps) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={aria['aria-label']}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative w-9 h-5 rounded-full shrink-0 transition-colors duration-150 ease-[var(--ease-std)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-950',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        checked ? 'bg-accent-500' : 'bg-surface-600'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-150 ease-[var(--ease-out)]',
          checked ? 'translate-x-4' : 'translate-x-0'
        )}
      />
    </button>
  )
}

// ─── Checkbox ─────────────────────────────────────────────────────────────────
// 16×16. Accent fill + white check when on; surface fill + hairline when off.
interface CheckboxProps {
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
  id?: string
  'aria-label'?: string
}

export function Checkbox({ checked, onChange, disabled, id, ...aria }: CheckboxProps) {
  return (
    <button
      type="button"
      id={id}
      role="checkbox"
      aria-checked={checked}
      aria-label={aria['aria-label']}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'w-4 h-4 rounded-[4px] flex items-center justify-center shrink-0 transition-colors duration-100 ease-[var(--ease-std)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-950',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        checked ? 'bg-accent-500 text-white' : 'bg-surface-600 border border-white/[0.14] text-transparent'
      )}
    >
      <Check size={11} strokeWidth={3} className={checked ? 'opacity-100' : 'opacity-0'} />
    </button>
  )
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
// 4px track. Semantic tones map to status colors; default is accent.
type ProgressTone = 'accent' | 'success' | 'warning' | 'danger'
const TONE_FILL: Record<ProgressTone, string> = {
  accent:  'bg-accent-500',
  success: 'bg-green-500',
  warning: 'bg-amber-500',
  danger:  'bg-red-500',
}

interface ProgressProps {
  value: number          // current
  max?: number           // default 100
  tone?: ProgressTone
  className?: string
}

export function Progress({ value, max = 100, tone = 'accent', className }: ProgressProps) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('h-1 w-full rounded-sm bg-surface-600 overflow-hidden', className)}
    >
      <div
        className={cn('h-full rounded-sm transition-[width] duration-200 ease-[var(--ease-out)]', TONE_FILL[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
