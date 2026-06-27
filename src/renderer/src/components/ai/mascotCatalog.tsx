// Byte's wardrobe catalog. Everything is layered, procedurally-drawn SVG (offline,
// CSP-safe, matches Byte's SVG nature) so we can offer a LOT of options without any
// image assets. Accessory layers draw over the body inside the 200×200 viewBox;
// the body droplet spans x∈[32,168], head top ≈ y40, eyes at y≈108, neck ≈ y148,
// bottom ≈ y170. Adding an option = appending one entry here; the wardrobe UI and
// Companion both map over these arrays, so nothing else needs touching.
import type { ReactNode } from 'react'

const INK = '#0e1320'

export interface MascotConfig {
  bodyColor: string
  hat: string
  glasses: string
  outfit: string
  eyeStyle: string
  reactionStyle: string
}

export const DEFAULT_MASCOT_CONFIG: MascotConfig = {
  bodyColor: 'blue', hat: 'none', glasses: 'none', outfit: 'none', eyeStyle: 'sparkle', reactionStyle: 'normal',
}

export function parseMascotConfig(raw: string | undefined | null): MascotConfig {
  if (!raw) return { ...DEFAULT_MASCOT_CONFIG }
  try { return { ...DEFAULT_MASCOT_CONFIG, ...JSON.parse(raw) } } catch { return { ...DEFAULT_MASCOT_CONFIG } }
}

// ── Body colours (gradient top/bottom) ──────────────────────────────────────
export interface BodyColor { id: string; label: string; top: string; bot: string }
export const BODY_COLORS: BodyColor[] = [
  { id: 'blue',   label: 'Blueberry', top: '#74b1f7', bot: '#4f8fe8' },
  { id: 'teal',   label: 'Teal',      top: '#5fd3d0', bot: '#33a8a8' },
  { id: 'mint',   label: 'Mint',      top: '#86e3b4', bot: '#4fc486' },
  { id: 'green',  label: 'Slime',     top: '#9ad84f', bot: '#6fb52e' },
  { id: 'lemon',  label: 'Lemon',     top: '#ffd86b', bot: '#f5b942' },
  { id: 'orange', label: 'Tangerine', top: '#ffb07a', bot: '#f5803a' },
  { id: 'coral',  label: 'Coral',     top: '#ff9a8b', bot: '#f56b5a' },
  { id: 'pink',   label: 'Bubblegum', top: '#ff9ecb', bot: '#f56fa8' },
  { id: 'rose',   label: 'Rose',      top: '#f47ea0', bot: '#d94e78' },
  { id: 'purple', label: 'Grape',     top: '#b79cf7', bot: '#8b6fe8' },
  { id: 'indigo', label: 'Indigo',    top: '#8f93f0', bot: '#5d63d6' },
  { id: 'slate',  label: 'Storm',     top: '#9aa6bd', bot: '#6b7790' },
  { id: 'ink',    label: 'Midnight',  top: '#4a5573', bot: '#2c3450' },
  { id: 'cloud',  label: 'Cloud',     top: '#f1f5fb', bot: '#cdd6e6' },
]
export function bodyColor(id: string): BodyColor {
  return BODY_COLORS.find(c => c.id === id) ?? BODY_COLORS[0]
}

// ── Generic catalog entry: a label + a render fn returning SVG over the body ──
export interface Accessory { id: string; label: string; render: () => ReactNode }

// Helper for the swatch preview thumbnails (small standalone SVG).
function none(): ReactNode { return null }

