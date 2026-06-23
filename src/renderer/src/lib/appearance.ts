/**
 * Appearance engine.
 *
 * `applyAppearance` writes CSS custom properties + data-* attributes on <html>.
 * Every themeable Tailwind color, radius, spacing-scale, and font resolves to
 * these variables at runtime — so changing any value here re-themes the entire
 * application instantly with no React re-renders required.
 */

import type { AppearanceSettings, BackgroundSettings, DashboardPanel } from '@shared/types/ipc'

// ─── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  themeMode:          'dark',
  accentPrimary:      '',        // '' = built-in indigo ramp (pixel-identical default)
  accentSecondary:    '#6366f1',
  cornerStyle:        'rounded',
  fontFamily:         'sans',
  fontScale:          1,
  uiScale:            1,
  statusSuccess:      '',
  statusWarning:      '',
  statusError:        '',
  statusNotification: '',
  contrast:           'normal',
  reduceTransparency: false,
  colorblind:         'none',
  lineSpacing:        'normal',
  motionLevel:        'standard',
  disableAnimations:  false,
  sidebarMode:        'standard',
  density:            'balanced',
  effectsPreset:      'balanced',
  dashboardPanels: [
    { id: 'stats',    visible: true, order: 0 },
    { id: 'overdue',  visible: true, order: 1 },
    { id: 'upcoming', visible: true, order: 2 },
    { id: 'courses',  visible: true, order: 3 },
    { id: 'grades',   visible: true, order: 4 },
  ] as DashboardPanel[],
  workspaceMode:      'default' as const,
  background: {
    type:                'none',
    image:               null,
    color:               '#0e0e14',
    gradientFrom:        '#1e175a',
    gradientTo:          '#0e0e14',
    gradientAngle:       135,
    scaling:             'fill',
    blur:                0,
    brightness:          100,
    contrast:            100,
    saturation:          100,
    opacity:             100,
    overlayOpacity:      30,
    adaptiveReadability: true,
  },
}

/** Deep-merge stored (possibly partial / older-schema) appearance over defaults. */
export function normalizeAppearance(partial?: Partial<AppearanceSettings> | null): AppearanceSettings {
  return {
    ...DEFAULT_APPEARANCE,
    ...(partial ?? {}),
    background:       { ...DEFAULT_APPEARANCE.background, ...(partial?.background ?? {}) },
    // Deep-merge dashboard panels: honour stored visibility/order but fill in
    // any new panel IDs that didn't exist when the prefs were saved.
    dashboardPanels:  mergePanels(partial?.dashboardPanels),
  }
}

function mergePanels(stored?: DashboardPanel[]): DashboardPanel[] {
  const defaults = DEFAULT_APPEARANCE.dashboardPanels
  if (!stored?.length) return defaults
  const byId = new Map(stored.map(p => [p.id, p]))
  // Keep stored panels; append any new default panels not yet in stored.
  const merged = defaults.map(d => byId.get(d.id) ?? d)
  return merged
}

// ─── Preset tables ────────────────────────────────────────────────────────────

export const ACCENT_PRESETS: { name: string; value: string }[] = [
  { name: 'Indigo',  value: '' },
  { name: 'Violet',  value: '#8b5cf6' },
  { name: 'Blue',    value: '#3b82f6' },
  { name: 'Cyan',    value: '#06b6d4' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Amber',   value: '#f59e0b' },
  { name: 'Rose',    value: '#f43f5e' },
  { name: 'Pink',    value: '#ec4899' },
]
export const SECONDARY_PRESETS: { name: string; value: string }[] = [
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Cyan',   value: '#22d3ee' },
  { name: 'Teal',   value: '#14b8a6' },
  { name: 'Violet', value: '#a78bfa' },
  { name: 'Pink',   value: '#f472b6' },
  { name: 'Lime',   value: '#a3e635' },
]
export const SUCCESS_PRESETS: { name: string; value: string }[] = [
  { name: 'Green', value: '' }, { name: 'Emerald', value: '#10b981' },
  { name: 'Teal',  value: '#14b8a6' }, { name: 'Lime', value: '#65a30d' },
]
export const WARNING_PRESETS: { name: string; value: string }[] = [
  { name: 'Amber', value: '' }, { name: 'Orange', value: '#f97316' },
  { name: 'Yellow', value: '#eab308' },
]
export const ERROR_PRESETS: { name: string; value: string }[] = [
  { name: 'Red', value: '' }, { name: 'Rose', value: '#f43f5e' },
  { name: 'Pink', value: '#ec4899' },
]
export const NOTIFICATION_PRESETS: { name: string; value: string }[] = [
  { name: 'Blue', value: '' }, { name: 'Sky', value: '#0ea5e9' },
  { name: 'Violet', value: '#8b5cf6' }, { name: 'Cyan', value: '#06b6d4' },
]

// ─── Color math ───────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, n)) }

function parseHex(hex: string): [number, number, number] | null {
  const m = hex.trim().replace(/^#/, '')
  if (m.length === 3) {
    return [
      parseInt(m[0] + m[0], 16),
      parseInt(m[1] + m[1], 16),
      parseInt(m[2] + m[2], 16),
    ]
  }
  if (m.length === 6) {
    const r = parseInt(m.slice(0, 2), 16)
    const g = parseInt(m.slice(2, 4), 16)
    const b = parseInt(m.slice(4, 6), 16)
    if ([r, g, b].some(Number.isNaN)) return null
    return [r, g, b]
  }
  return null
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  const d = max - min
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      default: h = (r - g) / d + 4
    }
    h /= 6
  }
  return [h * 360, s * 100, l * 100]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360; s /= 100; l /= 100
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v] }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue = (t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [Math.round(hue(h + 1 / 3) * 255), Math.round(hue(h) * 255), Math.round(hue(h - 1 / 3) * 255)]
}

