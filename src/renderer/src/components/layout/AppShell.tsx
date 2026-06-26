import React from 'react'
import { Outlet } from 'react-router-dom'
import { Titlebar } from './Titlebar'
import { Sidebar } from './Sidebar'
import { DockNav } from './DockNav'
import { TabBar } from './TabBar'
import { SplitPane } from './SplitPane'
import { SyncToast } from './SyncToast'
import { UpdateToast } from './UpdateToast'
import CommandPalette from './CommandPalette'
import { SidebarSettingsDialog } from './SidebarSettingsDialog'
import { useAppStore } from '../../store/app.store'
import { useTabsStore } from '../../store/tabs.store'
import { backgroundFilter, backgroundSizing } from '../../lib/appearance'

export function AppShell() {
  const bg = useAppStore(s => s.preferences?.appearance?.background)
  const navType = useAppStore(s => s.preferences?.appearance?.navType ?? 'standard')
  const tabsEnabled = useAppStore(s => s.preferences?.appearance?.tabsEnabled ?? false)
  const active = !!bg && bg.type !== 'none' &&
    !(bg.type === 'image' && !bg.image)

  // Readability scrim behind the main content area, so text over busy
  // backgrounds stays legible without fully hiding the image.
  const mainScrim = active && bg!.adaptiveReadability
    ? { background: 'rgb(var(--surface-900) / 0.35)' }
    : undefined

  return (
    <div className="flex flex-col h-screen overflow-hidden relative">
      {/* Background layers (behind everything) */}
      {active && <BackgroundLayers />}

      {/* App content above the background */}
      <div className="relative z-10 flex flex-col h-full">
        <Titlebar />
        {navType === 'dock' ? (
          // Dock nav: horizontal bar above a full-width content area.
          <div className="flex flex-col flex-1 overflow-hidden mt-10">
            <DockNav />
            <MainArea tabsEnabled={tabsEnabled} scrim={mainScrim} />
          </div>
        ) : (
          // Vertical nav types (standard / rail / palette) — Sidebar adapts.
          <div className="flex flex-1 overflow-hidden mt-10">
            <Sidebar />
            <MainArea tabsEnabled={tabsEnabled} scrim={mainScrim} />
          </div>
        )}
        <SyncToast />
        <UpdateToast />
      </div>

      {/* Global ⌘K / Ctrl+K command palette (additive overlay) */}
      <CommandPalette />

      {/* Dedicated sidebar/taskbar settings dialog (pencil button) */}
      <SidebarSettingsDialog />
    </div>
  )
}

// Content column: optional browser tab bar above the routed page. When tabs are
// off this is identical to the previous `<main>` (a single overflow-hidden box).
function MainArea({ tabsEnabled, scrim }: {
  tabsEnabled: boolean; scrim: React.CSSProperties | undefined
}) {
  const splitTabIds = useTabsStore(s => s.splitTabIds)
  const showSplit = tabsEnabled && splitTabIds.length > 0

  return (
    <main className="surface-content flex-1 flex flex-col overflow-hidden relative" style={scrim}>
      {tabsEnabled && <TabBar />}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Main pane = the app's hash router (sidebar/tab-bar driven). */}
        <div className="flex-1 min-w-0 overflow-hidden relative">
          <Outlet />
        </div>
        {/* Secondary split panes, each an independent in-memory router. */}
        {showSplit && splitTabIds.map(id => <SplitPane key={id} tabId={id} />)}
      </div>
    </main>
  )
}

function BackgroundLayers() {
  const bg = useAppStore(s => s.preferences?.appearance?.background)!
  const base = 'fixed inset-0 z-0 pointer-events-none'

  let fill: React.ReactNode = null
  if (bg.type === 'image' && bg.image) {
    const { size, repeat, position } = backgroundSizing(bg.scaling)
    const filter = backgroundFilter(bg)
    fill = (
      <div className={base} style={{
        backgroundImage:    `url("${bg.image}")`,
        backgroundSize:     size,
        backgroundRepeat:   repeat,
        backgroundPosition: position,
        filter:             filter || undefined,
        opacity:            bg.opacity / 100,
        // Slight overscan so blur doesn't reveal transparent edges.
        transform:          bg.blur ? 'scale(1.06)' : undefined,
      }} />
    )
  } else if (bg.type === 'solid') {
    fill = <div className={base} style={{ background: bg.color, opacity: bg.opacity / 100 }} />
  } else if (bg.type === 'gradient') {
    fill = (
      <div className={base} style={{
        background: `linear-gradient(${bg.gradientAngle}deg, ${bg.gradientFrom}, ${bg.gradientTo})`,
        opacity:    bg.opacity / 100,
      }} />
    )
  }

  return (
    <>
      {fill}
      {bg.overlayOpacity > 0 && (
        <div className={base} style={{ background: '#000', opacity: bg.overlayOpacity / 100 }} />
      )}
    </>
  )
}
