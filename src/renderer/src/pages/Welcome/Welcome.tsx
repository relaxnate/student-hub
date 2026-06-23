import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GraduationCap, CheckCircle2, AlertCircle, Eye, EyeOff,
  ArrowRight, ExternalLink, ChevronDown, ChevronRight, Key
} from 'lucide-react'
import { useAppStore } from '../../store/app.store'
import { api } from '../../lib/ipc'
import { cn } from '../../lib/utils'
import { Button } from '../../components/ui/Button'
import type { IntegrationProvider } from '@shared/types/entities'

// ─── How to get a Canvas PAT ─────────────────────────────────────────────────
//
// 1. Log into your school's Canvas
// 2. Click your name / avatar (top-left or top-right)
// 3. Choose "Settings" or "Profile"  
// 4. Scroll down to "Approved Integrations"
// 5. Click "+ New Access Token"
// 6. Name it anything (e.g. "Student Hub")
// 7. Leave expiry blank for permanent, or pick a date
// 8. Click "Generate Token" and copy the whole string — it starts with a number~

const PAT_STEPS = [
  'Log into Canvas and click your name/avatar',
  'Go to Settings (not course settings — your account settings)',
  'Scroll down to "Approved Integrations"',
  'Click "+ New Access Token"',
  'Name it "Student Hub", leave expiry blank, click Generate Token',
  'Copy the full token — it looks like: 1234~AbCdEfGhIjKlMnOpQrStUvWxYz0123456789',
]

type FlowState = 'idle' | 'connecting' | 'success' | 'error'

