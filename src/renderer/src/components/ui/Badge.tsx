import React from 'react'
import { cn } from '../../lib/utils'
import { Loader2 } from 'lucide-react'

// Phase-2 component library. Elevation via surface + 1px hairline borders (never
// drop-shadows on dark). Status tints at low opacity. Fast 100ms transitions.

// ─── Skeleton ─────────────────────────────────────────────────────────────────
// Shimmer sweep (see .skeleton-shimmer in index.css) — replaces spinners where
// the content has a known shape.

interface SkeletonProps {
  className?: string
  lines?: number
}

export function Skeleton({ className, lines = 1 }: SkeletonProps) {
  if (lines > 1) {
    return (
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-3 rounded skeleton-shimmer',
              i === lines - 1 ? 'w-2/3' : 'w-full',
              className
            )}
          />
        ))}
      </div>
    )
  }
  return <div className={cn('h-3 rounded skeleton-shimmer', className)} />
}

// ─── Card ─────────────────────────────────────────────────────────────────────
// Separation comes from the surface fill + a 1px hairline border — NOT a shadow.

type CardVariant = 'default' | 'flat' | 'bordered'

interface CardProps {
  children:    React.ReactNode
  className?:  string
  variant?:    CardVariant
  padding?:    boolean
  interactive?: boolean
  onClick?:    () => void
}

export function Card({ children, className, variant = 'default', padding = true, interactive, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-lg',
        variant === 'default'  && 'surface-card border border-white/[0.08]',
        variant === 'flat'     && 'bg-surface-800/50 border border-white/[0.05]',
        variant === 'bordered' && 'bg-transparent border border-white/[0.10]',
        interactive && 'cursor-pointer transition-colors duration-100 hover:bg-surface-700 hover:border-white/[0.12] active:bg-surface-600',
        padding && 'p-4',
        className
      )}
    >
      {children}
    </div>
  )
}

// ─── PageHeader ───────────────────────────────────────────────────────────────

interface PageHeaderProps {
  title:     string
  subtitle?: string
  action?:   React.ReactNode
  back?:     React.ReactNode
  className?: string
}

export function PageHeader({ title, subtitle, action, back, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        {back && <div className="mb-1">{back}</div>}
        <h1 className="t-display text-zinc-100 truncate">{title}</h1>
        {subtitle && <p className="t-caption text-zinc-500 mt-1">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
    </div>
  )
}

// ─── Segmented ────────────────────────────────────────────────────────────────

interface SegmentedOption {
  id:     string
  label:  string
  icon?:  React.ReactNode
}

interface SegmentedProps {
  options:   SegmentedOption[]
  value:     string
  onChange:  (value: string) => void
  className?: string
}

export function Segmented({ options, value, onChange, className }: SegmentedProps) {
  return (
    <div className={cn('inline-flex items-center gap-0.5 rounded-lg border border-white/[0.08] bg-surface-900 p-0.5 w-fit', className)}>
      {options.map(opt => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          className={cn(
            'flex items-center gap-1.5 px-3 h-7 rounded-md text-[13px] transition-colors duration-100',
            value === opt.id
              ? 'bg-surface-700 text-zinc-100 font-medium'
              : 'text-zinc-500 hover:text-zinc-200'
          )}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ─── Badge ────────────────────────────────────────────────────────────────────
// Pill, 4px radius, status tint at 15% + full-strength text. No border.

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'accent'

const badgeVariants: Record<BadgeVariant, string> = {
  default: 'bg-white/[0.06] text-zinc-300',
  success: 'bg-green-500/15 text-green-400',
  warning: 'bg-amber-500/15 text-amber-400',
  danger:  'bg-red-500/15 text-red-400',
  info:    'bg-blue-500/15 text-blue-400',
  accent:  'bg-accent-500/15 text-accent-400',
}

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
}

export function Badge({ variant = 'default', children, className }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] t-micro font-medium',
      badgeVariants[variant],
      className
    )}>
      {children}
    </span>
  )
}

// ─── Spinner ─────────────────────────────────────────────────────────────────
// Reserved for global/inline loading where a skeleton can't express the shape.

interface SpinnerProps {
  size?: number
  className?: string
}

export function Spinner({ size = 16, className }: SpinnerProps) {
  return (
    <Loader2
      size={size}
      className={cn('animate-spin text-zinc-500', className)}
    />
  )
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon:        React.ReactNode
  title:       string
  description: string
  action?:     React.ReactNode
  className?:  string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center gap-3 py-16 px-8 text-center',
      className
    )}>
      <div className="text-zinc-600">{icon}</div>
      <div className="space-y-1">
        <p className="t-heading text-zinc-200">{title}</p>
        <p className="t-caption text-zinc-500 max-w-xs mx-auto leading-relaxed">{description}</p>
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

// ─── SectionHeader ───────────────────────────────────────────────────────────

interface SectionHeaderProps {
  title:    string
  subtitle?: string
  action?:  React.ReactNode
  className?: string
}

export function SectionHeader({ title, subtitle, action, className }: SectionHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      <div>
        <h1 className="t-display text-zinc-100">{title}</h1>
        {subtitle && <p className="t-caption text-zinc-500 mt-1">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
