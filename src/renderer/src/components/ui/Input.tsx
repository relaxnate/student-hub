import React from 'react'
import { cn } from '../../lib/utils'

// ─── Input ────────────────────────────────────────────────────────────────────
// Phase-2 design system. Surface-elevated fill, hairline border that turns accent
// on focus, optional leading icon, error state with message.

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  compact?: boolean
  icon?:    React.ReactNode
  error?:   string
  wrapClassName?: string
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { compact, icon, error, className, wrapClassName, ...props }, ref
) {
  return (
    <div className={cn('flex flex-col gap-1', wrapClassName)}>
      <div className="relative">
        {icon && (
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          className={cn(
            'w-full rounded-md bg-surface-700 text-[13px] text-zinc-100',
            'placeholder:text-zinc-600',
            'border transition-colors duration-100',
            compact ? 'h-7' : 'h-8',
            icon ? 'pl-8 pr-3' : 'px-3',
            error
              ? 'border-red-500/60 focus:border-red-500'
              : 'border-white/[0.10] focus:border-accent-500',
            'focus:outline-none',
            className
          )}
          {...props}
        />
      </div>
      {error && <p className="t-micro text-red-400 px-0.5">{error}</p>}
    </div>
  )
})
