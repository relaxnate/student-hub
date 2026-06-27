// Byte — the AI Helper mascot. A soft, round, *cute* blue gel blob (per the
// reference art) whose expression reflects AI usage (fresh → depleted) and reacts
// to chat events. Small close-set sparkly eyes + blush + blinking + gentle
// breathing keep it friendly, not wide-eyed/uncanny.
//
// WHY SVG, NOT RIVE (see vault Rive Research): no .riv art asset yet + the
// renderer CSP blocks Rive's wasm CDN fetch. So Byte is an offline SVG/Framer-
// Motion mascot implementing the same behavioural contract; a real .riv is a
// localized drop-in upgrade later.

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  bodyColor, HATS, GLASSES, OUTFITS, reactionStyle, Star,
  DEFAULT_MASCOT_CONFIG, type MascotConfig,
} from './mascotCatalog'

export interface CompanionRef {
  triggerError: () => void
  triggerResponseReady: () => void
  triggerUserMessage: () => void
}

interface CompanionProps {
  usageFraction: number    // 0..1 — drives mood
  isThinking: boolean      // waiting for AI response
  isListening: boolean     // user is typing
  onFileDropped?: (file: File) => void
  size?: number            // px (square); default 200
  skin?: string            // reserved for future .riv skins
  config?: MascotConfig    // wardrobe: body colour, hat, glasses, outfit, eyes, reaction
}

function findAccessory(list: { id: string; render: () => React.ReactNode }[], id: string) {
  return list.find(a => a.id === id)?.render() ?? null
}

type Mood = 'fresh' | 'working' | 'tired' | 'depleted'
type Reaction = 'none' | 'wave' | 'eat' | 'error' | 'happy' | 'nod'

function moodFor(f: number): Mood {
  if (f >= 0.95) return 'depleted'
  if (f >= 0.7) return 'tired'
  if (f >= 0.4) return 'working'
  return 'fresh'
}

