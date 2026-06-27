// Shared "connect a platform" UI, used by both the Welcome (first-run) screen
// and Settings → Integrations. Token-based platforms (Canvas, Moodle) connect
// with the dead-simple "paste a token + site URL" flow — no app registration,
// no cost. OAuth platforms (Google Classroom, Microsoft Teams) appear as
// "Coming soon" unless a client ID is configured in this build (auth:oauth-status).

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertCircle, Eye, EyeOff, ArrowRight, Key, Clock, CalendarDays, Link2 } from 'lucide-react'
import { api } from '../../lib/ipc'
import { cn } from '../../lib/utils'
import { Button } from '../ui/Button'
import type { Integration, IntegrationProvider } from '@shared/types/entities'

interface TokenProviderConfig {
  provider: IntegrationProvider
  name: string
  color: string
  urlLabel: string
  urlPlaceholder: string
  urlHint: string
  tokenLabel: string
  tokenPlaceholder: string
  tokenSteps: string[]
}

const TOKEN_PROVIDERS: TokenProviderConfig[] = [
  {
    provider: 'canvas',
    name: 'Canvas',
    color: '#E66000',
    urlLabel: "Your school's Canvas URL",
    urlPlaceholder: 'https://university.instructure.com',
    urlHint: 'The URL you see when you log into Canvas — usually your school name + .instructure.com',
    tokenLabel: 'Personal Access Token',
    tokenPlaceholder: '1234~AbCdEfGhIjKlMnOpQrStUv...',
    tokenSteps: [
      'Log into Canvas and click your name/avatar',
      'Go to Settings (your account settings, not a course)',
      'Scroll to "Approved Integrations"',
      'Click "+ New Access Token"',
      'Name it "Student Hub", leave expiry blank, click Generate Token',
      'Copy the full token — it looks like 1234~AbCd…',
    ],
  },
  {
    provider: 'moodle',
    name: 'Moodle',
    color: '#F98012',
    urlLabel: 'Your Moodle site URL',
    urlPlaceholder: 'https://moodle.yourschool.edu',
    urlHint: "The address of your school's Moodle site, where you normally log in.",
    tokenLabel: 'Web Services token',
    tokenPlaceholder: 'a1b2c3d4e5f6…',
    tokenSteps: [
      'Log into your Moodle site',
      'Open your user menu → Preferences → "Security keys"',
      'Copy the token for the "Moodle mobile web service"',
      'No token there? Your site admin needs to enable Web Services / the mobile app',
      'Paste it here along with your Moodle site URL above',
    ],
  },
]

const OAUTH_PROVIDERS: { provider: IntegrationProvider; name: string; color: string; letter: string; beta?: boolean; note?: string }[] = [
  { provider: 'google-classroom', name: 'Google Classroom',    color: '#4285F4', letter: 'G', beta: true,
    note: 'Brings in your real courses, coursework & grades. Limited beta — you may see a Google "unverified app" notice while it\'s in early access.' },
  { provider: 'microsoft-teams',  name: 'Microsoft Teams EDU', color: '#6264A7', letter: 'T', beta: true,
    note: 'Works only if your school has enabled education apps (your IT admin must allow it).' },
]

type FlowState = 'idle' | 'connecting' | 'success' | 'error'

