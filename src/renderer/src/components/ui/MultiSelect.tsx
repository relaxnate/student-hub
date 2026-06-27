import { useEffect, useRef, useState } from 'react'
import { ChevronDown, X, Check } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../../lib/utils'
import type { SelectOption } from './CustomSelect'

interface MultiSelectProps {
  options: SelectOption[]
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  label?: string
  disabled?: boolean
  className?: string
  /** Max chips shown in the trigger before collapsing to "+N more" */
  maxChips?: number
}

/**
 * Multi-select variant of CustomSelect. Same trigger/panel visual language but
 * with checkboxes in the panel and removable chips in the trigger.
 */
export function MultiSelect({
  options,
  values,
  onChange,
  placeholder = 'Select options',
  label,
  disabled = false,
  className = '',
  maxChips = 3,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)

  const selectedOptions = values
    .map((v) => options.find((o) => o.value === v))
    .filter(Boolean) as SelectOption[]

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (open) setActiveIndex(0)
  }, [open])

  function toggle(optValue: string) {
    if (values.includes(optValue)) {
      onChange(values.filter((v) => v !== optValue))
    } else {
      onChange([...values, optValue])
    }
  }

  function removeChip(optValue: string, e: React.MouseEvent) {
    e.stopPropagation()
    onChange(values.filter((v) => v !== optValue))
  }

  function nextEnabled(from: number, dir: 1 | -1): number {
    let i = from + dir
    while (i >= 0 && i < options.length) {
      if (!options[i].disabled) return i
      i += dir
    }
    return from
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (disabled) return
    if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
      e.preventDefault()
      setOpen(true)
      return
    }
    if (!open) return
    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        break
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex((i) => nextEnabled(i, 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex((i) => nextEnabled(i, -1))
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (activeIndex >= 0 && !options[activeIndex]?.disabled) {
          toggle(options[activeIndex].value)
        }
        break
    }
  }

  const visibleChips = selectedOptions.slice(0, maxChips)
  const overflowCount = selectedOptions.length - visibleChips.length

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      {label && (
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          {label}
        </label>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-multiselectable="true"
        className={cn(
          'flex w-full min-h-[42px] flex-wrap items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-sm',
          'transition-colors duration-[var(--dur-fast)] ease-[var(--ease-std)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50',
          'focus-visible:ring-offset-2 focus-visible:ring-offset-surface-950',
          disabled
            ? 'cursor-not-allowed border-white/[0.06] bg-surface-700/40'
            : 'cursor-pointer border-white/[0.10] bg-surface-700 hover:border-white/[0.20]',
          open && !disabled && 'border-accent-500/60',
        )}
      >
        {/* Chips */}
        {visibleChips.length > 0 ? (
          <>
            {visibleChips.map((opt) => (
              <span
                key={opt.value}
                className="inline-flex items-center gap-1 rounded-md bg-accent-500/15 border border-accent-500/30 px-2 py-0.5 text-xs text-accent-300"
              >
                {opt.label}
                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => removeChip(opt.value, e)}
                    className="ml-0.5 rounded-sm text-accent-400 hover:text-accent-200 focus-visible:outline-none"
                    aria-label={`Remove ${opt.label}`}
                  >
                    <X size={11} />
                  </button>
                )}
              </span>
            ))}
            {overflowCount > 0 && (
              <span className="text-xs text-zinc-400">+{overflowCount} more</span>
            )}
          </>
        ) : (
          <span className="text-zinc-500 px-1">{placeholder}</span>
        )}

        {/* Chevron always at the far right */}
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="ml-auto shrink-0 pl-1"
        >
          <ChevronDown size={16} className="text-zinc-400" />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            aria-multiselectable="true"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.22, 0.61, 0.36, 1] }}
            className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-white/[0.09] bg-surface-800/95 p-1 shadow-xl shadow-black/40 backdrop-blur-md max-h-60 overflow-y-auto"
          >
            {options.map((opt, i) => {
              const checked = values.includes(opt.value)
              return (
                <li
                  key={opt.value}
                  role="option"
                  aria-selected={checked}
                  aria-disabled={opt.disabled}
                  onMouseEnter={() => !opt.disabled && setActiveIndex(i)}
                  onClick={() => !opt.disabled && toggle(opt.value)}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm',
                    'transition-colors duration-[var(--dur-fast)]',
                    opt.disabled
                      ? 'cursor-not-allowed text-zinc-600'
                      : i === activeIndex
                      ? 'bg-surface-600 text-zinc-50'
                      : 'text-zinc-200 hover:bg-surface-600/60',
                  )}
                >
                  {/* Checkbox */}
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] transition-colors duration-[var(--dur-fast)]',
                      checked
                        ? 'bg-accent-500 text-white'
                        : 'bg-surface-600 border border-white/[0.14] text-transparent',
                      opt.disabled && 'opacity-40',
                    )}
                  >
                    <Check size={11} strokeWidth={3} className={checked ? 'opacity-100' : 'opacity-0'} />
                  </span>

                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate">{opt.label}</span>
                    {opt.description && (
                      <span className="shrink-0 text-xs text-zinc-500">{opt.description}</span>
                    )}
                  </span>
                </li>
              )
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
