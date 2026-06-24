import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Link2, Bell, Palette, RefreshCw, Settings2, Sun, Moon, MoonStar, Monitor, Trash2, Loader2, CheckCircle2, Image, FolderOpen, Type, Maximize2, Accessibility, Contrast, Eye, Layers, Zap, PanelLeft, Sparkles, ChevronUp, ChevronDown, BookOpen, GraduationCap, Plus } from 'lucide-react'
import { useAppStore } from '../../store/app.store'
import { useWorkspaceStore } from '../../store/workspace.store'
import { api } from '../../lib/ipc'
import {
  ACCENT_PRESETS, SECONDARY_PRESETS,
  SUCCESS_PRESETS, WARNING_PRESETS, ERROR_PRESETS, NOTIFICATION_PRESETS,
} from '../../lib/appearance'
import { cn } from '../../lib/utils'
import { Button } from '../../components/ui/Button'
import { AddPlatform } from '../../components/integrations/AddPlatform'
import type { Integration, IntegrationProvider } from '@shared/types/entities'
import type {
  AppPreferences, AppearanceSettings, ThemeMode, CornerStyle, FontFamily,
  ContrastLevel, ColorblindMode, LineSpacing, MotionLevel, SidebarMode,
  DensityMode, EffectsPreset, BackgroundType, BackgroundScaling, BackgroundSettings,
  DashboardPanel, DashboardPanelId, WorkspaceMode,
} from '@shared/types/ipc'
import { format } from 'date-fns'

type Section = 'general' | 'integrations' | 'appearance' | 'background' | 'effects' | 'accessibility' | 'layout' | 'workspace' | 'notifications' | 'sync' | 'about'

const SECTIONS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: 'general',       label: 'General',       icon: <Settings2 size={14} /> },
  { id: 'integrations',  label: 'Integrations',  icon: <Link2 size={14} /> },
  { id: 'appearance',    label: 'Appearance',    icon: <Palette size={14} /> },
  { id: 'background',    label: 'Background',    icon: <Image size={14} /> },
  { id: 'effects',       label: 'Effects',       icon: <Sparkles size={14} /> },
  { id: 'accessibility', label: 'Accessibility', icon: <Accessibility size={14} /> },
  { id: 'layout',        label: 'Layout',        icon: <PanelLeft size={14} /> },
  { id: 'workspace',     label: 'Workspace',     icon: <GraduationCap size={14} /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell size={14} /> },
  { id: 'sync',          label: 'Sync',          icon: <RefreshCw size={14} /> },
  { id: 'about',         label: 'About',         icon: <Settings2 size={14} /> },
]

const PROVIDER_META: Record<IntegrationProvider, { name: string; color: string }> = {
  'canvas':           { name: 'Canvas LMS',       color: '#E66000' },
  'google-classroom': { name: 'Google Classroom',  color: '#4285F4' },
  'microsoft-teams':  { name: 'MS Teams EDU',      color: '#6264A7' },
  'moodle':           { name: 'Moodle',            color: '#F98012' },
  'blackboard':       { name: 'Blackboard',        color: '#2A2A2A' },
  'schoology':        { name: 'Schoology',         color: '#1A5276' },
  'google-calendar':  { name: 'Google Calendar',   color: '#4285F4' },
  'outlook-calendar': { name: 'Outlook Calendar',  color: '#0078D4' },
}