export const Companion = forwardRef<CompanionRef, CompanionProps>(function Companion(
  { usageFraction, isThinking, isListening, onFileDropped, size = 200, config }, ref,
) {
  const cfg = config ?? DEFAULT_MASCOT_CONFIG
  const [reaction, setReaction] = useState<Reaction>('none')
  const [blink, setBlink] = useState(false)
  const reactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fire = (r: Reaction, ms = 1500) => {
    if (reactionTimer.current) clearTimeout(reactionTimer.current)
    setReaction(r)
    reactionTimer.current = setTimeout(() => setReaction('none'), ms)
  }

  useImperativeHandle(ref, () => ({
    triggerError: () => fire('error', 2000),
    triggerResponseReady: () => fire('happy', 1700),
    triggerUserMessage: () => fire('nod', 650),
  }))

  // Wave once on mount.
  useEffect(() => { fire('wave', 1700); return () => { if (reactionTimer.current) clearTimeout(reactionTimer.current) } }, [])

  // Occasional cute blink (not while sleeping).
  const mood = moodFor(usageFraction)
  const sleeping = mood === 'depleted' && reaction === 'none'
  useEffect(() => {
    if (sleeping) return
    let t: ReturnType<typeof setTimeout>
    const loop = () => {
      t = setTimeout(() => {
        setBlink(true)
        setTimeout(() => setBlink(false), 130)
        loop()
      }, 2400 + Math.random() * 2600)
    }
    loop()
    return () => clearTimeout(t)
  }, [sleeping])

  // Body colour comes from the wardrobe palette; mood only desaturates it once
  // Byte is fully depleted (so custom colours still read at every other energy).
  const palette = bodyColor(cfg.bodyColor)
  const top = mood === 'depleted' ? mix(palette.top, '#8793ab', 0.55) : palette.top
  const bot = mood === 'depleted' ? mix(palette.bot, '#6b7790', 0.55) : palette.bot
  const rs = reactionStyle(cfg.reactionStyle)
  const bob = (sleeping ? 1.5 : isListening ? 3 : 2.5) * rs.bob
  const bobDur = (isThinking ? 0.7 : isListening ? 1.3 : 2.4) / rs.speed
  const gid = 'byte-body-grad'

  return (
    <div
      className="select-none"
      style={{ width: size, height: size }}
      onDragOver={e => { e.preventDefault() }}
      onDrop={e => {
        e.preventDefault()
        const file = e.dataTransfer.files?.[0]
        if (file) { fire('eat', 1500); onFileDropped?.(file) }
      }}
      aria-label="Byte, your AI study companion"
    >
      <motion.div
        animate={{
          y: [0, -bob, 0],
          rotate: reaction === 'nod' ? [0, 7, 0] : reaction === 'wave' ? [0, -5, 5, 0] : 0,
        }}
        transition={{ y: { duration: bobDur, repeat: Infinity, ease: 'easeInOut' }, rotate: { duration: 0.6 } }}
        style={{ width: '100%', height: '100%' }}
      >
        <svg viewBox="0 0 200 200" width="100%" height="100%">
          <defs>
            <radialGradient id={gid} cx="42%" cy="32%" r="78%">
              <stop offset="0%" stopColor={top} />
              <stop offset="100%" stopColor={bot} />
            </radialGradient>
          </defs>

          {/* soft shadow */}
          <ellipse cx="100" cy="176" rx="52" ry="9" fill="#000" opacity="0.12" />

          {/* Body: a plump, friendly droplet — squashes gently while breathing/reacting */}
          <motion.g
            animate={{
              scaleX: reaction === 'eat' ? [1, 1.08, 1] : reaction === 'nod' ? [1, 1.05, 1] : [1, 1.02, 1],
              scaleY: reaction === 'eat' ? [1, 0.93, 1] : reaction === 'nod' ? [1, 0.95, 1] : [1, 0.98, 1],
            }}
            transition={{ duration: reaction === 'none' ? 2.6 : 0.45, repeat: reaction === 'none' ? Infinity : 0, ease: 'easeInOut' }}
            style={{ transformOrigin: '100px 150px' }}
          >
            <path
              d="M100 40 C140 40 168 74 168 112 C168 150 140 170 100 170 C60 170 32 150 32 112 C32 74 60 40 100 40 Z"
              fill={`url(#${gid})`} stroke="#0e1320" strokeWidth="5"
            />
            {/* glossy highlight */}
            <ellipse cx="78" cy="78" rx="22" ry="14" fill="#ffffff" opacity="0.30" />
            <circle cx="118" cy="70" r="5" fill="#ffffff" opacity="0.35" />

            {/* Outfit (neck/body) sits under the face accessories */}
            {findAccessory(OUTFITS, cfg.outfit)}

            <Face mood={mood} reaction={reaction} isThinking={isThinking} isListening={isListening} blink={blink} eyeStyle={cfg.eyeStyle} />

            {/* Eyewear over the eyes, headwear on top of everything */}
            {findAccessory(GLASSES, cfg.glasses)}
            {findAccessory(HATS, cfg.hat)}
          </motion.g>

          {/* Sleeping zzz */}
          {sleeping && (
            <motion.text x="150" y="70" fontSize="20" fontWeight="700" fill="#0e1320" opacity="0.6"
              animate={{ y: [70, 56], opacity: [0, 0.7, 0] }} transition={{ duration: 2.6, repeat: Infinity }}>z</motion.text>
          )}
        </svg>
      </motion.div>
    </div>
  )
})

function Face({ mood, reaction, isThinking, isListening, blink, eyeStyle }: {
  mood: Mood; reaction: Reaction; isThinking: boolean; isListening: boolean; blink: boolean; eyeStyle: string
}) {
  const ink = '#0e1320'
  const sleeping = mood === 'depleted' && reaction === 'none'
  const happy = reaction === 'happy' || reaction === 'wave'
  // Eyes are small + close-set + low for a cute look.
  const lx = 84, rx = 116, ey = 108

  // 'cat' eyes look happiest as upward arcs; 'sleepy' always reads half-closed.
  const closedEyes = blink || sleeping || happy
  const worried = reaction === 'error'

  return (
    <g>
      {/* Blush — soft and always present (stronger when happy) */}
      <ellipse cx={70} cy={122} rx={9} ry={5.5} fill="#ff8fab" opacity={happy ? 0.55 : 0.32} />
      <ellipse cx={130} cy={122} rx={9} ry={5.5} fill="#ff8fab" opacity={happy ? 0.55 : 0.32} />

      {/* Eyes */}
      {closedEyes ? (
        // happy/blink/sleep → gentle upward arcs (^ ^) or sleepy
        <>
          <path d={`M${lx - 8} ${ey} q8 ${happy ? -9 : -7} 16 0`} fill="none" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
          <path d={`M${rx - 8} ${ey} q8 ${happy ? -9 : -7} 16 0`} fill="none" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
        </>
      ) : (
        <>
          <CuteEye cx={lx} cy={ey} mood={mood} worried={worried} look={isThinking ? 'up' : 'mid'} style={eyeStyle} />
          <CuteEye cx={rx} cy={ey} mood={mood} worried={worried} look={isThinking ? 'up' : 'mid'} style={eyeStyle} />
        </>
      )}

      {/* Soft brows only when thinking/worried (kept gentle) */}
      {worried && (
        <>
          <path d={`M${lx - 9} ${ey - 13} q9 -3 17 1`} fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round" />
          <path d={`M${rx - 8} ${ey - 12} q9 -4 17 -1`} fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round" />
        </>
      )}

      {/* Mouth */}
      <Mouth mood={mood} reaction={reaction} isListening={isListening} isThinking={isThinking} />

      {/* tiny error sweat */}
      {worried && (
        <motion.path d="M150 96 q5 8 0 13 q-5 -5 0 -13 Z" fill="#7cc4ff" stroke={ink} strokeWidth="1.5"
          animate={{ y: [0, 5] }} transition={{ duration: 1, repeat: Infinity }} />
      )}
    </g>
  )
}