export function toChannels(hex: string): string | null {
  const rgb = parseHex(hex)
  return rgb ? rgb.join(' ') : null
}

const ACCENT_SHADES: [string, number][] = [
  ['50', 97], ['100', 93], ['200', 86], ['300', 76], ['400', 66],
  ['500', 57], ['600', 49], ['700', 41], ['800', 34], ['900', 28], ['950', 18],
]
const ACCENT_KEYS = ACCENT_SHADES.map(([k]) => k)

export function deriveAccentRamp(hex: string): Record<string, string> | null {
  const rgb = parseHex(hex)
  if (!rgb) return null
  const [h, s] = rgbToHsl(...rgb)
  const sat = clamp(s, 35, 92)
  const ramp: Record<string, string> = {}
  for (const [key, lightness] of ACCENT_SHADES) {
    ramp[key] = hslToRgb(h, sat, lightness).join(' ')
  }
  return ramp
}

function applyStatusRamp(root: HTMLElement, prefix: string, hex: string): void {
  const ramp = hex ? deriveAccentRamp(hex) : null
  if (ramp) {
    for (const k of ACCENT_KEYS) root.style.setProperty(`--${prefix}-${k}`, ramp[k])
  } else {
    for (const k of ACCENT_KEYS) root.style.removeProperty(`--${prefix}-${k}`)
  }
}

// ─── Effects presets ──────────────────────────────────────────────────────────

type EffectsVars = {
  shadow: string; shadowLg: string; shadowSm: string
  glassBlur: string; glassOpacity: string
}

const EFFECTS_MAP: Record<string, EffectsVars> = {
  minimal:     { shadow: 'none', shadowLg: 'none', shadowSm: 'none', glassBlur: '0px', glassOpacity: '0' },
  balanced:    { shadow: '0 1px 3px 0 rgb(0 0 0/0.18),0 1px 2px -1px rgb(0 0 0/0.18)', shadowLg: '0 4px 16px -2px rgb(0 0 0/0.3)', shadowSm: '0 1px 2px 0 rgb(0 0 0/0.1)', glassBlur: '12px', glassOpacity: '0.08' },
  modern:      { shadow: '0 2px 8px -1px rgb(0 0 0/0.28),0 2px 4px -2px rgb(0 0 0/0.22)', shadowLg: '0 8px 30px -4px rgb(0 0 0/0.4)', shadowSm: '0 1px 3px 0 rgb(0 0 0/0.16)', glassBlur: '18px', glassOpacity: '0.12' },
  glass:       { shadow: '0 4px 24px -2px rgb(0 0 0/0.35)', shadowLg: '0 12px 48px -6px rgb(0 0 0/0.5)', shadowSm: '0 1px 4px 0 rgb(0 0 0/0.18)', glassBlur: '32px', glassOpacity: '0.18' },
  performance: { shadow: 'none', shadowLg: 'none', shadowSm: 'none', glassBlur: '0px', glassOpacity: '0' },
}

// ─── Theme resolution ─────────────────────────────────────────────────────────

function resolveTheme(mode: AppearanceSettings['themeMode']): 'light' | 'dark' | 'oled' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return mode
}

// ─── Main apply function ──────────────────────────────────────────────────────

/**
 * Apply the full appearance to the document. Safe to call on every change.
 * All mutations are on <html> (dataset / style), so every CSS var and attribute
 * resolves correctly for all descendants without touching individual components.
 */