export default function Welcome() {
  const navigate       = useNavigate()
  const addIntegration = useAppStore(s => s.addIntegration)
  const integrations   = useAppStore(s => s.integrations)

  // Canvas PAT fields
  const [canvasUrl,   setCanvasUrl]   = useState('')
  const [token,       setToken]       = useState('')
  const [showToken,   setShowToken]   = useState(false)
  const [flowState,   setFlowState]   = useState<FlowState>('idle')
  const [error,       setError]       = useState('')
  const [showSteps,   setShowSteps]   = useState(false)

  // Advanced: OAuth providers
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [oauthProvider, setOauthProvider] = useState<IntegrationProvider | null>(null)
  const [oauthState,  setOauthState]  = useState<FlowState>('idle')
  const [oauthError,  setOauthError]  = useState('')

  const alreadyConnected = integrations.length > 0
  const canvasConnected  = integrations.some(i => i.provider === 'canvas')

  // ── Canvas PAT connect ───────────────────────────────────────────────────

  const handleCanvasConnect = async () => {
    if (!canvasUrl.trim() || !token.trim()) return
    setFlowState('connecting')
    setError('')

    // Normalise URL — strip trailing slashes, ensure https://
    let url = canvasUrl.trim().replace(/\/+$/, '')
    if (!url.startsWith('http')) url = `https://${url}`

    const result = await api.auth.connectWithToken({
      provider: 'canvas',
      baseUrl:  url,
      token:    token.trim(),
    })

    if (result.ok) {
      addIntegration(result.data)
      // Kick off initial sync immediately so courses/modules appear without manual "Sync now"
      api.sync.startAll().catch(() => {/* handled by sync events */})
      setFlowState('success')
      setTimeout(() => navigate('/dashboard'), 1200)
    } else {
      setFlowState('error')
      setError(result.error ?? 'Connection failed.')
    }
  }

  // ── OAuth connect (Google / Teams) ────────────────────────────────────────

  const handleOAuthConnect = async (provider: IntegrationProvider) => {
    setOauthProvider(provider)
    setOauthState('connecting')
    setOauthError('')

    const result = await api.auth.startOAuth({ provider })
    if (result.ok) {
      addIntegration(result.data)
      setOauthState('success')
      setTimeout(() => navigate('/dashboard'), 1200)
    } else {
      setOauthState('error')
      setOauthError(result.error ?? 'Connection failed.')
    }
  }

  const canSubmit =
    canvasUrl.trim().length > 0 &&
    token.trim().length > 0 &&
    flowState !== 'connecting' &&
    flowState !== 'success'

  return (
    <div className="flex h-full bg-surface-950 overflow-hidden">

      {/* ── Left branding panel ─────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col justify-between w-64 shrink-0 p-9 bg-surface-900 border-r border-white/5">
        <div>
          <div className="w-11 h-11 rounded-2xl bg-accent-500 flex items-center justify-center mb-7">
            <GraduationCap size={22} className="text-white" />
          </div>
          <h1 className="text-xl font-semibold text-zinc-100 mb-2.5">Student Hub</h1>
          <p className="text-xs text-zinc-500 leading-relaxed">
            All your courses, assignments, grades, and files — synced from Canvas directly to your desktop.
          </p>
        </div>

        <div className="space-y-3">
          {[
            'No admin access needed',
            'Real data — no fakes or placeholders',
            'Modules preserved exactly as set by your instructor',
            'Full assignment instructions and rubrics',
            'Works offline after first sync',
            'Export to Obsidian vault',
          ].map(f => (
            <div key={f} className="flex items-start gap-2">
              <CheckCircle2 size={12} className="text-accent-400 mt-0.5 shrink-0" />
              <span className="text-xs text-zinc-500 leading-relaxed">{f}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right connect panel ──────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-8 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          className="w-full max-w-md"
        >
          {/* Header */}
          <div className="mb-7">
            <h2 className="text-xl font-semibold text-zinc-100 mb-1.5">Connect Canvas</h2>
            <p className="text-sm text-zinc-500">
              Use your Canvas Personal Access Token — no admin access or special permissions needed.
            </p>
          </div>

          {/* ── Canvas URL ───────────────────────────────────────────────── */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Your school's Canvas URL
              </label>
              <input
                type="url"
                placeholder="https://university.instructure.com"
                value={canvasUrl}
                onChange={e => { setCanvasUrl(e.target.value); setFlowState('idle'); setError('') }}
                className={cn(
                  'w-full bg-surface-800 border rounded-lg px-3 py-2.5 text-sm text-zinc-200',
                  'placeholder:text-zinc-600 focus:outline-none transition-colors',
                  'focus:border-accent-500/50 focus:ring-1 focus:ring-accent-500/20',
                  flowState === 'error' ? 'border-red-700/50' : 'border-white/10'
                )}
                autoFocus
              />
              <p className="text-2xs text-zinc-600 mt-1">
                This is the URL you see when you log into Canvas — usually your school name + .instructure.com
              </p>
            </div>

            {/* ── Token field ───────────────────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-zinc-400">
                  Personal Access Token
                </label>
                <button
                  onClick={() => setShowSteps(s => !s)}
                  className="text-2xs text-accent-400 hover:text-accent-300 transition-colors flex items-center gap-1"
                >
                  <Key size={10} />
                  How to get this token
                </button>
              </div>

              {/* Step-by-step instructions */}
              <AnimatePresence>
                {showSteps && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="bg-surface-800 border border-white/8 rounded-lg p-3.5 mb-3">
                      <p className="text-xs font-medium text-zinc-300 mb-2.5">
                        Steps — takes about 30 seconds:
                      </p>
                      <ol className="space-y-1.5">
                        {PAT_STEPS.map((step, i) => (
                          <li key={i} className="flex items-start gap-2.5">
                            <span className="w-4 h-4 rounded-full bg-accent-500/20 text-accent-400 text-2xs font-semibold flex items-center justify-center shrink-0 mt-0.5">
                              {i + 1}
                            </span>
                            <span className="text-xs text-zinc-400 leading-relaxed">{step}</span>
                          </li>
                        ))}
                      </ol>
                      <div className="mt-3 pt-3 border-t border-white/5">
                        <p className="text-2xs text-zinc-600">
                          The token is only shown once — paste it here right away. If you lose it, just generate a new one.
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  placeholder="1234~AbCdEfGhIjKlMnOpQrStUv..."
                  value={token}
                  onChange={e => { setToken(e.target.value); setFlowState('idle'); setError('') }}
                  className={cn(
                    'w-full bg-surface-800 border rounded-lg px-3 pr-10 py-2.5 text-sm text-zinc-200',
                    'placeholder:text-zinc-600 focus:outline-none transition-colors font-mono',
                    'focus:border-accent-500/50 focus:ring-1 focus:ring-accent-500/20',
                    flowState === 'error' ? 'border-red-700/50' : 'border-white/10'
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowToken(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300 transition-colors"
                  aria-label={showToken ? 'Hide token' : 'Show token'}
                >
                  {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <p className="text-2xs text-zinc-600 mt-1">
                Stored encrypted on your device using your OS keychain. Never sent anywhere except Canvas.
              </p>
            </div>
          </div>

          {/* Error */}
          <AnimatePresence>
            {flowState === 'error' && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-start gap-2.5 p-3 rounded-lg bg-red-900/20 border border-red-700/30 mt-4"
              >
                <AlertCircle size={13} className="text-red-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-red-300">{error}</p>
                  {error.includes('Token rejected') && (
                    <p className="text-2xs text-red-500 mt-1">
                      Make sure you copied the entire token. It should be a long string starting with numbers.
                    </p>
                  )}
                  {error.includes('Canvas URL') && (
                    <p className="text-2xs text-red-500 mt-1">
                      Example: https://myuniversity.instructure.com
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Success */}
          <AnimatePresence>
            {flowState === 'success' && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2.5 p-3 rounded-lg bg-green-900/20 border border-green-700/30 mt-4"
              >
                <CheckCircle2 size={13} className="text-green-400 shrink-0" />
                <p className="text-xs text-green-300">Connected! Starting your first sync…</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Connect button */}
          <Button
            variant="primary"
            size="lg"
            className="w-full mt-5"
            loading={flowState === 'connecting'}
            disabled={!canSubmit}
            onClick={handleCanvasConnect}
            iconEnd={flowState !== 'connecting' ? <ArrowRight size={14} /> : undefined}
          >
            {flowState === 'connecting' ? 'Connecting…' : 'Connect Canvas'}
          </Button>

          {/* Already connected — go to dashboard */}
          {alreadyConnected && (
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full mt-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Already connected — go to dashboard →
            </button>
          )}

          {/* ── Advanced: OAuth providers ─────────────────────────────────── */}
          <div className="mt-8 pt-6 border-t border-white/5">
            <button
              onClick={() => setShowAdvanced(v => !v)}
              className="flex items-center gap-2 text-xs text-zinc-600 hover:text-zinc-400 transition-colors w-full"
            >
              {showAdvanced ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Connect Google Classroom or Microsoft Teams
              <span className="ml-auto text-2xs text-zinc-700">requires additional setup</span>
            </button>

            <AnimatePresence>
              {showAdvanced && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="pt-4 space-y-2">
                    {/* Info banner */}
                    <div className="bg-surface-800 border border-white/8 rounded-lg p-3 mb-3">
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        Google Classroom and Teams require you to register an app in Google Cloud Console or Azure Portal first.
                        This takes about 10 minutes and is free — see <span className="text-accent-400">SETUP.md</span> inside the zip for exact steps.
                        You'll need to add credentials to your <code className="bg-surface-700 px-1 rounded text-2xs">. env</code> file.
                      </p>
                    </div>

                    {/* Google Classroom */}
                    {(() => {
                      const gcConnected = integrations.some(i => i.provider === 'google-classroom')
                      const gcLoading   = oauthProvider === 'google-classroom' && oauthState === 'connecting'
                      return (
                        <button
                          onClick={() => !gcConnected && handleOAuthConnect('google-classroom')}
                          disabled={gcConnected || gcLoading}
                          className={cn(
                            'w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors',
                            gcConnected
                              ? 'border-green-700/30 bg-green-900/10 cursor-default'
                              : 'border-white/8 bg-surface-800 hover:bg-surface-700'
                          )}
                        >
                          <div className="w-7 h-7 rounded-md bg-[#4285F4] flex items-center justify-center text-white text-xs font-bold shrink-0">G</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-zinc-300">Google Classroom</p>
                            {gcConnected
                              ? <p className="text-2xs text-green-400">✓ Connected</p>
                              : <p className="text-2xs text-zinc-600">Requires GOOGLE_CLIENT_ID in .env</p>}
                          </div>
                          {gcLoading && <span className="text-xs text-zinc-500">Opening browser…</span>}
                        </button>
                      )
                    })()}

                    {/* Teams */}
                    {(() => {
                      const msConnected = integrations.some(i => i.provider === 'microsoft-teams')
                      const msLoading   = oauthProvider === 'microsoft-teams' && oauthState === 'connecting'
                      return (
                        <button
                          onClick={() => !msConnected && handleOAuthConnect('microsoft-teams')}
                          disabled={msConnected || msLoading}
                          className={cn(
                            'w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors',
                            msConnected
                              ? 'border-green-700/30 bg-green-900/10 cursor-default'
                              : 'border-white/8 bg-surface-800 hover:bg-surface-700'
                          )}
                        >
                          <div className="w-7 h-7 rounded-md bg-[#6264A7] flex items-center justify-center text-white text-xs font-bold shrink-0">T</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-zinc-300">Microsoft Teams EDU</p>
                            {msConnected
                              ? <p className="text-2xs text-green-400">✓ Connected</p>
                              : <p className="text-2xs text-zinc-600">Requires MICROSOFT_CLIENT_ID in .env</p>}
                          </div>
                          {msLoading && <span className="text-xs text-zinc-500">Opening browser…</span>}
                        </button>
                      )
                    })()}

                    {oauthState === 'error' && oauthError && (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-red-900/20 border border-red-700/30">
                        <AlertCircle size={12} className="text-red-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-red-300">{oauthError}</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </motion.div>
      </div>
    </div>
  )
}