export function AddPlatform({ onConnected, connectedProviders = [] }: {
  onConnected: (i: Integration) => void
  connectedProviders?: IntegrationProvider[]
}) {
  const [selected, setSelected] = useState<IntegrationProvider>('canvas')
  const [url,       setUrl]      = useState('')
  const [token,     setToken]    = useState('')
  const [showToken, setShowToken] = useState(false)
  const [showSteps, setShowSteps] = useState(false)
  const [flow,      setFlow]      = useState<FlowState>('idle')
  const [error,     setError]     = useState('')

  const [oauthStatus, setOauthStatus] = useState<Record<string, boolean>>({})
  const [oauthFlow,   setOauthFlow]   = useState<{ provider: IntegrationProvider; state: FlowState; error: string } | null>(null)

  useEffect(() => {
    api.auth.getOAuthStatus().then((r: { ok: boolean; data?: Record<string, boolean> }) => {
      if (r.ok && r.data) setOauthStatus(r.data)
    })
  }, [])

  const cfg = TOKEN_PROVIDERS.find(p => p.provider === selected)!

  const reset = () => { setFlow('idle'); setError('') }

  const handleTokenConnect = async () => {
    if (!url.trim() || !token.trim()) return
    setFlow('connecting'); setError('')
    let baseUrl = url.trim().replace(/\/+$/, '')
    if (!baseUrl.startsWith('http')) baseUrl = `https://${baseUrl}`

    const res = await api.auth.connectWithToken({ provider: selected, baseUrl, token: token.trim() })
    if (res.ok) {
      setFlow('success')
      onConnected(res.data)
      api.sync.startAll().catch(() => { /* surfaced via sync events */ })
      setUrl(''); setToken('')
    } else {
      setFlow('error')
      setError(res.error ?? 'Connection failed.')
    }
  }

  const handleOAuthConnect = async (provider: IntegrationProvider) => {
    setOauthFlow({ provider, state: 'connecting', error: '' })
    const res = await api.auth.startOAuth({ provider })
    if (res.ok) {
      setOauthFlow({ provider, state: 'success', error: '' })
      onConnected(res.data)
      api.sync.startAll().catch(() => {})
    } else {
      setOauthFlow({ provider, state: 'error', error: res.error ?? 'Connection failed.' })
    }
  }

  return (
    <div className="space-y-5">
      {/* Token-based platform picker */}
      <div className="flex gap-2">
        {TOKEN_PROVIDERS.map(p => {
          const isConnected = connectedProviders.includes(p.provider)
          return (
            <button key={p.provider}
              onClick={() => { setSelected(p.provider); reset() }}
              className={cn('flex-1 flex items-center gap-2.5 p-3 rounded-xl border text-left transition-colors',
                selected === p.provider
                  ? 'border-accent-500/60 bg-accent-500/10'
                  : 'border-white/8 bg-surface-800 hover:border-white/15')}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ background: p.color }}>{p.name[0]}</div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-200">{p.name}</p>
                <p className="text-2xs text-zinc-500">{isConnected ? 'Connected · add another account' : 'Token connect'}</p>
              </div>
            </button>
          )
        })}
      </div>

      {/* URL */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">{cfg.urlLabel}</label>
        <input type="url" value={url} placeholder={cfg.urlPlaceholder}
          onChange={e => { setUrl(e.target.value); reset() }}
          className={cn('w-full bg-surface-800 border rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none transition-colors focus:border-accent-500/50 focus:ring-1 focus:ring-accent-500/20',
            flow === 'error' ? 'border-red-700/50' : 'border-white/10')} />
        <p className="text-2xs text-zinc-600 mt-1">{cfg.urlHint}</p>
      </div>

      {/* Token */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-zinc-400">{cfg.tokenLabel}</label>
          <button onClick={() => setShowSteps(s => !s)}
            className="text-2xs text-accent-400 hover:text-accent-300 transition-colors flex items-center gap-1">
            <Key size={10} /> How to get this token
          </button>
        </div>

        <AnimatePresence>
          {showSteps && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden">
              <div className="bg-surface-800 border border-white/8 rounded-lg p-3.5 mb-3">
                <ol className="space-y-1.5">
                  {cfg.tokenSteps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="w-4 h-4 rounded-full bg-accent-500/20 text-accent-400 text-2xs font-semibold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                      <span className="text-xs text-zinc-400 leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative">
          <input type={showToken ? 'text' : 'password'} value={token} placeholder={cfg.tokenPlaceholder}
            onChange={e => { setToken(e.target.value); reset() }}
            className={cn('w-full bg-surface-800 border rounded-lg px-3 pr-10 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none transition-colors font-mono focus:border-accent-500/50 focus:ring-1 focus:ring-accent-500/20',
              flow === 'error' ? 'border-red-700/50' : 'border-white/10')} />
          <button type="button" onClick={() => setShowToken(v => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300 transition-colors"
            aria-label={showToken ? 'Hide token' : 'Show token'}>
            {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <p className="text-2xs text-zinc-600 mt-1">Stored encrypted on your device via your OS keychain. Only ever sent to your {cfg.name} site.</p>
      </div>

      <AnimatePresence>
        {flow === 'error' && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-start gap-2.5 p-3 rounded-lg bg-red-900/20 border border-red-700/30">
            <AlertCircle size={13} className="text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-300">{error}</p>
          </motion.div>
        )}
        {flow === 'success' && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2.5 p-3 rounded-lg bg-green-900/20 border border-green-700/30">
            <CheckCircle2 size={13} className="text-green-400 shrink-0" />
            <p className="text-xs text-green-300">Connected! Starting your first sync…</p>
          </motion.div>
        )}
      </AnimatePresence>

      <Button variant="primary" size="lg" className="w-full"
        loading={flow === 'connecting'}
        disabled={!url.trim() || !token.trim() || flow === 'connecting'}
        onClick={handleTokenConnect}
        iconEnd={flow !== 'connecting' ? <ArrowRight size={14} /> : undefined}>
        {flow === 'connecting' ? 'Connecting…' : `Connect ${cfg.name}`}
      </Button>

      {/* Universal calendar feed (.ics) — works for almost any LMS, no approvals */}
      <div className="pt-2">
        <p className="text-2xs font-semibold text-zinc-600 uppercase tracking-wider mb-2">Any school — calendar feed</p>
        <CalendarFeedConnect onConnected={onConnected} />
      </div>

      {/* OAuth providers — connectable only if configured, else "Coming soon" */}
      <div className="pt-2">
        <p className="text-2xs font-semibold text-zinc-600 uppercase tracking-wider mb-2">More platforms</p>
        <div className="space-y-2">
          {OAUTH_PROVIDERS.map(p => {
            const configured = oauthStatus[p.provider] === true
            const connected  = connectedProviders.includes(p.provider)
            const loading    = oauthFlow?.provider === p.provider && oauthFlow.state === 'connecting'
            return (
              <div key={p.provider}>
                <button
                  onClick={() => configured && !connected && handleOAuthConnect(p.provider)}
                  disabled={!configured || connected || loading}
                  className={cn('w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors',
                    connected ? 'border-green-700/30 bg-green-900/10 cursor-default'
                      : configured ? 'border-white/8 bg-surface-800 hover:bg-surface-700'
                      : 'border-white/5 bg-surface-800/50 cursor-default')}>
                  <div className="w-7 h-7 rounded-md flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ background: configured ? p.color : '#3f3f46' }}>{p.letter}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className={cn('text-sm font-medium', configured ? 'text-zinc-300' : 'text-zinc-500')}>{p.name}</p>
                      {p.beta && (
                        <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/25">Beta</span>
                      )}
                    </div>
                    <p className="text-2xs text-zinc-600">
                      {connected ? '✓ Connected'
                        : configured ? 'Sign in with your school account'
                        : p.beta ? 'Limited beta — not yet enabled in this build'
                        : 'Coming soon'}
                    </p>
                  </div>
                  {loading
                    ? <span className="text-xs text-zinc-500">Opening browser…</span>
                    : !configured && <Clock size={13} className="text-zinc-600 shrink-0" />}
                </button>
                {p.note && !connected && (
                  <p className="text-2xs text-zinc-600 mt-1 px-1 leading-relaxed">{p.note}</p>
                )}
                {oauthFlow?.provider === p.provider && oauthFlow.state === 'error' && (
                  <div className="flex items-start gap-2 p-2.5 mt-1.5 rounded-lg bg-red-900/20 border border-red-700/30">
                    <AlertCircle size={12} className="text-red-400 mt-0.5 shrink-0" />
                    <p className="text-2xs text-red-300">{oauthFlow.error}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Calendar feed (.ics) connect ──────────────────────────────────────────────
// The universal path: the student pastes their personal calendar-feed URL (every
// major LMS plus Google/Outlook exposes one). No app registration, no admin, no
// cost. Brings in assignment/quiz/exam due dates (titles + dates only — no grades).
const ICS_FEED_STEPS = [
  'Canvas: Calendar → "Calendar Feed" (bottom-right) → copy the link',
  'Schoology: Calendar → gear/RSS icon → copy the iCal feed URL',
  'Blackboard / Brightspace: Calendar → Subscribe / "Calendar feed" → copy URL',
  'Google Calendar: Settings → your calendar → "Secret address in iCal format"',
  'Outlook: Calendar → Share → Publish → copy the ICS link',
]

function CalendarFeedConnect({ onConnected }: { onConnected: (i: Integration) => void }) {
  const [feedUrl, setFeedUrl] = useState('')
  const [label,   setLabel]   = useState('')
  const [showSteps, setShowSteps] = useState(false)
  const [flow,    setFlow]    = useState<FlowState>('idle')
  const [error,   setError]   = useState('')

  const reset = () => { setFlow('idle'); setError('') }

  const connect = async () => {
    if (!feedUrl.trim()) return
    setFlow('connecting'); setError('')
    const res = await api.auth.connectCalendarFeed({ feedUrl: feedUrl.trim(), label: label.trim() || undefined })
    if (res.ok) {
      setFlow('success')
      onConnected(res.data)
      api.sync.startAll().catch(() => { /* surfaced via sync events */ })
      setFeedUrl(''); setLabel('')
    } else {
      setFlow('error')
      setError(res.error ?? 'Connection failed.')
    }
  }

  return (
    <div className="rounded-xl border border-white/8 bg-surface-800 p-3.5 space-y-3">
      <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-sky-600/80 text-white">
          <CalendarDays size={15} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-200">Calendar feed (any LMS)</p>
          <p className="text-2xs text-zinc-500">Paste your school calendar's feed URL to pull in due dates. Works almost everywhere — no login or admin needed.</p>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">Feed URL</label>
        <div className="relative">
          <Link2 size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input type="url" value={feedUrl} placeholder="https://…instructure.com/feeds/calendars/user_….ics"
            onChange={e => { setFeedUrl(e.target.value); reset() }}
            className={cn('w-full bg-surface-900 border rounded-lg pl-8 pr-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none transition-colors font-mono focus:border-accent-500/50 focus:ring-1 focus:ring-accent-500/20',
              flow === 'error' ? 'border-red-700/50' : 'border-white/10')} />
        </div>
        <button onClick={() => setShowSteps(s => !s)}
          className="text-2xs text-accent-400 hover:text-accent-300 transition-colors flex items-center gap-1 mt-1.5">
          <Key size={10} /> Where do I find this?
        </button>
      </div>

      <AnimatePresence>
        {showSteps && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden">
            <ul className="bg-surface-900 border border-white/8 rounded-lg p-3 space-y-1.5">
              {ICS_FEED_STEPS.map((s, i) => (
                <li key={i} className="text-2xs text-zinc-400 leading-relaxed">• {s}</li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">Name (optional)</label>
        <input type="text" value={label} placeholder="e.g. My School Calendar"
          onChange={e => { setLabel(e.target.value); reset() }}
          className="w-full bg-surface-900 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none transition-colors focus:border-accent-500/50 focus:ring-1 focus:ring-accent-500/20" />
      </div>

      <AnimatePresence>
        {flow === 'error' && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-start gap-2.5 p-3 rounded-lg bg-red-900/20 border border-red-700/30">
            <AlertCircle size={13} className="text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-300">{error}</p>
          </motion.div>
        )}
        {flow === 'success' && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2.5 p-3 rounded-lg bg-green-900/20 border border-green-700/30">
            <CheckCircle2 size={13} className="text-green-400 shrink-0" />
            <p className="text-xs text-green-300">Subscribed! Pulling in your due dates…</p>
          </motion.div>
        )}
      </AnimatePresence>

      <Button variant="secondary" size="md" className="w-full"
        loading={flow === 'connecting'}
        disabled={!feedUrl.trim() || flow === 'connecting'}
        onClick={connect}
        iconEnd={flow !== 'connecting' ? <ArrowRight size={14} /> : undefined}>
        {flow === 'connecting' ? 'Subscribing…' : 'Subscribe to feed'}
      </Button>
      <p className="text-2xs text-zinc-600">Brings in assignment & exam due dates (titles + dates). Grades aren't included in calendar feeds. Stored encrypted on your device.</p>
    </div>
  )
}
