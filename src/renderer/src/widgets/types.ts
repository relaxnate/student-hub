import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'

// ─── Widget contracts ─────────────────────────────────────────────────────────
// The Phase-2 widget system. Each widget is a self-contained component that
// renders inside the dashboard canvas (react-grid-layout grid mode OR
// react-draggable free mode). Per-instance config is persisted as JSON on the
// WidgetInstance row; shared course/assignment data comes from WidgetDataContext.

export type WidgetConfig = Record<string, unknown>

export interface WidgetProps {
  instanceId: string
  /** Parsed per-instance config (from WidgetInstance.configJson). */
  config: WidgetConfig
  /** Merge a patch into this instance's config (persists via saveInstance). */
  setConfig: (patch: WidgetConfig) => void
  /** True while the dashboard is in edit mode (widgets dim interactivity). */
  editing: boolean
}

export interface WidgetConfigField {
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'select' | 'image'
  options?: { value: string; label: string }[]
  min?: number
  max?: number
  placeholder?: string
}

export interface WidgetDefinition {
  type: string
  name: string
  description: string
  icon: LucideIcon
  component: ComponentType<WidgetProps>
  /** Grid-mode default + minimum span, in 12-col grid units / row units. */
  grid: { w: number; h: number; minW: number; minH: number }
  /** Free-mode default size, in pixels. */
  free: { width: number; height: number }
  defaultConfig?: WidgetConfig
  /** Optional fields surfaced in the per-widget config panel. */
  configFields?: WidgetConfigField[]
}