// ── Hats / headwear ─────────────────────────────────────────────────────────
export const HATS: Accessory[] = [
  { id: 'none', label: 'None', render: none },
  { id: 'grad', label: 'Grad cap', render: () => (
    <g>
      <rect x="74" y="34" width="52" height="9" rx="2" fill={INK} transform="rotate(-3 100 38)" />
      <polygon points="100,20 138,34 100,46 62,34" fill="#1b2233" stroke={INK} strokeWidth="2" />
      <rect x="97" y="20" width="6" height="6" fill="#f5b942" />
      <path d="M132 34 v14" stroke="#f5b942" strokeWidth="2.5" />
      <circle cx="132" cy="50" r="3.5" fill="#f5b942" />
    </g>
  ) },
  { id: 'beanie', label: 'Beanie', render: () => (
    <g>
      <path d="M64 50 a36 30 0 0 1 72 0 Z" fill="#e2575f" stroke={INK} strokeWidth="3" />
      <rect x="62" y="46" width="76" height="9" rx="4" fill="#c8434b" stroke={INK} strokeWidth="3" />
      <circle cx="100" cy="20" r="7" fill="#fff" stroke={INK} strokeWidth="3" />
    </g>
  ) },
  { id: 'party', label: 'Party hat', render: () => (
    <g>
      <polygon points="100,14 84,52 116,52" fill="#ff6fa8" stroke={INK} strokeWidth="3" />
      <circle cx="100" cy="14" r="5" fill="#ffd86b" stroke={INK} strokeWidth="2" />
      <circle cx="92" cy="34" r="2.5" fill="#fff" /><circle cx="106" cy="28" r="2.5" fill="#fff" /><circle cx="104" cy="44" r="2.5" fill="#fff" />
    </g>
  ) },
  { id: 'crown', label: 'Crown', render: () => (
    <g>
      <path d="M70 50 L74 26 L88 42 L100 22 L112 42 L126 26 L130 50 Z" fill="#ffd14d" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <circle cx="100" cy="36" r="3" fill="#ff5a7a" /><circle cx="80" cy="44" r="2.5" fill="#5ad1ff" /><circle cx="120" cy="44" r="2.5" fill="#5ad1ff" />
    </g>
  ) },
  { id: 'halo', label: 'Halo', render: () => (
    <g>
      <ellipse cx="100" cy="30" rx="26" ry="7" fill="none" stroke="#ffe27a" strokeWidth="5" />
      <ellipse cx="100" cy="30" rx="26" ry="7" fill="none" stroke="#fff7cc" strokeWidth="1.5" />
    </g>
  ) },
  { id: 'tophat', label: 'Top hat', render: () => (
    <g>
      <rect x="64" y="44" width="72" height="8" rx="3" fill="#1b2233" stroke={INK} strokeWidth="2" />
      <rect x="78" y="16" width="44" height="32" rx="3" fill="#262d40" stroke={INK} strokeWidth="2" />
      <rect x="78" y="38" width="44" height="6" fill="#e2575f" />
    </g>
  ) },
  { id: 'cap', label: 'Ball cap', render: () => (
    <g>
      <path d="M66 46 a34 28 0 0 1 68 0 Z" fill="#3b82f6" stroke={INK} strokeWidth="3" />
      <path d="M100 46 h40 a8 8 0 0 1 0 8 H100 Z" fill="#2c66c9" stroke={INK} strokeWidth="3" />
      <circle cx="100" cy="22" r="3.5" fill="#1b2233" />
    </g>
  ) },
  { id: 'propeller', label: 'Propeller', render: () => (
    <g>
      <path d="M70 48 a30 22 0 0 1 60 0 Z" fill="#5ad1ff" stroke={INK} strokeWidth="3" />
      <path d="M82 48 h36 M88 40 h24" stroke="#2c66c9" strokeWidth="2" />
      <rect x="98" y="14" width="4" height="12" fill={INK} />
      <path d="M100 14 l16 -5 -16 5 -16 -5 16 5" stroke="#e2575f" strokeWidth="5" strokeLinecap="round" />
    </g>
  ) },
  { id: 'headphones', label: 'Headphones', render: () => (
    <g>
      <path d="M64 108 V96 a36 40 0 0 1 72 0 V108" fill="none" stroke={INK} strokeWidth="6" />
      <rect x="56" y="100" width="14" height="26" rx="6" fill="#e2575f" stroke={INK} strokeWidth="3" />
      <rect x="130" y="100" width="14" height="26" rx="6" fill="#e2575f" stroke={INK} strokeWidth="3" />
    </g>
  ) },
  { id: 'bow', label: 'Big bow', render: () => (
    <g transform="translate(100 40)">
      <path d="M0 0 L-22 -10 L-22 10 Z" fill="#ff6fa8" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <path d="M0 0 L22 -10 L22 10 Z" fill="#ff6fa8" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <circle cx="0" cy="0" r="6" fill="#ff8fbf" stroke={INK} strokeWidth="3" />
    </g>
  ) },
  { id: 'flower', label: 'Flower', render: () => (
    <g transform="translate(126 44)">
      {[0, 72, 144, 216, 288].map(a => (
        <ellipse key={a} cx="0" cy="-9" rx="5" ry="8" fill="#ff8fbf" stroke={INK} strokeWidth="2" transform={`rotate(${a})`} />
      ))}
      <circle cx="0" cy="0" r="5" fill="#ffd86b" stroke={INK} strokeWidth="2" />
    </g>
  ) },
  { id: 'witch', label: 'Witch hat', render: () => (
    <g>
      <path d="M60 52 q40 -10 80 0 q-10 6 -40 6 q-30 0 -40 -6 Z" fill="#5b3aa0" stroke={INK} strokeWidth="3" />
      <path d="M100 12 q14 28 22 40 q-22 6 -44 0 q8 -12 22 -40 Z" fill="#6a47b8" stroke={INK} strokeWidth="3" />
      <rect x="86" y="42" width="28" height="7" fill="#ffd86b" />
    </g>
  ) },
]

