import React from 'react'
import { Outlet } from 'react-router-dom'
import { Titlebar } from './Titlebar'
import { Sidebar } from './Sidebar'
import { SyncToast } from './SyncToast'
import { UpdateToast } from './UpdateToast'
import { useAppStore } from '../../store/app.store'
import { backgroundFilter, backgroundSizing } from '../../lib/appearance'

export function AppShell() {
  const bg = useAppStore(s => s.preferences?.appearance?.background)
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
        <div className="flex flex-1 overflow-hidden mt-10">
          <Sidebar />
          <main className="flex-1 overflow-hidden relative" style={mainScrim}>
            <Outlet />
          </main>
        </div>
        <SyncToast />
        <UpdateToast />
      </div>
    </div>
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