export function applyAppearance(a: AppearanceSettings): void {
  const root = document.documentElement

  // Theme
  const effective = resolveTheme(a.themeMode)
  root.dataset.theme = effective
  root.classList.toggle('dark', effective !== 'light')

  // Primary accent ramp
  const ramp = a.accentPrimary ? deriveAccentRamp(a.accentPrimary) : null
  if (ramp) {
    for (const k of ACCENT_KEYS) root.style.setProperty(`--accent-${k}`, ramp[k])
  } else {
    for (const k of ACCENT_KEYS) root.style.removeProperty(`--accent-${k}`)
  }

  // Secondary accent → focus rings, selection, scrollbar hover
  const sec = toChannels(a.accentSecondary)
  if (sec) root.style.setProperty('--accent2', sec)
  else     root.style.removeProperty('--accent2')

  // Status color ramps
  applyStatusRamp(root, 'green', a.statusSuccess)
  applyStatusRamp(root, 'amber', a.statusWarning)
  applyStatusRamp(root, 'red',   a.statusError)
  applyStatusRamp(root, 'blue',  a.statusNotification)

  // Corner style (CSS picks up via [data-corner='sharp'] etc.)
  root.dataset.corner = a.cornerStyle

  // Font family (CSS picks up via [data-font='sans'] etc.)
  root.dataset.font = a.fontFamily

  // Font scale → html { font-size: calc(16px * var(--font-scale)) }
  root.style.setProperty('--font-scale', String(clamp(a.fontScale, 0.7, 1.6)))

  // UI scale → Electron webFrame zoom (scales the layout viewport, not just an element)
  const zoom = clamp(a.uiScale, 0.7, 1.4)
  try {
    // window.api is injected by the preload; safe to call from renderer modules.
    ;(window as Window & { api?: { app?: { setZoomFactor?: (f: number) => void } } })
      .api?.app?.setZoomFactor?.(zoom)
  } catch { /* ignore — called before preload or in test context */ }

  // Accessibility
  root.dataset.contrast           = a.contrast
  root.dataset.reduceTransparency = a.reduceTransparency ? 'true' : 'false'
  root.dataset.colorblind         = a.colorblind
  root.dataset.lineSpacing        = a.lineSpacing

  // Motion (--motion-speed consumed by explicit transition classes in index.css)
  root.dataset.motion     = a.motionLevel
  root.dataset.animations = a.disableAnimations ? 'off' : 'on'
  // Write the duration directly on <html> so Tailwind's .transition classes
  // inherit it (Tailwind sets transition-duration on the class; we override it
  // here on the root element so all transitions pick up the chosen speed).
  const dur = { smooth: '280ms', standard: '150ms', snappy: '80ms', reduced: '50ms' }
  root.style.setProperty('--motion-duration', dur[a.motionLevel] ?? '150ms')

  // Layout
  root.dataset.sidebar = a.sidebarMode
  root.dataset.density  = a.density

  // Effects preset
  const fx = EFFECTS_MAP[a.effectsPreset] ?? EFFECTS_MAP.balanced
  root.style.setProperty('--shadow',         fx.shadow)
  root.style.setProperty('--shadow-lg',      fx.shadowLg)
  root.style.setProperty('--shadow-sm',      fx.shadowSm)
  root.style.setProperty('--glass-blur',     fx.glassBlur)
  root.style.setProperty('--glass-opacity',  fx.glassOpacity)
}

// ─── Background helpers ───────────────────────────────────────────────────────

export function backgroundFilter(bg: BackgroundSettings): string {
  return [
    bg.blur         ? `blur(${bg.blur}px)`              : '',
    bg.brightness !== 100 ? `brightness(${bg.brightness}%)` : '',
    bg.contrast   !== 100 ? `contrast(${bg.contrast}%)`     : '',
    bg.saturation !== 100 ? `saturate(${bg.saturation}%)`   : '',
  ].filter(Boolean).join(' ')
}

export function backgroundSizing(scaling: BackgroundSettings['scaling']): {
  size: string; repeat: string; position: string
} {
  switch (scaling) {
    case 'fit':     return { size: 'contain',   repeat: 'no-repeat', position: 'center' }
    case 'stretch': return { size: '100% 100%', repeat: 'no-repeat', position: 'center' }
    case 'center':  return { size: 'auto',      repeat: 'no-repeat', position: 'center' }
    case 'crop':
    case 'fill':
    default:        return { size: 'cover',     repeat: 'no-repeat', position: 'center' }
  }
}

// ─── Framer Motion helper ─────────────────────────────────────────────────────

export function framerReducedMotion(a: AppearanceSettings): 'always' | 'never' {
  return a.disableAnimations || a.motionLevel === 'reduced' ? 'always' : 'never'
}

// ─── OS theme watcher ─────────────────────────────────────────────────────────

export function watchSystemTheme(onChange: () => void): () => void {
  const q = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = () => onChange()
  q.addEventListener('change', handler)
  return () => q.removeEventListener('change', handler)
}
