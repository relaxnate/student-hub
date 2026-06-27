// Byte's wardrobe — a dresser dialog to customize body colour, eyes, hat, glasses,
// outfit, and "vibe" (reaction energy). Live preview on the left, category tabs +
// swatch grids on the right. Every option is procedurally-drawn SVG from
// mascotCatalog, so the grids are generated from those arrays — adding a costume
// there makes it appear here automatically. Changes apply live (onChange).
import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Shirt, RotateCcw } from 'lucide-react'
import { Companion } from './Companion'
import {
  BODY_COLORS, EYE_STYLES, HATS, GLASSES, OUTFITS, REACTION_STYLES,
  bodyColor, DEFAULT_MASCOT_CONFIG, type MascotConfig, type Accessory,
} from './mascotCatalog'

type Cat = 'body' | 'eyes' | 'hat' | 'glasses' | 'outfit' | 'vibe'
const TABS: { id: Cat; label: string }[] = [
  { id: 'body', label: 'Colour' },
  { id: 'eyes', label: 'Eyes' },
  { id: 'hat', label: 'Hat' },
  { id: 'glasses', label: 'Glasses' },
  { id: 'outfit', label: 'Outfit' },
  { id: 'vibe', label: 'Vibe' },
]

export function MascotWardrobe({ open, onOpenChange, config, onChange }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  config: MascotConfig
  onChange: (c: MascotConfig) => void
}) {
  const [tab, setTab] = useState<Cat>('body')
  const set = (patch: Partial<MascotConfig>) => onChange({ ...config, ...patch })

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[min(760px,94vw)] max-h-[88vh] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-1,#15151c)] shadow-2xl flex flex-col">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--border)]">
            <Shirt size={18} className="text-[var(--accent,#6366f1)]" />
            <Dialog.Title className="text-base font-semibold">Byte's Wardrobe</Dialog.Title>
            <button onClick={() => onChange({ ...DEFAULT_MASCOT_CONFIG })}
              title="Reset to default look"
              className="ml-auto flex items-center gap-1 text-xs px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--surface-2)]">
              <RotateCcw size={13} /> Reset
            </button>
            <Dialog.Close asChild>
              <button className="p-1.5 rounded hover:bg-[var(--surface-2)]" aria-label="Close"><X size={16} /></button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Customize the appearance of the Byte mascot.</Dialog.Description>

          <div className="flex min-h-0 flex-1">
            {/* Live preview */}
            <div className="w-[230px] shrink-0 border-r border-[var(--border)] flex flex-col items-center justify-center p-5 gap-3 bg-[var(--surface-2,rgba(255,255,255,0.02))]">
              <Companion usageFraction={0} isThinking={false} isListening={false} size={170} config={config} />
              <div className="text-xs text-[var(--text-secondary)] text-center">Live preview — changes save instantly.</div>
            </div>

            {/* Category tabs + swatch grid */}
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="flex gap-1 px-4 pt-3 flex-wrap">
                {TABS.map(t => (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    className={`text-xs px-3 py-1.5 rounded-full border ${tab === t.id
                      ? 'bg-[var(--accent,#6366f1)] text-white border-transparent'
                      : 'border-[var(--border)] hover:bg-[var(--surface-2)]'}`}>
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {tab === 'body' && (
                  <Grid>
                    {BODY_COLORS.map(c => (
                      <Swatch key={c.id} label={c.label} selected={config.bodyColor === c.id} onClick={() => set({ bodyColor: c.id })}>
                        <BodyOnly colorId={c.id} />
                      </Swatch>
                    ))}
                  </Grid>
                )}
                {tab === 'eyes' && (
                  <Grid>
                    {EYE_STYLES.map(e => (
                      <Swatch key={e.id} label={e.label} selected={config.eyeStyle === e.id} onClick={() => set({ eyeStyle: e.id })}>
                        <MiniByte config={{ ...config, eyeStyle: e.id, hat: 'none', glasses: 'none', outfit: 'none' }} />
                      </Swatch>
                    ))}
                  </Grid>
                )}
                {tab === 'hat' && <AccessoryGrid list={HATS} value={config.hat} config={config} onPick={id => set({ hat: id })} />}
                {tab === 'glasses' && <AccessoryGrid list={GLASSES} value={config.glasses} config={config} onPick={id => set({ glasses: id })} />}
                {tab === 'outfit' && <AccessoryGrid list={OUTFITS} value={config.outfit} config={config} onPick={id => set({ outfit: id })} />}
                {tab === 'vibe' && (
                  <Grid>
                    {REACTION_STYLES.map(r => (
                      <Swatch key={r.id} label={r.label} selected={config.reactionStyle === r.id} onClick={() => set({ reactionStyle: r.id })}>
                        <MiniByte config={{ ...config, hat: 'none', glasses: 'none', outfit: 'none' }} />
                      </Swatch>
                    ))}
                  </Grid>
                )}
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">{children}</div>
}

function AccessoryGrid({ list, value, config, onPick }: {
  list: Accessory[]; value: string; config: MascotConfig; onPick: (id: string) => void
}) {
  return (
    <Grid>
      {list.map(a => (
        <Swatch key={a.id} label={a.label} selected={value === a.id} onClick={() => onPick(a.id)}>
          <MiniByte config={{ ...config, hat: 'none', glasses: 'none', outfit: 'none' }} extra={a.render()} />
        </Swatch>
      ))}
    </Grid>
  )
}

function Swatch({ label, selected, onClick, children }: {
  label: string; selected: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-lg border p-2 transition ${selected
        ? 'border-[var(--accent,#6366f1)] bg-[var(--accent,#6366f1)]/10 ring-1 ring-[var(--accent,#6366f1)]'
        : 'border-[var(--border)] hover:bg-[var(--surface-2)]'}`}>
      <div className="w-full aspect-square rounded-md bg-[var(--surface-2,rgba(255,255,255,0.03))] overflow-hidden">
        {children}
      </div>
      <span className="text-[10px] text-[var(--text-secondary)] truncate w-full text-center">{label}</span>
    </button>
  )
}

// ── Tiny static SVG previews (no animation, cheap to render many at once) ─────
function BodyOnly({ colorId }: { colorId: string }) {
  const c = bodyColor(colorId)
  return (
    <svg viewBox="0 0 200 200" className="w-full h-full">
      <defs>
        <radialGradient id={`mini-${colorId}`} cx="42%" cy="32%" r="78%">
          <stop offset="0%" stopColor={c.top} /><stop offset="100%" stopColor={c.bot} />
        </radialGradient>
      </defs>
      <path d={BODY_PATH} fill={`url(#mini-${colorId})`} stroke="#0e1320" strokeWidth="5" />
      <ellipse cx="78" cy="78" rx="22" ry="14" fill="#fff" opacity="0.3" />
    </svg>
  )
}

function MiniByte({ config, extra }: { config: MascotConfig; extra?: React.ReactNode }) {
  const c = bodyColor(config.bodyColor)
  return (
    <svg viewBox="0 0 200 200" className="w-full h-full">
      <defs>
        <radialGradient id={`mb-${config.bodyColor}`} cx="42%" cy="32%" r="78%">
          <stop offset="0%" stopColor={c.top} /><stop offset="100%" stopColor={c.bot} />
        </radialGradient>
      </defs>
      <path d={BODY_PATH} fill={`url(#mb-${config.bodyColor})`} stroke="#0e1320" strokeWidth="5" />
      <ellipse cx="78" cy="78" rx="22" ry="14" fill="#fff" opacity="0.3" />
      {/* simple resting face */}
      <ellipse cx="70" cy="122" rx="9" ry="5.5" fill="#ff8fab" opacity="0.32" />
      <ellipse cx="130" cy="122" rx="9" ry="5.5" fill="#ff8fab" opacity="0.32" />
      <MiniEyes style={config.eyeStyle} />
      <path d="M92 131 q8 9 16 0" fill="none" stroke="#0e1320" strokeWidth="3.5" strokeLinecap="round" />
      {extra}
    </svg>
  )
}

function MiniEyes({ style }: { style: string }) {
  const ink = '#0e1320'
  const eyes = (cx: number) => {
    if (style === 'dot') return <circle cx={cx} cy={108} r={4.5} fill={ink} />
    if (style === 'star') return <g fill="#ffd14d" stroke={ink} strokeWidth="1.5"><MiniStar cx={cx} cy={108} r={8} /></g>
    if (style === 'cat') return <ellipse cx={cx} cy={108} rx={4} ry={8} fill={ink} />
    if (style === 'sleepy') return <path d={`M${cx - 8} 108 q8 5 16 0`} fill="none" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
    const r = style === 'wide' ? 9.5 : 7.5
    return (
      <g>
        <circle cx={cx} cy={108} r={r} fill={ink} />
        <circle cx={cx - r * 0.4} cy={108 - r * 0.45} r={r * 0.42} fill="#fff" />
      </g>
    )
  }
  return <>{eyes(84)}{eyes(116)}</>
}

function MiniStar({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const ang = (Math.PI / 5) * i - Math.PI / 2
    const rad = i % 2 === 0 ? r : r * 0.45
    pts.push(`${cx + rad * Math.cos(ang)},${cy + rad * Math.sin(ang)}`)
  }
  return <polygon points={pts.join(' ')} />
}

const BODY_PATH = 'M100 40 C140 40 168 74 168 112 C168 150 140 170 100 170 C60 170 32 150 32 112 C32 74 60 40 100 40 Z'