// ── Glasses / eyewear (drawn over the eyes at y≈108) ─────────────────────────
export const GLASSES: Accessory[] = [
  { id: 'none', label: 'None', render: none },
  { id: 'round', label: 'Round', render: () => (
    <g fill="none" stroke={INK} strokeWidth="3">
      <circle cx="84" cy="108" r="11" /><circle cx="116" cy="108" r="11" />
      <path d="M95 108 h10 M73 105 l-9 -3 M127 105 l9 -3" />
    </g>
  ) },
  { id: 'sun', label: 'Sunglasses', render: () => (
    <g stroke={INK} strokeWidth="3">
      <rect x="72" y="100" width="24" height="15" rx="6" fill="#1b2233" />
      <rect x="104" y="100" width="24" height="15" rx="6" fill="#1b2233" />
      <path d="M96 104 h8 M72 102 l-8 -3 M128 102 l8 -3" fill="none" />
    </g>
  ) },
  { id: 'nerd', label: 'Nerd', render: () => (
    <g fill="none" stroke={INK} strokeWidth="4.5">
      <rect x="71" y="99" width="26" height="19" rx="4" fill="rgba(255,255,255,0.25)" />
      <rect x="103" y="99" width="26" height="19" rx="4" fill="rgba(255,255,255,0.25)" />
      <path d="M97 106 h6" />
    </g>
  ) },
  { id: 'monocle', label: 'Monocle', render: () => (
    <g fill="none" stroke={INK} strokeWidth="3">
      <circle cx="116" cy="108" r="12" fill="rgba(255,255,255,0.18)" />
      <path d="M116 120 v10 l6 6" />
    </g>
  ) },
  { id: '3d', label: '3D glasses', render: () => (
    <g stroke={INK} strokeWidth="3">
      <rect x="72" y="100" width="24" height="15" rx="3" fill="#ff3b3b" opacity="0.8" />
      <rect x="104" y="100" width="24" height="15" rx="3" fill="#3bd6ff" opacity="0.8" />
      <path d="M96 104 h8" fill="none" />
    </g>
  ) },
  { id: 'star', label: 'Star shades', render: () => (
    <g stroke={INK} strokeWidth="2.5" fill="#ffd14d">
      <Star cx={84} cy={108} r={13} />
      <Star cx={116} cy={108} r={13} />
      <path d="M97 106 h6" fill="none" stroke={INK} strokeWidth="3" />
    </g>
  ) },
  { id: 'heart', label: 'Heart shades', render: () => (
    <g stroke={INK} strokeWidth="2.5" fill="#ff6fa8">
      <Heart cx={84} cy={108} s={13} />
      <Heart cx={116} cy={108} s={13} />
      <path d="M97 107 h6" fill="none" stroke={INK} strokeWidth="3" />
    </g>
  ) },
]