function CuteEye({ cx, cy, mood, worried, look, style }: {
  cx: number; cy: number; mood: Mood; worried: boolean; look: 'up' | 'mid'; style: string
}) {
  const ink = '#0e1320'
  const py = look === 'up' ? -2 : 0
  const ey = cy + py

  if (style === 'star') {
    return <g fill="#ffd14d" stroke={ink} strokeWidth="1.5"><Star cx={cx} cy={ey} r={8} /></g>
  }
  if (style === 'dot') {
    return <circle cx={cx} cy={ey} r={mood === 'tired' ? 3.5 : 4.5} fill={ink} />
  }
  if (style === 'cat') {
    // vertical slit pupil
    return (
      <g>
        <ellipse cx={cx} cy={ey} rx={4} ry={8} fill={ink} />
        <circle cx={cx - 1.4} cy={ey - 3} r={1.6} fill="#fff" />
      </g>
    )
  }
  if (style === 'sleepy') {
    return (
      <g>
        <path d={`M${cx - 8} ${ey} q8 5 16 0`} fill="none" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
        <path d={`M${cx - 7} ${ey - 4} q7 -3 14 0`} fill="none" stroke={ink} strokeWidth="2.5" strokeLinecap="round" />
      </g>
    )
  }

  // 'sparkle' (default) and 'wide' share the round sparkly look; 'wide' is bigger.
  const base = style === 'wide' ? 9.5 : 7.5
  const r = mood === 'tired' ? base - 1 : worried ? base - 1.5 : base
  const half = mood === 'tired'
  return (
    <g>
      <circle cx={cx} cy={ey} r={r} fill={ink} />
      <circle cx={cx - r * 0.4} cy={ey - r * 0.45} r={r * 0.42} fill="#fff" />
      <circle cx={cx + r * 0.4} cy={ey + r * 0.3} r={r * 0.2} fill="#fff" opacity="0.85" />
      {half && <path d={`M${cx - r - 2} ${cy - 1} q${r + 2} -6 ${(r + 2) * 2} 0`} fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round" />}
    </g>
  )
}

// Blend two hex colours (#rrggbb) by t∈[0,1] toward `b`.
function mix(a: string, b: string, t: number): string {
  const pa = hex(a), pb = hex(b)
  const c = (i: number) => Math.round(pa[i] + (pb[i] - pa[i]) * t)
  return `#${[c(0), c(1), c(2)].map(v => v.toString(16).padStart(2, '0')).join('')}`
}
function hex(s: string): [number, number, number] {
  const m = s.replace('#', '')
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)]
}

function Mouth({ mood, reaction, isListening, isThinking }: {
  mood: Mood; reaction: Reaction; isListening: boolean; isThinking: boolean
}) {
  const ink = '#0e1320'
  const y = 132
  if (reaction === 'eat') return <ellipse cx="100" cy={y + 2} rx="11" ry="10" fill="#7a3a46" stroke={ink} strokeWidth="3.5" />
  if (reaction === 'happy' || reaction === 'wave')
    return <path d={`M90 ${y} q10 12 20 0`} fill="#7a3a46" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
  if (reaction === 'error')
    return <path d={`M91 ${y + 3} q9 -6 18 0`} fill="none" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
  if (isThinking) return <circle cx="100" cy={y + 1} r="3" fill="none" stroke={ink} strokeWidth="3" />
  if (isListening) return <path d={`M94 ${y} q6 7 12 0`} fill="none" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
  // idle cute smiles by mood
  if (mood === 'fresh')   return <path d={`M92 ${y - 1} q8 9 16 0`} fill="none" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
  if (mood === 'working') return <path d={`M93 ${y} q7 6 14 0`} fill="none" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
  if (mood === 'tired')   return <path d={`M94 ${y + 1} q6 3 12 0`} fill="none" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
  return <path d={`M95 ${y + 1} q5 5 10 0`} fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round" />  // depleted: tiny soft u
}
