import type { ReactNode } from 'react'
import { Skeleton } from '../components/ui/Badge'

// Shared loading / empty presentational states so every widget handles the
// not-ready and no-data cases consistently. (The error case is handled by the
// surrounding WidgetErrorBoundary.)

export function WidgetLoading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2.5 p-1">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="w-full h-8 rounded-md" />
      ))}
    </div>
  )
}

export function WidgetEmpty({ icon, message }: { icon?: ReactNode; message: string }) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-2 p-4 text-center">
      {icon && <span className="text-zinc-600">{icon}</span>}
      <p className="t-caption text-zinc-500">{message}</p>
    </div>
  )
}

// Standard widget body header (small label above content).
export function WidgetHeading({ children }: { children: ReactNode }) {
  return <h3 className="t-micro uppercase tracking-wide text-zinc-500 mb-2">{children}</h3>
}
