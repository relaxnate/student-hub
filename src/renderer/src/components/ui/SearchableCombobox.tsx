import { useEffect, useRef, useState, useCallback } from 'react'
import { ChevronDown, Check, Search, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../../lib/utils'
import type { SelectOption } from './CustomSelect'

// ─── Filter primitives (exported for command palette reuse) ───────────────────

export type FilterFn = (option: SelectOption, query: string) => boolean

/** Default filter: case-insensitive substring match on label + description. */
export const defaultFilter: FilterFn = (opt, query) => {
  const q = query.toLowerCase()
  return (
    opt.label.toLowerCase().includes(q) ||
    (opt.description?.toLowerCase().includes(q) ?? false)
  )
}

/**
 * Wraps a label string in a React node where the matched substring is
 * highlighted. Safe to use on any string — returns plain text when no match.
 * Exported so the command palette can highlight its own results.
 */
export function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-transparent text-accent-300 font-semibold">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}

// ─── FilterableList — reusable panel sub-component ───────────────────────────
// This is the part the command palette will import directly. It's a controlled
// component: the caller owns query, activeIndex, and the option list.

export interface FilterableListProps {
  options: SelectOption[]
  query: string
  onQueryChange: (q: string) => void
  /** Currently keyboard-highlighted index into the *filtered* list. */
  activeIndex: number
  onActiveIndexChange: (i: number) => void
  onSelect: (value: string) => void
  selectedValue?: string
  filterFn?: FilterFn
  /** Custom option renderer. Receives the option + current query for highlighting. */
  renderOption?: (opt: SelectOption, query: string, selected: boolean) => React.ReactNode
  emptyMessage?: string
  /** Cap on rendered items — prevents DOM explosion on huge lists. Default 200. */
  maxResults?: number
  searchPlaceholder?: string
  /** Ref forwarded to the search input — caller can use this to auto-focus. */
  inputRef?: React.RefObject<HTMLInputElement>
  /** Called when Escape is pressed inside the list. */
  onEscape?: () => void
}

export function FilterableList({
  options,
  query,
  onQueryChange,
  activeIndex,
  onActiveIndexChange,
  onSelect,
  selectedValue,
  filterFn = defaultFilter,
  renderOption,
  emptyMessage = 'No results',
  maxResults = 200,
  searchPlaceholder = 'Search…',
  inputRef: externalInputRef,
  onEscape,
}: FilterableListProps) {
  const internalInputRef = useRef<HTMLInputElement>(null)
  const inputRef = externalInputRef ?? internalInputRef
  const listRef = useRef<HTMLUListElement>(null)

  const filtered = query
    ? options.filter((o) => filterFn(o, query)).slice(0, maxResults)
    : options.slice(0, maxResults)

  // Scroll the active item into view whenever activeIndex changes.
  useEffect(() => {
    if (listRef.current) {
      const item = listRef.current.children[activeIndex] as HTMLElement | undefined
      item?.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex])

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        onActiveIndexChange(Math.min(activeIndex + 1, filtered.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        onActiveIndexChange(Math.max(activeIndex - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (filtered[activeIndex] && !filtered[activeIndex].disabled) {
          onSelect(filtered[activeIndex].value)
        }
        break
      case 'Escape':
        e.preventDefault()
        onEscape?.()
        break
    }
  }

  return (
    <div className="flex flex-col">
      {/* Search input */}
      <div className="flex items-center gap-2 border-b border-white/[0.07] px-3 py-2">
        <Search size={13} className="shrink-0 text-zinc-500" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            onQueryChange(e.target.value)
            onActiveIndexChange(0)
          }}
          onKeyDown={handleInputKeyDown}
          placeholder={searchPlaceholder}
          className={cn(
            'flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600',
            'focus:outline-none',
          )}
        />
        {query && (
          <button
            type="button"
            onClick={() => { onQueryChange(''); onActiveIndexChange(0); inputRef.current?.focus() }}
            className="shrink-0 text-zinc-600 hover:text-zinc-400 transition-colors"
            aria-label="Clear search"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Results list */}
      <ul ref={listRef} role="listbox" className="overflow-y-auto max-h-52 p-1">
        {filtered.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-zinc-600">{emptyMessage}</li>
        ) : (
          filtered.map((opt, i) => {
            const isSelected = opt.value === selectedValue
            return (
              <li
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                aria-disabled={opt.disabled}
                onMouseEnter={() => !opt.disabled && onActiveIndexChange(i)}
                onClick={() => !opt.disabled && onSelect(opt.value)}
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
                {renderOption ? (
                  renderOption(opt, query, isSelected)
                ) : (
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate">{highlightMatch(opt.label, query)}</span>
                    {opt.description && (
                      <span className="shrink-0 text-xs text-zinc-500">
                        {highlightMatch(opt.description, query)}
                      </span>
                    )}
                  </span>
                )}
                {isSelected && (
                  <Check size={14} className="text-accent-400 shrink-0 ml-2" />
                )}
              </li>
            )
          })
        )}
      </ul>
    </div>
  )
}

// ─── SearchableCombobox — full dropdown wrapper ───────────────────────────────

interface SearchableComboboxProps {
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  disabled?: boolean
  className?: string
  filterFn?: FilterFn
  renderOption?: FilterableListProps['renderOption']
  emptyMessage?: string
  maxResults?: number
  searchPlaceholder?: string
}

/**
 * Single-select dropdown with a live-filter text input inside the panel.
 * Use this when the option list is long enough that scrolling to find an item
 * would be tedious (rule of thumb: > 8 options, or dynamic/user-supplied lists).
 *
 * The FilterableList sub-component is exported separately so the command palette
 * can reuse the same filter/highlight/keyboard logic inside its own overlay.
 */
export function SearchableCombobox({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  label,
  disabled = false,
  className = '',
  filterFn,
  renderOption,
  emptyMessage,
  maxResults,
  searchPlaceholder,
}: SearchableComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = options.find((o) => o.value === value)

  // Close on outside click.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        closePanel()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Auto-focus the search input whenever the panel opens; seed activeIndex on
  // the currently-selected option so the user can see where they are.
  useEffect(() => {
    if (open) {
      // Small delay so AnimatePresence has mounted the input before we focus it.
      const id = setTimeout(() => inputRef.current?.focus(), 10)
      const idx = options.findIndex((o) => o.value === value && !o.disabled)
      setActiveIndex(idx >= 0 ? idx : 0)
      return () => clearTimeout(id)
    }
  }, [open, options, value])

  const closePanel = useCallback(() => {
    setOpen(false)
    setQuery('')
    setActiveIndex(0)
  }, [])

  function handleSelect(val: string) {
    onChange(val)
    closePanel()
  }

  function handleTriggerKeyDown(e: React.KeyboardEvent) {
    if (disabled) return
    if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
      e.preventDefault()
      setOpen(true)
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
        onKeyDown={handleTriggerKeyDown}
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
        <span className={selected ? 'text-zinc-100 truncate' : 'text-zinc-500'}>
          {selected ? selected.label : placeholder}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          <ChevronDown size={16} className="text-zinc-400 shrink-0 ml-2" />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.22, 0.61, 0.36, 1] }}
            className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-white/[0.09] bg-surface-800/95 shadow-xl shadow-black/40 backdrop-blur-md"
          >
            <FilterableList
              options={options}
              query={query}
              onQueryChange={setQuery}
              activeIndex={activeIndex}
              onActiveIndexChange={setActiveIndex}
              onSelect={handleSelect}
              selectedValue={value}
              filterFn={filterFn}
              renderOption={renderOption}
              emptyMessage={emptyMessage}
              maxResults={maxResults}
              searchPlaceholder={searchPlaceholder}
              inputRef={inputRef}
              onEscape={closePanel}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
