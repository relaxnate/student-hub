import React from 'react'
import { cn } from '../../lib/utils'
import { Loader2 } from 'lucide-react'

// ─── Button ───────────────────────────────────────────────────────────────────
// Phase-2 design system. Four variants, three sizes. Fast (100ms) hover/press
// feedback, accent focus ring. Press = subtle scale, never a spring/bounce.

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size    = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?:    Size
  loading?: boolean
  icon?:    React.ReactNode
  iconEnd?: React.ReactNode
}

const variantClasses: Record<Variant, string> = {
  primary:   'bg-accent-500 hover:bg-accent-600 text-white',
  secondary: 'bg-surface-700 hover:bg-surface-600 text-zinc-200 border border-white/[0.08]',
  ghost:     'bg-transparent hover:bg-white/[0.06] text-zinc-300 hover:text-zinc-100',
  danger:    'bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/20',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',       // 28px
  md: 'h-8 px-3 text-[13px] gap-2',        // 32px
  lg: 'h-9 px-4 text-[13px] gap-2',        // 36px
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  iconEnd,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium select-none',
        'transition-[background-color,transform,color] duration-100 ease-[var(--ease-std)]',
        'active:scale-[0.99]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-950',
        'disabled:opacity-40 disabled:pointer-events-none',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading
        ? <Loader2 className="animate-spin" size={size === 'sm' ? 12 : 14} />
        : icon && <span className="shrink-0">{icon}</span>
      }
      {children && <span>{children}</span>}
      {iconEnd && !loading && <span className="shrink-0">{iconEnd}</span>}
    </button>
  )
}
