import React from 'react'
import { cn } from '../../lib/utils'
import { Loader2 } from 'lucide-react'

// ─── Skeleton ─────────────────────────────────────────────────────────────────

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
              'h-3 rounded bg-surface-700 animate-pulse-soft',
              i === lines - 1 ? 'w-2/3' : 'w-full',
              className
            )}
          />
        ))}
      </div>
    )
  }
  return <div className={cn('h-3 rounded bg-surface-700 animate-pulse-soft', className)} />
}

// ─── Card ─────────────────────────────────────────────────────────────────────

type CardVariant = 'default' | 'flat' | 'bordered'

interface CardProps {
  children: React.ReactNode
  className?: string
  variant?: CardVariant
  padding?: boolean
}

export function Card({ children, className, variant = 'default', padding = true }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl',
        variant === 'default'  && 'bg-surface-800 border border-white/5 shadow-sm',
        variant === 'flat'     && 'bg-surface-900/50 border border-white/5',
        variant === 'bordered' && 'bg-transparent border border-white/10',
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
        <h1 className="text-xl font-semibold text-zinc-100 truncate">{title}</h1>
        {subtitle && <p className="text-sm text-zinc-500 mt-0.5 leading-relaxed">{subtitle}</p>}
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
    <div className={cn('flex rounded-lg border border-white/10 overflow-hidden w-fit', className)}>
      {options.map(opt => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          className={cn(
            'flex items-center gap-2 px-4 py-2 text-sm transition-colors',
            value === opt.id
              ? 'bg-accent-500/20 text-accent-400 font-medium'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
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

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'accent'

const badgeVariants: Record<BadgeVariant, string> = {
  default: 'bg-zinc-800 text-zinc-300 border-zinc-700',
  success: 'bg-green-900/40 text-green-400 border-green-700/50',
  warning: 'bg-amber-900/40 text-amber-400 border-amber-700/50',
  danger:  'bg-red-900/40 text-red-400 border-red-700/50',
  info:    'bg-blue-900/40 text-blue-400 border-blue-700/50',
  accent:  'bg-accent-900/40 text-accent-400 border-accent-700/50',
}

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
}

export function Badge({ variant = 'default', children, className }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-medium border',
      badgeVariants[variant],
      className
    )}>
      {children}
    </span>
  )
}

// ─── Spinner ─────────────────────────────────────────────────────────────────

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
      'flex flex-col items-center justify-center gap-4 py-16 px-8 text-center',
      className
    )}>
      <div className="w-14 h-14 rounded-2xl bg-surface-700 flex items-center justify-center text-zinc-500">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-200 mb-1">{title}</p>
        <p className="text-sm text-zinc-500 max-w-sm">{description}</p>
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
        <h1 className="text-lg font-semibold text-zinc-100">{title}</h1>
        {subtitle && <p className="text-sm text-zinc-500 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
