// Usage meter shown below the mascot. A thin bar that fills green → amber → red
// as the usage fraction rises, with a text label and a friendly locked state at
// 100%. The parent (AIHelper page) owns polling (every 30s + after each response)
// and passes the current UsageFraction down.
import type { UsageFraction } from '@shared/types/ipc'

function barColor(f: number): string {
  if (f >= 0.85) return '#ef4444'   // red
  if (f >= 0.6) return '#f59e0b'    // amber
  return '#22c55e'                  // green
}

export function UsageMeter({ usage }: { usage: UsageFraction | null }) {
  if (!usage) {
    return <div className="text-xs text-[var(--text-secondary)]">Loading usage…</div>
  }
  const pct = Math.round(usage.fraction * 100)
  const color = barColor(usage.fraction)

  return (
    <div className="space-y-1">
      <div className="h-2 w-full rounded-full bg-[var(--surface-2,rgba(255,255,255,0.08))] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.max(2, pct)}%`, backgroundColor: color }} />
      </div>
      <div className="text-[11px] leading-tight text-[var(--text-secondary)]">{usage.label}</div>
      {usage.isAtLimit && (
        <div className="text-[11px] text-[var(--status-error,#ef4444)]">
          {usage.provider === 'free'
            ? `Daily limit reached — Byte is resting. Resets ${formatReset(usage.resetsAt)}. Connect your own key to keep going.`
            : `Over your self-set budget — sending now may incur real charges.`}
        </div>
      )}
    </div>
  )
}

function formatReset(iso: string | null): string {
  if (!iso) return 'soon'
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' })
  } catch { return 'soon' }
}
