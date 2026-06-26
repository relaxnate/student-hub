import React from 'react'
import * as RTooltip from '@radix-ui/react-tooltip'
import { cn } from '../../lib/utils'

// ─── Tooltip ──────────────────────────────────────────────────────────────────
// Thin wrapper over Radix Tooltip. Dark surface a step lighter than the app,
// caption text, 400ms open delay, 8px offset, 100ms fade. Wrap the app (or a
// subtree) once in <TooltipProvider>, then use <Tooltip content=...>.

export const TooltipProvider = RTooltip.Provider

interface TooltipProps {
  content:    React.ReactNode
  children:   React.ReactNode
  side?:      'top' | 'right' | 'bottom' | 'left'
  align?:     'start' | 'center' | 'end'
  delay?:     number
  className?: string
}

export function Tooltip({ content, children, side = 'top', align = 'center', delay = 400, className }: TooltipProps) {
  if (content == null || content === '') return <>{children}</>
  return (
    <RTooltip.Root delayDuration={delay}>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side}
          align={align}
          sideOffset={8}
          className={cn(
            'z-[300] rounded-md bg-surface-700 border border-white/[0.08] px-2 py-1',
            't-caption text-zinc-100 shadow-lg',
            'animate-[fadeIn_100ms_ease-out]',
            'select-none',
            className
          )}
        >
          {content}
          <RTooltip.Arrow className="fill-surface-700" />
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  )
}
