import React from 'react'
import { cn } from '../../lib/utils'
import { Loader2 } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size    = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:  Variant
  size?:     Size
  loading?:  boolean
  icon?:     React.ReactNode
  iconEnd?:  React.ReactNode
}

const variantClasses: Record<Variant, string> = {
  primary:   'bg-accent-500 hover:bg-accent-600 text-white border-transparent',
  secondary: 'bg-surface-700 hover:bg-surface-600 text-zinc-200 border-surface-600',
  ghost:     'bg-transparent hover:bg-surface-700 text-zinc-300 hover:text-zinc-100 border-transparent',
  danger:    'bg-red-600/20 hover:bg-red-600/30 text-red-400 border-red-600/30',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-8 px-3 text-sm gap-2',
  lg: 'h-10 px-4 text-sm gap-2',
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
        'inline-flex items-center justify-center rounded-md border font-medium',
        'transition-colors duration-150',
        'disabled:opacity-50 disabled:cursor-not-allowed',
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
