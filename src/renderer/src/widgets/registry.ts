import {
  LayoutGrid, CalendarClock, BarChart2, Sun, Clock, Quote, StickyNote, Image, RefreshCw,
} from 'lucide-react'
import type { WidgetDefinition } from './types'
import QuickStatsWidget from './components/QuickStatsWidget'
import UpcomingAssignmentsWidget from './components/UpcomingAssignmentsWidget'
import TodayWidget from './components/TodayWidget'
import GradesSummaryWidget from './components/GradesSummaryWidget'
import SyncStatusWidget from './components/SyncStatusWidget'
import ClockWidget from './components/ClockWidget'
import QuoteWidget from './components/QuoteWidget'
import NotesWidget from './components/NotesWidget'
import CustomImageWidget from './components/CustomImageWidget'

// The grid uses 12 columns; `grid.h`/row units are ROW_HEIGHT px tall each.
export const GRID_COLS = 12
export const GRID_ROW_HEIGHT = 44
export const GRID_MARGIN = 12

export const WIDGET_REGISTRY: Record<string, WidgetDefinition> = {
  'quick-stats': {
    type: 'quick-stats', name: 'Quick Stats', description: 'Courses, due, missing & GPA at a glance.',
    icon: LayoutGrid, component: QuickStatsWidget,
    grid: { w: 4, h: 3, minW: 3, minH: 2 }, free: { width: 280, height: 150 },
  },
  'upcoming-assignments': {
    type: 'upcoming-assignments', name: 'Upcoming', description: 'Your next assignments by due date.',
    icon: CalendarClock, component: UpcomingAssignmentsWidget,
    grid: { w: 4, h: 5, minW: 3, minH: 3 }, free: { width: 300, height: 280 },
    defaultConfig: { count: 6 },
    configFields: [{ key: 'count', label: 'Items to show', type: 'number', min: 3, max: 15 }],
  },
  'today': {
    type: 'today', name: 'Today', description: "Today's work plus anything overdue.",
    icon: Sun, component: TodayWidget,
    grid: { w: 4, h: 5, minW: 3, minH: 3 }, free: { width: 300, height: 280 },
  },
  'grades-summary': {
    type: 'grades-summary', name: 'Grades', description: 'Current grade for each course.',
    icon: BarChart2, component: GradesSummaryWidget,
    grid: { w: 4, h: 5, minW: 3, minH: 3 }, free: { width: 300, height: 280 },
    defaultConfig: { count: 6 },
    configFields: [{ key: 'count', label: 'Courses to show', type: 'number', min: 3, max: 15 }],
  },
  'sync-status': {
    type: 'sync-status', name: 'Sync', description: 'Last sync time and a sync button.',
    icon: RefreshCw, component: SyncStatusWidget,
    grid: { w: 4, h: 3, minW: 3, minH: 2 }, free: { width: 280, height: 150 },
  },
  'clock': {
    type: 'clock', name: 'Clock', description: 'Live clock and date.',
    icon: Clock, component: ClockWidget,
    grid: { w: 3, h: 3, minW: 2, minH: 2 }, free: { width: 220, height: 150 },
    defaultConfig: { format24h: false },
    configFields: [{
      key: 'format24h', label: 'Time format', type: 'select',
      options: [{ value: 'false', label: '12-hour' }, { value: 'true', label: '24-hour' }],
    }],
  },
  'quote': {
    type: 'quote', name: 'Quote', description: 'A rotating motivational quote.',
    icon: Quote, component: QuoteWidget,
    grid: { w: 4, h: 3, minW: 3, minH: 2 }, free: { width: 300, height: 150 },
  },
  'notes': {
    type: 'notes', name: 'Notes', description: 'A free-text sticky note.',
    icon: StickyNote, component: NotesWidget,
    grid: { w: 4, h: 4, minW: 2, minH: 2 }, free: { width: 280, height: 220 },
    defaultConfig: { text: '' },
  },
  'custom-image': {
    type: 'custom-image', name: 'Image', description: 'Show an image of your choice.',
    icon: Image, component: CustomImageWidget,
    grid: { w: 4, h: 4, minW: 2, minH: 2 }, free: { width: 280, height: 220 },
    defaultConfig: { fit: 'cover' },
    configFields: [{
      key: 'fit', label: 'Image fit', type: 'select',
      options: [{ value: 'cover', label: 'Cover (fill)' }, { value: 'contain', label: 'Contain (fit)' }],
    }],
  },
}

export const WIDGET_LIST: WidgetDefinition[] = Object.values(WIDGET_REGISTRY)

export function getWidgetDef(type: string): WidgetDefinition | undefined {
  return WIDGET_REGISTRY[type]
}

// The starter set placed on a brand-new widget dashboard (grid coords). Each
// entry becomes a WidgetInstance + an RGL layout item keyed by the same id.
export interface DefaultWidgetSeed {
  id: string
  type: string
  x: number
  y: number
  w: number
  h: number
}

export const DEFAULT_WIDGET_SEEDS: DefaultWidgetSeed[] = [
  { id: 'seed-quick-stats', type: 'quick-stats',          x: 0, y: 0, w: 4, h: 3 },
  { id: 'seed-clock',       type: 'clock',                x: 4, y: 0, w: 4, h: 3 },
  { id: 'seed-sync',        type: 'sync-status',          x: 8, y: 0, w: 4, h: 3 },
  { id: 'seed-today',       type: 'today',                x: 0, y: 3, w: 4, h: 5 },
  { id: 'seed-upcoming',    type: 'upcoming-assignments', x: 4, y: 3, w: 4, h: 5 },
  { id: 'seed-grades',      type: 'grades-summary',       x: 8, y: 3, w: 4, h: 5 },
]
