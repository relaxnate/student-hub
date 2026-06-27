import {
  LayoutDashboard, BookOpen, Layers, ClipboardList,
  BarChart2, Calendar, FolderOpen, Calculator, ShieldAlert,
  Archive, FlaskConical, Sparkles,
} from 'lucide-react'
import type { NavItemId } from '@shared/types/ipc'
import type { IntegrationProvider } from '@shared/types/entities'

// Shared nav maps — consumed by both the vertical Sidebar and the horizontal
// DockNav so icon/route definitions never drift between nav types.

export const NAV_ICONS: Record<NavItemId, React.ReactNode> = {
  'dashboard':        <LayoutDashboard size={16} />,
  'courses':          <BookOpen size={16} />,
  'modules':          <Layers size={16} />,
  'assignments':      <ClipboardList size={16} />,
  'ai-helper':        <Sparkles size={16} />,
  'grades':           <BarChart2 size={16} />,
  'grade-calculator': <Calculator size={16} />,
  'grade-rescue':     <ShieldAlert size={16} />,
  'simulator':        <FlaskConical size={16} />,
  'calendar':         <Calendar size={16} />,
  'files':            <FolderOpen size={16} />,
  'history':          <Archive size={16} />,
}

export const NAV_ROUTES: Record<NavItemId, string> = {
  'dashboard':        '/dashboard',
  'courses':          '/courses',
  'modules':          '/modules',
  'assignments':      '/assignments',
  'ai-helper':        '/ai-helper',
  'grades':           '/grades',
  'grade-calculator': '/grade-calculator',
  'grade-rescue':     '/grade-rescue',
  'simulator':        '/simulator',
  'calendar':         '/calendar',
  'files':            '/files',
  'history':          '/history',
}

export const PROVIDER_META: Record<IntegrationProvider, { short: string; color: string }> = {
  'canvas':           { short: 'Canvas',    color: '#E66000' },
  'google-classroom': { short: 'Classroom', color: '#4285F4' },
  'microsoft-teams':  { short: 'Teams',     color: '#6264A7' },
  'moodle':           { short: 'Moodle',    color: '#F98012' },
  'blackboard':       { short: 'Blackboard',color: '#9AA0A6' },
  'schoology':        { short: 'Schoology', color: '#1A8FE3' },
  'google-calendar':  { short: 'Calendar',  color: '#4285F4' },
  'outlook-calendar': { short: 'Outlook',   color: '#0078D4' },
  'ics-calendar':     { short: 'Feed',      color: '#0EA5E9' },
}

// Cross-component event to open the ⌘K command palette from a button (used by
// the dock + palette nav types, which have no inline nav list).
export const OPEN_COMMAND_PALETTE_EVENT = 'command-palette:open'

export function openCommandPalette(): void {
  window.dispatchEvent(new CustomEvent(OPEN_COMMAND_PALETTE_EVENT))
}

// Cross-component event to open the dedicated sidebar/taskbar settings dialog
// (the pencil "edit sidebar" button, which can live in the sidebar/dock/palette).
export const OPEN_SIDEBAR_SETTINGS_EVENT = 'sidebar-settings:open'

export function openSidebarSettings(): void {
  window.dispatchEvent(new CustomEvent(OPEN_SIDEBAR_SETTINGS_EVENT))
}

// Human-readable title for a route's first segment — used by browser tabs.
const ROUTE_TITLES: Record<string, string> = {
  '/dashboard':        'Dashboard',
  '/courses':          'Courses',
  '/modules':          'Modules',
  '/assignments':      'Assignments',
  '/ai-helper':        'AI Helper',
  '/grades':           'Grades',
  '/grade-calculator': 'GPA Calculator',
  '/grade-rescue':     'Grade Rescue',
  '/simulator':        'Simulator',
  '/calendar':         'Calendar',
  '/files':            'Files',
  '/history':          'History',
  '/settings':         'Settings',
  '/welcome':          'Welcome',
}

export function routeTitle(pathname: string): string {
  const seg = '/' + (pathname.split('/')[1] ?? '')
  return ROUTE_TITLES[seg] ?? 'Student Hub'
}