export default function Settings() {
  const [section, setSection] = useState<Section>('integrations')
  const [prefs,   setPrefsState] = useState<AppPreferences | null>(null)
  const [version, setVersion]    = useState('')
  const { integrations, setPreferences, removeIntegration, addIntegration } = useAppStore()
  const appearance   = useAppStore(s => s.preferences?.appearance)
  const setAppearance = useAppStore(s => s.setAppearance)

  useEffect(() => {
    api.app.getPreferences().then((r: { ok: boolean; data: AppPreferences }) => { if (r.ok) setPrefsState(r.data) })
    api.app.getVersion().then((r: { ok: boolean; data: string }) => { if (r.ok) setVersion(r.data) })
  }, [])

  const savePref = async (patch: Partial<AppPreferences>) => {
    await setPreferences(patch)
    setPrefsState(prev => prev ? { ...prev, ...patch } : null)
  }

  const handleDisconnect = async (id: string) => {
    await api.auth.logout(id)
    removeIntegration(id)
  }

  return (
    <div className="h-full flex overflow-hidden">
      <div className="w-44 shrink-0 border-r border-white/5 px-2 py-4">
        <ul className="space-y-0.5">
          {SECTIONS.map(s => (
            <li key={s.id}>
              <button onClick={() => setSection(s.id)}
                className={cn('w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors',
                  section === s.id ? 'bg-accent-500/15 text-accent-400' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5')}>
                {s.icon}<span>{s.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <motion.div key={section} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.15 }} className="max-w-xl space-y-6">
          {section === 'general' && prefs && (
            <GeneralSection prefs={prefs} onSave={savePref} />
          )}
          {section === 'integrations' && (
            <IntegrationsSection integrations={integrations} onDisconnect={handleDisconnect} onAdd={addIntegration} />
          )}
          {section === 'appearance' && appearance && (
            <AppearanceSection appearance={appearance} onAppearance={setAppearance} />
          )}
          {section === 'background' && appearance && (
            <BackgroundSection background={appearance.background}
              onChange={bg => setAppearance({ background: { ...appearance.background, ...bg } })} />
          )}
          {section === 'accessibility' && appearance && (
            <AccessibilitySection appearance={appearance} onAppearance={setAppearance} />
          )}
          {section === 'effects' && appearance && (
            <EffectsSection appearance={appearance} onAppearance={setAppearance} />
          )}
          {section === 'layout' && appearance && (
            <LayoutSection appearance={appearance} onAppearance={setAppearance} />
          )}
          {section === 'workspace' && appearance && (
            <WorkspaceSection appearance={appearance} onAppearance={setAppearance} />
          )}
          {section === 'notifications' && prefs && (
            <NotificationsSection prefs={prefs} onSave={savePref} />
          )}
          {section === 'sync' && prefs && (
            <SyncSection prefs={prefs} onSave={savePref} />
          )}
          {section === 'about' && <AboutSection version={version} />}
        </motion.div>
      </div>
    </div>
  )
}

// ─── General ──────────────────────────────────────────────────────────────────
function GeneralSection({ prefs, onSave }: { prefs: AppPreferences; onSave: (p: Partial<AppPreferences>) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-zinc-100 mb-1">General</h2>
        <p className="text-sm text-zinc-500">Global behaviour settings that apply across the whole app.</p>
      </div>

      <div className="space-y-1">
        <ToggleRow
          label="Show history courses everywhere"
          description="When ON, past/inactive courses appear in Courses, Modules, Assignments, Grades, and Files. Grade & GPA Calc always shows all history regardless. Dashboard has its own separate toggle in the Edit Layout button."
          value={prefs.showHistoryCourses ?? false}
          onChange={v => onSave({ showHistoryCourses: v })}
        />
        <p className="text-2xs text-zinc-600 pl-0.5 pt-1">
          OFF by default — only your current active courses are shown. Turn ON if you want to see all semesters everywhere.
        </p>
      </div>
    </div>
  )
}

// ─── Integrations ─────────────────────────────────────────────────────────────
function IntegrationsSection({ integrations, onDisconnect, onAdd }: {
  integrations: Integration[]; onDisconnect: (id: string) => void; onAdd?: (i: Integration) => void
}) {
  const [syncing, setSyncing] = useState<string | null>(null)
  const [syncDone, setSyncDone] = useState<string | null>(null)

  const handleSync = async (id: string) => {
    setSyncing(id)
    await api.sync.startIntegration(id)
    setSyncing(null)
    setSyncDone(id)
    setTimeout(() => setSyncDone(null), 3000)
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-zinc-100 mb-1">Connected platforms</h2>
        <p className="text-sm text-zinc-500">Manage your learning platform connections.</p>
      </div>

      {integrations.length === 0 ? (
        <div className="rounded-xl bg-surface-800 border border-white/5 p-8 text-center">
          <Link2 size={20} className="text-zinc-600 mx-auto mb-3" />
          <p className="text-sm text-zinc-400 mb-1">No platforms connected</p>
          <p className="text-xs text-zinc-600">Connect one below to start syncing your courses.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {integrations.map(i => {
            const meta = PROVIDER_META[i.provider]
            return (
              <div key={i.id} className="flex items-center gap-3 p-3.5 rounded-xl bg-surface-800 border border-white/5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0"
                  style={{ background: meta?.color ?? '#6366f1' }}>
                  {meta?.name[0] ?? i.provider[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-200 truncate">{i.displayName}</p>
                  <p className="text-xs text-zinc-500">{i.lastSyncedAt ? `Last synced ${format(i.lastSyncedAt, 'MMM d, h:mm a')}` : 'Never synced'}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {syncDone === i.id && <CheckCircle2 size={14} className="text-green-400" />}
                  <Button variant="ghost" size="sm" loading={syncing === i.id}
                    icon={<RefreshCw size={12} />} onClick={() => handleSync(i.id)}>Sync</Button>
                  <Button variant="ghost" size="sm" icon={<Trash2 size={12} />}
                    onClick={() => onDisconnect(i.id)} className="text-zinc-600 hover:text-red-400" />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add a platform */}
      <div className="pt-3 border-t border-white/5">
        <h2 className="text-base font-semibold text-zinc-100 mb-1">Add a platform</h2>
        <p className="text-sm text-zinc-500 mb-4">
          Connect another learning platform. Canvas &amp; Moodle just need a token and your site URL — no setup or sign-up.
        </p>
        <AddPlatform
          onConnected={i => onAdd?.(i)}
          connectedProviders={integrations.map(i => i.provider)}
        />
      </div>
    </div>
  )
}

// ─── Appearance ───────────────────────────────────────────────────────────────
function AppearanceSection({ appearance, onAppearance }: {
  appearance: AppearanceSettings
  onAppearance: (p: Partial<AppearanceSettings>) => void
}) {
  const themes: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
    { value: 'light',  label: 'Light',     icon: <Sun size={14} /> },
    { value: 'dark',   label: 'Dark',      icon: <Moon size={14} /> },
    { value: 'oled',   label: 'OLED',      icon: <MoonStar size={14} /> },
    { value: 'system', label: 'System',    icon: <Monitor size={14} /> },
  ]

  const corners: { value: CornerStyle; label: string }[] = [
    { value: 'sharp',   label: 'Sharp' },
    { value: 'rounded', label: 'Rounded' },
    { value: 'extra',   label: 'Extra' },
  ]

  const fonts: { value: FontFamily; label: string }[] = [
    { value: 'system',   label: 'System' },
    { value: 'sans',     label: 'Sans' },
    { value: 'mono',     label: 'Mono' },
    { value: 'dyslexic', label: 'Dyslexic' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-zinc-100 mb-1">Appearance</h2>
        <p className="text-sm text-zinc-500">Make Student Hub feel like your own workspace.</p>
      </div>

      {/* Theme */}
      <div>
        <p className="text-xs font-medium text-zinc-400 mb-2.5">Theme</p>
        <div className="grid grid-cols-4 gap-2">
          {themes.map(t => (
            <button key={t.value} onClick={() => onAppearance({ themeMode: t.value })}
              className={cn('flex flex-col items-center justify-center gap-1.5 py-3 rounded-lg border text-xs transition-colors',
                appearance.themeMode === t.value ? 'border-accent-500/60 bg-accent-500/15 text-accent-400'
                  : 'border-white/8 text-zinc-400 hover:border-white/15 hover:text-zinc-300')}>
              {t.icon}<span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Primary accent */}
      <AccentRow
        label="Primary accent"
        hint="Buttons, links, highlights, and active states."
        presets={ACCENT_PRESETS}
        value={appearance.accentPrimary}
        fallbackHex="#6550f3"
        onChange={v => onAppearance({ accentPrimary: v })}
      />

      {/* Secondary accent */}
      <AccentRow
        label="Secondary accent"
        hint="Focus rings, text selection, and scrollbars."
        presets={SECONDARY_PRESETS}
        value={appearance.accentSecondary}
        fallbackHex="#6366f1"
        onChange={v => onAppearance({ accentSecondary: v })}
      />

      {/* Status colors */}
      <div className="space-y-4 pt-1">
        <p className="text-xs font-medium text-zinc-400">Status colors</p>
        <AccentRow label="Success" hint="Graded, complete, and positive states."
          presets={SUCCESS_PRESETS} value={appearance.statusSuccess} fallbackHex="#22c55e"
          onChange={v => onAppearance({ statusSuccess: v })} />
        <AccentRow label="Warning" hint="Due-soon and caution states."
          presets={WARNING_PRESETS} value={appearance.statusWarning} fallbackHex="#f59e0b"
          onChange={v => onAppearance({ statusWarning: v })} />
        <AccentRow label="Error" hint="Overdue, failed, and destructive states."
          presets={ERROR_PRESETS} value={appearance.statusError} fallbackHex="#ef4444"
          onChange={v => onAppearance({ statusError: v })} />
        <AccentRow label="Notification" hint="Info badges and notification accents."
          presets={NOTIFICATION_PRESETS} value={appearance.statusNotification} fallbackHex="#3b82f6"
          onChange={v => onAppearance({ statusNotification: v })} />
      </div>

      {/* Corner style */}
      <div>
        <p className="text-xs font-medium text-zinc-400 mb-2.5">Corner style</p>
        <div className="grid grid-cols-3 gap-2">
          {corners.map(c => (
            <button key={c.value} onClick={() => onAppearance({ cornerStyle: c.value })}
              className={cn('py-2.5 border text-sm transition-colors rounded-lg',
                appearance.cornerStyle === c.value ? 'border-accent-500/60 bg-accent-500/15 text-accent-400'
                  : 'border-white/8 text-zinc-400 hover:border-white/15 hover:text-zinc-300')}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Font family */}
      <div>
        <p className="text-xs font-medium text-zinc-400 mb-2.5 flex items-center gap-1.5">
          <Type size={12} /> Font
        </p>
        <div className="grid grid-cols-4 gap-2">
          {fonts.map(f => (
            <button key={f.value} onClick={() => onAppearance({ fontFamily: f.value })}
              className={cn('py-2.5 border text-sm transition-colors rounded-lg',
                appearance.fontFamily === f.value ? 'border-accent-500/60 bg-accent-500/15 text-accent-400'
                  : 'border-white/8 text-zinc-400 hover:border-white/15 hover:text-zinc-300')}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Font size */}
      <SliderRow
        label="Font size"
        value={appearance.fontScale}
        min={0.85} max={1.4} step={0.05}
        format={v => `${Math.round(v * 100)}%`}
        onChange={v => onAppearance({ fontScale: v })}
      />

      {/* UI scale */}
      <SliderRow
        label="Interface scale"
        icon={<Maximize2 size={12} />}
        value={appearance.uiScale}
        min={0.8} max={1.3} step={0.05}
        format={v => `${Math.round(v * 100)}%`}
        onChange={v => onAppearance({ uiScale: v })}
      />

      <p className="text-2xs text-zinc-600 pt-1">
        Status colors are above. Background, density, and sidebar layout have their own sections.
      </p>
    </div>
  )
}

// ─── Accessibility (includes Motion) ─────────────────────────────────────────
function AccessibilitySection({ appearance, onAppearance }: {
  appearance: AppearanceSettings
  onAppearance: (p: Partial<AppearanceSettings>) => void
}) {
  const animDisabled = appearance.disableAnimations
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-zinc-100 mb-1">Accessibility</h2>
        <p className="text-sm text-zinc-500">Contrast, colour, readability, and motion — all in one place.</p>
      </div>

      {/* Visual */}
      <SectionDivider label="Visual" />

      <SegmentRow<ContrastLevel>
        label="Contrast"
        hint="Boosts the legibility of secondary text and outlines."
        icon={<Contrast size={12} />}
        options={[
          { value: 'normal',    label: 'Normal' },
          { value: 'increased', label: 'Increased' },
          { value: 'high',      label: 'High' },
        ]}
        value={appearance.contrast}
        onChange={v => onAppearance({ contrast: v })}
      />

      <ToggleRow
        label="Reduce transparency"
        description="Disable blur and translucent surface effects"
        value={appearance.reduceTransparency}
        onChange={v => onAppearance({ reduceTransparency: v })}
      />

      <SegmentRow<ColorblindMode>
        label="Colorblind adjustment"
        hint="Applies a colour-matrix filter across the whole interface."
        icon={<Eye size={12} />}
        options={[
          { value: 'none',         label: 'None'   },
          { value: 'protanopia',   label: 'Protan' },
          { value: 'deuteranopia', label: 'Deuter' },
          { value: 'tritanopia',   label: 'Tritan' },
        ]}
        value={appearance.colorblind}
        onChange={v => onAppearance({ colorblind: v })}
      />

      <SegmentRow<LineSpacing>
        label="Line spacing"
        hint="Affects reading-heavy content like assignment descriptions and pages."
        icon={<Layers size={12} />}
        options={[
          { value: 'normal',  label: 'Normal'  },
          { value: 'relaxed', label: 'Relaxed' },
          { value: 'loose',   label: 'Loose'   },
        ]}
        value={appearance.lineSpacing}
        onChange={v => onAppearance({ lineSpacing: v })}
      />

      {/* Motion */}
      <SectionDivider label="Motion" />

      <div className={cn(animDisabled && 'opacity-40 pointer-events-none')}>
        <SegmentRow<MotionLevel>
          label="Animation speed"
          hint="Sets the global transition pace across the whole app."
          icon={<Zap size={12} />}
          options={[
            { value: 'smooth',   label: 'Smooth'   },
            { value: 'standard', label: 'Standard' },
            { value: 'snappy',   label: 'Snappy'   },
            { value: 'reduced',  label: 'Reduced'  },
          ]}
          value={appearance.motionLevel}
          onChange={v => onAppearance({ motionLevel: v })}
        />
      </div>

      <ToggleRow
        label="Disable animations"
        description="Turn off all motion app-wide for maximum performance"
        value={appearance.disableAnimations}
        onChange={v => onAppearance({ disableAnimations: v })}
      />

      <p className="text-2xs text-zinc-600 pt-1">
        Text size, interface scale, and the dyslexia-friendly font are under Appearance.
      </p>
    </div>
  )
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <span className="text-2xs font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">{label}</span>
      <div className="flex-1 h-px bg-white/6" />
    </div>
  )
}

// Segmented option selector (equal-width buttons).
function SegmentRow<T extends string>({ label, hint, icon, options, value, onChange }: {
  label: string
  hint?: string
  icon?: React.ReactNode
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div>
      <p className="text-xs font-medium text-zinc-400 mb-0.5 flex items-center gap-1.5">{icon}{label}</p>
      {hint && <p className="text-2xs text-zinc-600 mb-2.5">{hint}</p>}
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
        {options.map(o => (
          <button key={o.value} onClick={() => onChange(o.value)}
            className={cn('py-2.5 border text-sm transition-colors rounded-lg',
              value === o.value ? 'border-accent-500/60 bg-accent-500/15 text-accent-400'
                : 'border-white/8 text-zinc-400 hover:border-white/15 hover:text-zinc-300')}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Effects ──────────────────────────────────────────────────────────────────
const EFFECTS_PRESETS = [
  { value: 'minimal'     as EffectsPreset, label: 'Minimal',     desc: 'No shadows or blur'       },
  { value: 'balanced'    as EffectsPreset, label: 'Balanced',    desc: 'Subtle depth (default)'   },
  { value: 'modern'      as EffectsPreset, label: 'Modern',      desc: 'Stronger shadows and depth' },
  { value: 'glass'       as EffectsPreset, label: 'Glass',       desc: 'Heavy blur and glow'      },
  { value: 'performance' as EffectsPreset, label: 'Performance', desc: 'GPU-minimal, no effects'  },
]

function EffectsSection({ appearance, onAppearance }: {
  appearance: AppearanceSettings
  onAppearance: (p: Partial<AppearanceSettings>) => void
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-zinc-100 mb-1">Effects</h2>
        <p className="text-sm text-zinc-500">Control shadow depth, blur intensity, and GPU load. Changes apply instantly.</p>
      </div>

      <div className="space-y-2">
        {EFFECTS_PRESETS.map(p => (
          <button key={p.value} onClick={() => onAppearance({ effectsPreset: p.value })}
            className={cn(
              'w-full flex items-center justify-between px-4 py-3 rounded-lg border text-sm transition-colors',
              appearance.effectsPreset === p.value
                ? 'border-accent-500/60 bg-accent-500/15 text-accent-400'
                : 'border-white/8 text-zinc-300 hover:border-white/15 hover:bg-white/3'
            )}>
            <span className="font-medium">{p.label}</span>
            <span className={cn('text-xs', appearance.effectsPreset === p.value ? 'text-accent-400/70' : 'text-zinc-500')}>
              {p.desc}
            </span>
          </button>
        ))}
      </div>

      <p className="text-2xs text-zinc-600">
        "Performance" removes shadows and blur for maximum rendering speed — useful on integrated graphics.
      </p>
    </div>
  )
}

// ─── Layout ───────────────────────────────────────────────────────────────────
function LayoutSection({ appearance, onAppearance }: {
  appearance: AppearanceSettings
  onAppearance: (p: Partial<AppearanceSettings>) => void
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-zinc-100 mb-1">Layout</h2>
        <p className="text-sm text-zinc-500">Adjust how the workspace is arranged.</p>
      </div>

      <SegmentRow<SidebarMode>
        label="Sidebar"
        hint="Compact shows icons only; Expanded adds labels and connection info."
        icon={<PanelLeft size={12} />}
        options={[
          { value: 'compact',  label: 'Compact' },
          { value: 'standard', label: 'Standard' },
          { value: 'expanded', label: 'Expanded' },
        ]}
        value={appearance.sidebarMode}
        onChange={v => onAppearance({ sidebarMode: v })}
      />

      <SegmentRow<DensityMode>
        label="Density"
        hint="Adjusts padding and spacing across cards, lists, and navigation."
        icon={<Layers size={12} />}
        options={[
          { value: 'comfortable', label: 'Comfortable' },
          { value: 'balanced',    label: 'Balanced' },
          { value: 'compact',     label: 'Compact' },
        ]}
        value={appearance.density}
        onChange={v => onAppearance({ density: v })}
      />

      <DashboardPanelsEditor
        panels={appearance.dashboardPanels}
        onChange={p => onAppearance({ dashboardPanels: p })}
      />

      <SidebarNavEditor />
    </div>
  )
}

// ─── Sidebar nav editor ────────────────────────────────────────────────────────
function SidebarNavEditor() {
  const ws      = useWorkspaceStore()
  const active  = ws.active()
  const items   = [...active.sidebarItems].sort((a, b) => a.order - b.order)

  const move = (id: string, dir: -1 | 1) => {
    const idx  = items.findIndex(i => i.id === id)
    const swap = idx + dir
    if (swap < 0 || swap >= items.length) return
    const next = items.map(i => ({ ...i }))
    const tmp      = next[idx].order
    next[idx].order  = next[swap].order
    next[swap].order = tmp
    ws.updateSidebarItems(next)
  }

  const toggle = (id: string) => {
    ws.updateSidebarItems(items.map(i => i.id === id ? { ...i, visible: !i.visible } : i))
  }

  return (
    <div>
      <p className="text-xs font-medium text-zinc-400 mb-0.5 flex items-center gap-1.5">
        <PanelLeft size={12} /> Sidebar navigation
      </p>
      <p className="text-2xs text-zinc-600 mb-3">Toggle visibility and reorder with arrows.</p>
      <div className="space-y-1">
        {items.map((item, i) => (
          <div key={item.id}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-800 border border-white/5">
            <button onClick={() => toggle(item.id)}
              className={cn('w-4 h-4 rounded border shrink-0 flex items-center justify-center',
                item.visible ? 'bg-accent-500 border-accent-500' : 'border-zinc-600 bg-transparent')}>
              {item.visible && <CheckCircle2 size={10} className="text-white" />}
            </button>
            <span className={cn('flex-1 text-xs', item.visible ? 'text-zinc-200' : 'text-zinc-500 line-through')}>
              {item.label}
            </span>
            <div className="flex gap-0.5 shrink-0">
              <button onClick={() => move(item.id, -1)} disabled={i === 0}
                className="p-0.5 text-zinc-600 hover:text-zinc-300 disabled:opacity-30">
                <ChevronUp size={12} />
              </button>
              <button onClick={() => move(item.id, 1)} disabled={i === items.length - 1}
                className="p-0.5 text-zinc-600 hover:text-zinc-300 disabled:opacity-30">
                <ChevronDown size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Background ───────────────────────────────────────────────────────────────
function BackgroundSection({ background, onChange }: {
  background: BackgroundSettings
  onChange: (p: Partial<BackgroundSettings>) => void
}) {
  const [loading, setLoading] = useState(false)
  const bg = background

  const chooseImage = async () => {
    setLoading(true)
    const r = await api.app.chooseBackgroundImage()
    setLoading(false)
    if (r.ok && r.data) onChange({ image: r.data, type: 'image' })
  }

  const filterPreview = [
    bg.blur ? `blur(${Math.min(bg.blur, 6)}px)` : '',
    `brightness(${bg.brightness}%)`, `contrast(${bg.contrast}%)`, `saturate(${bg.saturation}%)`,
  ].filter(Boolean).join(' ')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-zinc-100 mb-1">Background</h2>
        <p className="text-sm text-zinc-500">Personalize the backdrop. The overlay and readability controls keep text legible.</p>
      </div>

      <SegmentRow<BackgroundType>
        label="Type"
        options={[
          { value: 'none',     label: 'None' },
          { value: 'image',    label: 'Image' },
          { value: 'solid',    label: 'Solid' },
          { value: 'gradient', label: 'Gradient' },
        ]}
        value={bg.type}
        onChange={v => onChange({ type: v })}
      />

      {bg.type === 'image' && (
        <>
          <div className="rounded-xl bg-surface-700 border border-white/8 overflow-hidden">
            {bg.image ? (
              <div className="relative h-32">
                <img src={bg.image} alt="Background preview"
                  className="w-full h-full object-cover" style={{ filter: filterPreview, opacity: bg.opacity / 100 }} />
                <div className="absolute inset-0 flex items-center justify-center gap-2">
                  <Button variant="secondary" size="sm" icon={<Image size={12} />} onClick={chooseImage} loading={loading}>Change</Button>
                  <Button variant="danger" size="sm" icon={<Trash2 size={12} />} onClick={() => onChange({ image: null, type: 'none' })}>Remove</Button>
                </div>
              </div>
            ) : (
              <button onClick={chooseImage} disabled={loading}
                className="w-full h-24 flex flex-col items-center justify-center gap-2 text-zinc-500 hover:text-zinc-300 hover:bg-white/3 transition-colors">
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Image size={18} />}
                <span className="text-xs">{loading ? 'Selecting…' : 'Upload background image'}</span>
              </button>
            )}
          </div>

          <SegmentRow<BackgroundScaling>
            label="Scaling"
            options={[
              { value: 'fill',    label: 'Fill' },
              { value: 'fit',     label: 'Fit' },
              { value: 'stretch', label: 'Stretch' },
              { value: 'center',  label: 'Center' },
              { value: 'crop',    label: 'Crop' },
            ]}
            value={bg.scaling}
            onChange={v => onChange({ scaling: v })}
          />

          <SliderRow label="Blur"       value={bg.blur}       min={0} max={40}  step={1} format={v => `${v}px`} onChange={v => onChange({ blur: v })} />
          <SliderRow label="Brightness" value={bg.brightness} min={20} max={200} step={5} format={v => `${v}%`}  onChange={v => onChange({ brightness: v })} />
          <SliderRow label="Contrast"   value={bg.contrast}   min={20} max={200} step={5} format={v => `${v}%`}  onChange={v => onChange({ contrast: v })} />
          <SliderRow label="Saturation" value={bg.saturation} min={0}  max={200} step={5} format={v => `${v}%`}  onChange={v => onChange({ saturation: v })} />
        </>
      )}

      {bg.type === 'solid' && (
        <ColorField label="Color" value={bg.color} onChange={v => onChange({ color: v })} />
      )}

      {bg.type === 'gradient' && (
        <div className="space-y-4">
          <ColorField label="From" value={bg.gradientFrom} onChange={v => onChange({ gradientFrom: v })} />
          <ColorField label="To"   value={bg.gradientTo}   onChange={v => onChange({ gradientTo: v })} />
          <SliderRow label="Angle" value={bg.gradientAngle} min={0} max={360} step={5} format={v => `${v}°`} onChange={v => onChange({ gradientAngle: v })} />
        </div>
      )}

      {bg.type !== 'none' && (
        <>
          <SliderRow label="Layer opacity"  value={bg.opacity}        min={0} max={100} step={5} format={v => `${v}%`} onChange={v => onChange({ opacity: v })} />
          <SliderRow label="Dimming overlay" value={bg.overlayOpacity} min={0} max={90}  step={5} format={v => `${v}%`} onChange={v => onChange({ overlayOpacity: v })} />
          <ToggleRow
            label="Adaptive readability"
            description="Add a subtle scrim behind content so text stays legible"
            value={bg.adaptiveReadability}
            onChange={v => onChange({ adaptiveReadability: v })}
          />
        </>
      )}
    </div>
  )
}

// Single color swatch + native picker.
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-zinc-400">{label}</span>
      <label className="relative w-10 h-7 rounded-md overflow-hidden border border-white/10 cursor-pointer" style={{ background: value }}>
        <input type="color" value={value} onChange={e => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer" />
      </label>
    </div>
  )
}

// ─── Dashboard panel editor ────────────────────────────────────────────────────
const PANEL_LABELS: Record<DashboardPanelId, string> = {
  stats:    'Stats strip',
  overdue:  'Overdue assignments',
  upcoming: 'Upcoming assignments',
  courses:  'Courses grid',
  grades:   'Grade snapshot',
}

function DashboardPanelsEditor({ panels, onChange }: {
  panels: DashboardPanel[]
  onChange: (p: DashboardPanel[]) => void
}) {
  const sorted = [...panels].sort((a, b) => a.order - b.order)

  const move = (id: DashboardPanelId, dir: -1 | 1) => {
    const next = sorted.map(p => ({ ...p }))
    const idx  = next.findIndex(p => p.id === id)
    const swap = idx + dir
    if (swap < 0 || swap >= next.length) return
    const tmp        = next[idx].order
    next[idx].order  = next[swap].order
    next[swap].order = tmp
    onChange(next)
  }

  const toggle = (id: DashboardPanelId) => {
    onChange(panels.map(p => p.id === id ? { ...p, visible: !p.visible } : p))
  }

  return (
    <div>
      <p className="text-xs font-medium text-zinc-400 mb-0.5 flex items-center gap-1.5">
        <BookOpen size={12} /> Dashboard panels
      </p>
      <p className="text-2xs text-zinc-600 mb-3">Toggle visibility and reorder with the arrows.</p>
      <div className="space-y-1">
        {sorted.map((panel, i) => (
          <div key={panel.id}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-800 border border-white/5">
            <button onClick={() => toggle(panel.id)}
              className={cn('w-4 h-4 rounded border shrink-0 flex items-center justify-center',
                panel.visible ? 'bg-accent-500 border-accent-500' : 'border-zinc-600 bg-transparent')}>
              {panel.visible && <CheckCircle2 size={10} className="text-white" />}
            </button>
            <span className={cn('flex-1 text-xs', panel.visible ? 'text-zinc-200' : 'text-zinc-500 line-through')}>
              {PANEL_LABELS[panel.id]}
            </span>
            <div className="flex gap-0.5 shrink-0">
              <button onClick={() => move(panel.id, -1)} disabled={i === 0}
                className="p-0.5 text-zinc-600 hover:text-zinc-300 disabled:opacity-30">
                <ChevronUp size={12} />
              </button>
              <button onClick={() => move(panel.id, 1)} disabled={i === sorted.length - 1}
                className="p-0.5 text-zinc-600 hover:text-zinc-300 disabled:opacity-30">
                <ChevronDown size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Workspace modes ───────────────────────────────────────────────────────────
const WORKSPACE_PRESETS: {
  value: WorkspaceMode; label: string; desc: string
  patch: Partial<AppearanceSettings>
}[] = [
  {
    value: 'default',
    label: 'Default',
    desc: 'Standard layout with all panels',
    patch: {
      sidebarMode: 'standard', density: 'balanced',
      dashboardPanels: [
        { id: 'stats', visible: true, order: 0 }, { id: 'overdue', visible: true, order: 1 },
        { id: 'upcoming', visible: true, order: 2 }, { id: 'courses', visible: true, order: 3 },
        { id: 'grades', visible: true, order: 4 },
      ],
    },
  },
  {
    value: 'study',
    label: 'Study Mode',
    desc: 'Focus on assignments and modules',
    patch: {
      sidebarMode: 'compact', density: 'compact',
      dashboardPanels: [
        { id: 'overdue', visible: true, order: 0 }, { id: 'upcoming', visible: true, order: 1 },
        { id: 'stats', visible: true, order: 2 }, { id: 'courses', visible: false, order: 3 },
        { id: 'grades', visible: false, order: 4 },
      ],
    },
  },
  {
    value: 'planner',
    label: 'Planner Mode',
    desc: 'Prioritise schedule and workload',
    patch: {
      sidebarMode: 'standard', density: 'comfortable',
      dashboardPanels: [
        { id: 'stats', visible: true, order: 0 }, { id: 'upcoming', visible: true, order: 1 },
        { id: 'overdue', visible: true, order: 2 }, { id: 'grades', visible: true, order: 3 },
        { id: 'courses', visible: false, order: 4 },
      ],
    },
  },
  {
    value: 'exam',
    label: 'Exam Mode',
    desc: 'Prioritise study materials, hide distractions',
    patch: {
      sidebarMode: 'compact', density: 'compact',
      dashboardPanels: [
        { id: 'overdue', visible: true, order: 0 }, { id: 'upcoming', visible: true, order: 1 },
        { id: 'stats', visible: false, order: 2 }, { id: 'courses', visible: false, order: 3 },
        { id: 'grades', visible: false, order: 4 },
      ],
    },
  },
  {
    value: 'minimal',
    label: 'Minimal Mode',
    desc: 'Only essential information visible',
    patch: {
      sidebarMode: 'compact', density: 'compact',
      dashboardPanels: [
        { id: 'stats', visible: true, order: 0 }, { id: 'overdue', visible: true, order: 1 },
        { id: 'upcoming', visible: false, order: 2 }, { id: 'courses', visible: false, order: 3 },
        { id: 'grades', visible: false, order: 4 },
      ],
    },
  },
]

function WorkspaceSection({ appearance, onAppearance }: {
  appearance: AppearanceSettings
  onAppearance: (p: Partial<AppearanceSettings>) => void
}) {
  const ws      = useWorkspaceStore()
  const profiles = ws.profiles
  const activeId = ws.activeId
  const [creating, setCreating] = useState(false)
  const [newName,  setNewName]  = useState('')
  const [newIcon,  setNewIcon]  = useState('📚')
  const [editing,  setEditing]  = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editIcon, setEditIcon] = useState('')

  const startCreate = () => { setNewName(''); setNewIcon('📚'); setCreating(true) }
  const confirmCreate = () => {
    if (!newName.trim()) return
    const w = ws.createWorkspace(newName.trim(), newIcon)
    ws.setActive(w.id)
    setCreating(false)
  }

  const startEdit = (p: typeof profiles[0]) => {
    setEditing(p.id); setEditName(p.name); setEditIcon(p.icon)
  }
  const confirmEdit = () => {
    if (editing) ws.renameWorkspace(editing, editName.trim() || 'Workspace', editIcon)
    setEditing(null)
  }

  const EMOJI_OPTIONS = ['📚', '🎯', '📅', '🧠', '🏆', '📊', '🎓', '💡', '🔬', '📝']

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-zinc-100 mb-1">Workspace & Layout</h2>
        <p className="text-sm text-zinc-500">
          Create workspaces for different study contexts. Each workspace remembers its
          own dashboard layout, sidebar order, and page view preferences.
        </p>
      </div>

      {/* Profile list */}
      <div className="space-y-2">
        {profiles.map(p => (
          <div key={p.id}>
            {editing === p.id ? (
              <div className="flex items-center gap-2 p-3 rounded-lg border border-accent-500/40 bg-accent-500/8">
                <select value={editIcon} onChange={e => setEditIcon(e.target.value)}
                  className="bg-surface-700 border border-white/10 rounded text-sm px-1.5 py-1 focus:outline-none">
                  {EMOJI_OPTIONS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
                <input value={editName} onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') confirmEdit() }}
                  autoFocus
                  className="flex-1 bg-surface-700 border border-white/10 rounded-md text-sm text-zinc-200 px-2 py-1 focus:outline-none focus:border-accent-500/60" />
                <Button variant="secondary" size="sm" onClick={confirmEdit}>Save</Button>
                <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
              </div>
            ) : (
              <div className={cn(
                'flex items-center gap-2.5 p-3 rounded-lg border transition-colors',
                p.id === activeId ? 'border-accent-500/50 bg-accent-500/8' : 'border-white/8 hover:border-white/15'
              )}>
                <span className="text-lg shrink-0">{p.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-200 truncate">{p.name}</p>
                  <p className="text-2xs text-zinc-500">{p.widgets?.filter(w => w.visible).length ?? 0} widgets</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {p.id !== activeId && (
                    <Button variant="secondary" size="sm" onClick={() => ws.setActive(p.id)}>
                      Switch
                    </Button>
                  )}
                  {p.id === activeId && (
                    <span className="text-2xs text-accent-400 font-medium px-1.5">Active</span>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => startEdit(p)}>Edit</Button>
                  <Button variant="ghost" size="sm" onClick={() => ws.duplicateWorkspace(p.id)}>Copy</Button>
                  {profiles.length > 1 && (
                    <Button variant="ghost" size="sm"
                      onClick={() => ws.deleteWorkspace(p.id)}
                      className="text-zinc-600 hover:text-red-400">Del</Button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Create new */}
        {creating ? (
          <div className="flex items-center gap-2 p-3 rounded-lg border border-accent-500/40 bg-accent-500/8">
            <select value={newIcon} onChange={e => setNewIcon(e.target.value)}
              className="bg-surface-700 border border-white/10 rounded text-sm px-1.5 py-1 focus:outline-none">
              {EMOJI_OPTIONS.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            <input value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmCreate() }}
              placeholder="Workspace name..."
              autoFocus
              className="flex-1 bg-surface-700 border border-white/10 rounded-md text-sm text-zinc-200 px-2 py-1 focus:outline-none focus:border-accent-500/60" />
            <Button variant="secondary" size="sm" onClick={confirmCreate}>Create</Button>
            <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        ) : (
          <button onClick={startCreate}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-white/10 text-xs text-zinc-500 hover:text-zinc-300 hover:border-white/20 transition-colors">
            <Plus size={12} /> New workspace
          </button>
        )}
      </div>

      {/* Quick layout presets */}
      <div>
        <SectionDivider label="Quick presets" />
        <p className="text-2xs text-zinc-600 mb-3 mt-1">Apply a layout preset to the active workspace.</p>
        <div className="space-y-2">
          {WORKSPACE_PRESETS.map(p => (
            <button key={p.value}
              onClick={() => onAppearance({ workspaceMode: p.value, ...p.patch })}
              className={cn(
                'w-full flex items-center justify-between px-4 py-3 rounded-lg border text-sm transition-colors',
                appearance.workspaceMode === p.value
                  ? 'border-accent-500/60 bg-accent-500/15 text-accent-400'
                  : 'border-white/8 text-zinc-300 hover:border-white/15 hover:bg-white/3'
              )}>
              <span className="font-medium">{p.label}</span>
              <span className={cn('text-xs', appearance.workspaceMode === p.value ? 'text-accent-400/70' : 'text-zinc-500')}>
                {p.desc}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Notifications ────────────────────────────────────────────────────────────
function NotificationsSection({ prefs, onSave }: { prefs: AppPreferences; onSave: (p: Partial<AppPreferences>) => void }) {
  return (
    <div className="space-y-5">
      <div><h2 className="text-base font-semibold text-zinc-100 mb-1">Notifications</h2>
        <p className="text-sm text-zinc-500">Control when Student Hub alerts you.</p></div>
      <ToggleRow label="Enable notifications" description="Show desktop alerts for due dates"
        value={prefs.notificationsEnabled} onChange={v => onSave({ notificationsEnabled: v })} />
      <div>
        <p className="text-xs font-medium text-zinc-400 mb-1.5">Reminder lead time</p>
        <select value={prefs.notificationAdvanceHours} onChange={e => onSave({ notificationAdvanceHours: Number(e.target.value) })}
          disabled={!prefs.notificationsEnabled}
          className="bg-surface-700 border border-white/10 rounded-md text-sm text-zinc-300 px-3 py-1.5 focus:outline-none disabled:opacity-40">
          {[12, 24, 48, 72].map(h => <option key={h} value={h}>{h} hours before due date</option>)}
        </select>
      </div>
    </div>
  )
}

// ─── Sync ─────────────────────────────────────────────────────────────────────
function SyncSection({ prefs, onSave }: { prefs: AppPreferences; onSave: (p: Partial<AppPreferences>) => void }) {
  const [syncing, setSyncing]   = useState(false)
  const [syncMsg, setSyncMsg]   = useState('')

  const handleObsidianSync = async () => {
    setSyncing(true); setSyncMsg('')
    const r = await api.obsidian.syncAll()
    setSyncing(false)
    setSyncMsg(r.ok
      ? `✓ Exported ${r.data.coursesExported} courses · ${r.data.assignmentsExported} assignments`
      : `✗ ${r.error}`)
  }

  const handleBrowseVault = async () => {
    const r = await api.app.chooseVaultPath()
    if (r.ok && r.data) onSave({ obsidianVaultPath: r.data })
  }

  return (
    <div className="space-y-5">
      <div><h2 className="text-base font-semibold text-zinc-100 mb-1">Sync</h2>
        <p className="text-sm text-zinc-500">Configure sync behaviour and Obsidian export.</p></div>
      <div>
        <p className="text-xs font-medium text-zinc-400 mb-1.5">Auto-sync interval</p>
        <select value={prefs.syncIntervalMinutes} onChange={e => onSave({ syncIntervalMinutes: Number(e.target.value) })}
          className="bg-surface-700 border border-white/10 rounded-md text-sm text-zinc-300 px-3 py-1.5 focus:outline-none">
          {[15, 30, 60, 120, 360].map(m => <option key={m} value={m}>Every {m < 60 ? `${m} min` : `${m / 60}h`}</option>)}
        </select>
      </div>
      <div className="rounded-xl bg-surface-800 border border-white/5 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-violet-600 flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold">O</span>
          </div>
          <p className="text-sm font-medium text-zinc-200">Obsidian vault</p>
        </div>
        <div className="flex gap-2">
          <input type="text" readOnly placeholder="No vault selected" value={prefs.obsidianVaultPath ?? ''}
            className="flex-1 bg-surface-700 border border-white/10 rounded-md text-xs text-zinc-300 px-3 py-1.5 cursor-default placeholder:text-zinc-600 font-mono" />
          <Button variant="secondary" size="md" icon={<FolderOpen size={13} />} onClick={handleBrowseVault}>Browse</Button>
        </div>
        {prefs.obsidianVaultPath && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" loading={syncing} onClick={handleObsidianSync}>Sync to vault now</Button>
            {syncMsg && <p className={cn('text-xs', syncMsg.startsWith('✓') ? 'text-green-400' : 'text-red-400')}>{syncMsg}</p>}
          </div>
        )}
      </div>
      <ToggleRow label="Launch at startup" description="Start Student Hub automatically when you log in"
        value={prefs.launchAtStartup} onChange={v => onSave({ launchAtStartup: v })} />
    </div>
  )
}

// ─── About ────────────────────────────────────────────────────────────────────
function AboutSection({ version }: { version: string }) {
  const [checking, setChecking] = useState(false)
  const [msg,      setMsg]      = useState<string | null>(null)

  const checkForUpdates = async () => {
    setChecking(true); setMsg(null)
    const r = await api.updater.check()
    // Read the resulting state to give immediate feedback.
    const st = await api.updater.getState()
    setChecking(false)
    if (!r.ok) { setMsg(`Check failed: ${r.error}`); return }
    if (st.ok) {
      switch (st.data.status) {
        case 'not-available': setMsg("You're on the latest version."); break
        case 'available':
        case 'downloading':   setMsg(`Update found (v${st.data.version}) — downloading…`); break
        case 'downloaded':    setMsg(`Update v${st.data.version} ready — restart to install.`); break
        case 'idle':          setMsg('Update checks run in the installed app only.'); break
        default:              setMsg(null)
      }
    }
  }

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-zinc-100">About</h2>
      <div className="rounded-xl bg-surface-800 border border-white/5 p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-500 flex items-center justify-center">
            <Settings2 size={18} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-100">Student Hub</p>
            <p className="text-xs text-zinc-500">Version {version || '—'}</p>
          </div>
        </div>
        <p className="text-xs text-zinc-500 leading-relaxed">
          Syncs academic data directly from Canvas and other LMS platforms into one organized, offline-capable desktop app.
        </p>
        <div className="flex items-center gap-3 pt-1">
          <Button variant="secondary" size="sm" icon={<RefreshCw size={12} />}
            loading={checking} onClick={checkForUpdates}>
            {checking ? 'Checking…' : 'Check for updates'}
          </Button>
          {msg && <span className="text-xs text-zinc-500">{msg}</span>}
        </div>
      </div>
    </div>
  )
}

// ─── Accent color picker row ────────────────────────────────────────────────────
function AccentRow({ label, hint, presets, value, fallbackHex, onChange }: {
  label: string
  hint: string
  presets: { name: string; value: string }[]
  value: string
  fallbackHex: string
  onChange: (v: string) => void
}) {
  const swatch = (v: string) => v || fallbackHex
  return (
    <div>
      <p className="text-xs font-medium text-zinc-400 mb-0.5">{label}</p>
      <p className="text-2xs text-zinc-600 mb-2.5">{hint}</p>
      <div className="flex items-center gap-2 flex-wrap">
        {presets.map(p => (
          <button key={p.name} title={p.name} onClick={() => onChange(p.value)}
            className={cn('w-7 h-7 rounded-full border-2 transition-transform hover:scale-110',
              value === p.value ? 'border-zinc-100' : 'border-transparent')}
            style={{ background: swatch(p.value) }} />
        ))}
        <label title="Custom color"
          className="relative w-7 h-7 rounded-full overflow-hidden border-2 border-white/10 cursor-pointer flex items-center justify-center"
          style={{ background: swatch(value) }}>
          <Palette size={12} className="text-white mix-blend-difference" />
          <input type="color" value={swatch(value)} onChange={e => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer" />
        </label>
      </div>
    </div>
  )
}

// ─── Slider row ──────────────────────────────────────────────────────────────────
function SliderRow({ label, icon, value, min, max, step, format, onChange }: {
  label: string
  icon?: React.ReactNode
  value: number
  min: number; max: number; step: number
  format: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">{icon}{label}</p>
        <span className="text-xs text-zinc-500">{format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-accent-500" />
    </div>
  )
}

// ─── Shared toggle ─────────────────────────────────────────────────────────────
function ToggleRow({ label, description, value, onChange }: {
  label: string; description?: string; value: boolean; onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-4 py-1 cursor-pointer group">
      <div>
        <p className="text-sm text-zinc-300 group-hover:text-zinc-100 transition-colors">{label}</p>
        {description && <p className="text-xs text-zinc-500">{description}</p>}
      </div>
      <button role="switch" aria-checked={value} onClick={() => onChange(!value)}
        className={cn('relative w-9 h-5 rounded-full transition-colors shrink-0', value ? 'bg-accent-500' : 'bg-surface-600')}>
        <span className={cn('absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform', value ? 'translate-x-4' : 'translate-x-0')} />
      </button>
    </label>
  )
}
