import React from 'react'
import { cn } from '../../lib/utils'
import { Loader2 } from 'lucide-react'

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