// ── Outfits / neck & body accessories ────────────────────────────────────────
export const OUTFITS: Accessory[] = [
  { id: 'none', label: 'None', render: none },
  { id: 'bowtie', label: 'Bow tie', render: () => (
    <g transform="translate(100 150)">
      <path d="M0 0 L-16 -8 L-16 8 Z" fill="#e2575f" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M0 0 L16 -8 L16 8 Z" fill="#e2575f" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="-4" y="-5" width="8" height="10" rx="2" fill="#c8434b" stroke={INK} strokeWidth="2" />
    </g>
  ) },
  { id: 'tie', label: 'Necktie', render: () => (
    <g>
      <path d="M96 144 l8 0 -2 8 6 18 -8 8 -8 -8 6 -18 Z" fill="#3b82f6" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
    </g>
  ) },
  { id: 'scarf', label: 'Scarf', render: () => (
    <g>
      <path d="M70 150 q30 12 60 0 l0 8 q-30 12 -60 0 Z" fill="#e2575f" stroke={INK} strokeWidth="2.5" />
      <rect x="74" y="158" width="9" height="18" rx="3" fill="#c8434b" stroke={INK} strokeWidth="2.5" />
    </g>
  ) },
  { id: 'collar', label: 'Shirt collar', render: () => (
    <g fill="#fff" stroke={INK} strokeWidth="2.5">
      <path d="M86 146 l14 10 -14 6 -6 -10 Z" />
      <path d="M114 146 l-14 10 14 6 6 -10 Z" />
      <circle cx="100" cy="162" r="2.5" fill="#3b82f6" stroke="none" />
    </g>
  ) },
  { id: 'medal', label: 'Gold medal', render: () => (
    <g>
      <path d="M92 144 l8 16 8 -16" fill="none" stroke="#e2575f" strokeWidth="3" />
      <circle cx="100" cy="166" r="9" fill="#ffd14d" stroke={INK} strokeWidth="2.5" />
      <Star cx={100} cy={166} r={5} fill="#f5b942" />
    </g>
  ) },
  { id: 'cape', label: 'Hero cape', render: () => (
    <g>
      <path d="M64 150 q36 16 72 0 l-8 22 q-28 10 -56 0 Z" fill="#e2575f" stroke={INK} strokeWidth="2.5" opacity="0.92" />
    </g>
  ) },
  { id: 'straps', label: 'Backpack', render: () => (
    <g fill="none" stroke="#3b82f6" strokeWidth="6" strokeLinecap="round">
      <path d="M84 146 q-4 14 0 26" /><path d="M116 146 q4 14 0 26" />
    </g>
  ) },
  { id: 'lei', label: 'Flower lei', render: () => (
    <g>
      {[78, 90, 100, 110, 122].map((x, i) => (
        <circle key={x} cx={x} cy={150 + (i === 2 ? 4 : i === 1 || i === 3 ? 2 : 0)} r="5"
          fill={['#ff8fbf', '#ffd86b', '#86e3b4', '#5ad1ff', '#ff8fbf'][i]} stroke={INK} strokeWidth="2" />
      ))}
    </g>
  ) },
]

// ── Eye styles (used by Companion's Face) ────────────────────────────────────
export const EYE_STYLES: { id: string; label: string }[] = [
  { id: 'sparkle', label: 'Sparkly' },
  { id: 'dot',     label: 'Dot' },
  { id: 'wide',    label: 'Big' },
  { id: 'star',    label: 'Star' },
  { id: 'sleepy',  label: 'Sleepy' },
  { id: 'cat',     label: 'Cat' },
]

export const REACTION_STYLES: { id: string; label: string; bob: number; speed: number }[] = [
  { id: 'normal', label: 'Balanced', bob: 1, speed: 1 },
  { id: 'bouncy', label: 'Bouncy',   bob: 1.7, speed: 1.5 },
  { id: 'calm',   label: 'Calm',     bob: 0.55, speed: 0.7 },
]
export function reactionStyle(id: string) {
  return REACTION_STYLES.find(r => r.id === id) ?? REACTION_STYLES[0]
}

// ── Small shared shapes ──────────────────────────────────────────────────────
export function Star({ cx, cy, r, fill }: { cx: number; cy: number; r: number; fill?: string }) {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const ang = (Math.PI / 5) * i - Math.PI / 2
    const rad = i % 2 === 0 ? r : r * 0.45
    pts.push(`${cx + rad * Math.cos(ang)},${cy + rad * Math.sin(ang)}`)
  }
  return <polygon points={pts.join(' ')} fill={fill ?? 'currentColor'} />
}

export function Heart({ cx, cy, s, fill }: { cx: number; cy: number; s: number; fill?: string }) {
  const d = `M${cx} ${cy + s * 0.5} C ${cx - s} ${cy - s * 0.4}, ${cx - s * 0.5} ${cy - s}, ${cx} ${cy - s * 0.35} C ${cx + s * 0.5} ${cy - s}, ${cx + s} ${cy - s * 0.4}, ${cx} ${cy + s * 0.5} Z`
  return <path d={d} fill={fill ?? 'currentColor'} />
}

export const CATALOG = { BODY_COLORS, HATS, GLASSES, OUTFITS, EYE_STYLES, REACTION_STYLES }
