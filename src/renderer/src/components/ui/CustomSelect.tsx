import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../../lib/utils'

export interface SelectOption {
  value: string
  label: string
  description?: string
  disabled?: boolean
}

interface CustomSelectProps {
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  disabled?: boolean
  className?: string
}

/**
 * Fully custom single-select dropdown. Replaces every native <select> in the app.
 * For multi-select use MultiSelect; for filterable use SearchableCombobox.
 */
export function CustomSelect({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  label,
  disabled = false,
  className = '',
}: CustomSelectProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Land keyboard focus on the currently-selected item when the panel opens.
  useEffect(() => {
    if (open) {
      const idx = options.findIndex((o) => o.value === value && !o.disabled)
      setActiveIndex(idx >= 0 ? idx : options.findIndex((o) => !o.disabled))
    }
  }, [open, options, value])

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
        e.preventDefault()
        if (activeIndex >= 0 && !options[activeIndex]?.disabled) {
          onChange(options[activeIndex].value)
          setOpen(false)
        }
        break
    }
  }

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
        className={cn(
          'flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-sm',
          'transition-colors duration-[var(--dur-fast)] ease-[var(--ease-std)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50',
          'focus-visible:ring-offset-2 focus-visible:ring-offset-surface-950',
          disabled
            ? 'cursor-not-allowed border-white/[0.06] bg-surface-700/40 text-zinc-500'
            : 'cursor-pointer border-white/[0.10] bg-surface-700 text-zinc-100 hover:border-white/[0.20]',
          open && !disabled && 'border-accent-500/60',
        )}
      >
        <span className={selected ? 'text-zinc-100' : 'text-zinc-500'}>
          {selected ? selected.label : placeholder}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          <ChevronDown size={16} className="text-zinc-400 shrink-0" />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.22, 0.61, 0.36, 1] }}
            className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-white/[0.09] bg-surface-800/95 p-1 shadow-xl shadow-black/40 backdrop-blur-md"
          >
            {options.map((opt, i) => (
              <li
                key={opt.value}
                role="option"
                aria-selected={opt.value === value}
                aria-disabled={opt.disabled}
                onMouseEnter={() => !opt.disabled && setActiveIndex(i)}
                onClick={() => {
                  if (!opt.disabled) {
                    onChange(opt.value)
                    setOpen(false)
                  }
                }}
                className={cn(
                  'flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm',
                  'transition-colors duration-[var(--dur-fast)]',
                  opt.disabled
                    ? 'cursor-not-allowed text-zinc-600'
                    : i === activeIndex
                    ? 'bg-surface-600 text-zinc-50'
                    : 'text-zinc-200 hover:bg-surface-600/60',
                )}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="truncate">{opt.label}</span>
                  {opt.description && (
                    <span className="shrink-0 text-xs text-zinc-500">{opt.description}</span>
                  )}
                </span>
                {opt.value === value && (
                  <Check size={14} className="text-accent-400 shrink-0 ml-2" />
                )}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
