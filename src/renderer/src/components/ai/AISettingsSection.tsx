// Settings → AI Helper. Provider/key management (one card per provider), default
// model, mascot options, and usage. Self-contained over api.ai.*.
import { useEffect, useState } from 'react'
import { Shirt } from 'lucide-react'
import { api } from '../../lib/ipc'
import { Switch } from '../ui/Controls'
import { CustomSelect } from '../ui/CustomSelect'
import { SearchableCombobox } from '../ui/SearchableCombobox'
import { SkinSelector } from './SkinSelector'
import { MascotWardrobe } from './MascotWardrobe'
import { Companion } from './Companion'
import { parseMascotConfig, DEFAULT_MASCOT_CONFIG, type MascotConfig } from './mascotCatalog'
import type { AIProvider, ModelInfo, UsageFraction, AIUsage } from '@shared/types/ipc'

const BYOK_PROVIDERS: { id: string; label: string; hint: string }[] = [
  { id: 'openrouter', label: 'OpenRouter', hint: 'openrouter.ai/keys — one key, hundreds of models' },
  { id: 'anthropic',  label: 'Anthropic (Claude)', hint: 'console.anthropic.com' },
  { id: 'openai',     label: 'OpenAI', hint: 'platform.openai.com/api-keys' },
  { id: 'google',     label: 'Google (Gemini)', hint: 'aistudio.google.com/apikey — Flash has a free tier' },
  { id: 'groq',       label: 'Groq', hint: 'console.groq.com/keys — very fast, free tier' },
]

export function AISettingsSection() {
  const [providers, setProviders] = useState<AIProvider[]>([])
  const [usage, setUsage] = useState<UsageFraction | null>(null)
  const [history, setHistory] = useState<AIUsage[]>([])
  const [prefs, setPrefs] = useState<Record<string, string>>({})
  const [wardrobeOpen, setWardrobeOpen] = useState(false)
  const [mascotConfig, setMascotConfig] = useState<MascotConfig>(DEFAULT_MASCOT_CONFIG)

  const refresh = async () => {
    const p = await api.ai.getProviders(); if (p.ok) setProviders(p.data)
    const u = await api.ai.getUsageFraction(); if (u.ok) setUsage(u.data)
    const pr = await api.ai.getPreferences(); if (pr.ok) { setPrefs(pr.data); setMascotConfig(parseMascotConfig(pr.data.mascot_config)) }
    const h = await api.ai.getUsageHistory(); if (h.ok) setHistory(h.data)
  }
  useEffect(() => { void refresh() }, [])

  const setPref = async (k: string, v: string) => { await api.ai.setPreference(k, v); setPrefs(p => ({ ...p, [k]: v })) }

  // Persist + live-apply wardrobe changes (same pref the AI Helper pane reads).
  const changeMascotConfig = (cfg: MascotConfig) => {
    setMascotConfig(cfg)
    void setPref('mascot_config', JSON.stringify(cfg))
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold mb-1">AI Helper</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Chat with <b>Byte</b> about your real Canvas data. The built-in <b>Free</b> tier needs no setup;
          connect your own key for more powerful models or higher limits. Keys are encrypted on this device and never leave it.
        </p>
      </div>

      {/* Usage */}
      {usage && (
        <div className="rounded-lg border border-white/[0.08] p-4 space-y-1">
          <div className="text-sm font-medium">Usage</div>
          <div className="text-xs text-[var(--text-secondary)]">{usage.label} ({Math.round(usage.fraction * 100)}%)</div>
          {history.length > 0 && (
            <div className="text-xs text-[var(--text-secondary)] mt-1">
              This month: {history.reduce((s, h) => s + h.requestCount, 0)} requests, {' '}
              {(history.reduce((s, h) => s + h.tokensIn + h.tokensOut, 0) / 1000).toFixed(1)}K tokens.
            </div>
          )}
          <label className="block text-xs mt-3">
            BYOK monthly token budget (soft warning; 0 = none)
            <input type="number" min={0} defaultValue={prefs.byok_monthly_token_budget ?? ''}
              onBlur={e => void setPref('byok_monthly_token_budget', e.target.value || '0')}
              className="ml-2 w-32 bg-surface-700 border border-white/[0.08] rounded px-2 py-1" />
          </label>
        </div>
      )}

      {/* Providers / keys */}
      <div className="space-y-3">
        <div className="text-sm font-medium">Providers &amp; API keys</div>
        <div className="rounded-lg border border-[var(--accent,#6366f1)] p-3 space-y-2">
          <div className="text-sm font-medium">Free tier (Student Hub) {providers.find(x => x.id === 'free')?.isConnected
            ? <span className="text-[var(--status-success,#22c55e)]">✓ ready</span>
            : <span className="text-[var(--status-warning,#f59e0b)]">needs a key</span>}</div>
          <div className="text-[11px] text-[var(--text-secondary)]">
            The no-setup tier. Paste an <b>OpenRouter</b> key here once — it powers the Free option for everyone using this app,
            routes only to <code>:free</code> models (no per-message cost), and is capped at {/* limit */}1000 requests/day. Get a free key at openrouter.ai/keys.
          </div>
          <ProviderCard id="free" label="" hint="" hideLabel connected={!!providers.find(x => x.id === 'free')?.isConnected} onChange={refresh} />
        </div>
        {BYOK_PROVIDERS.map(p => {
          const connected = providers.find(x => x.id === p.id)?.isConnected
          return <ProviderCard key={p.id} id={p.id} label={p.label} hint={p.hint} connected={!!connected} onChange={refresh} />
        })}
      </div>

      {/* Default model */}
      <DefaultModel prefs={prefs} onSet={setPref} providers={providers} />

      {/* Mascot */}
      <div className="space-y-3">
        <div className="text-sm font-medium">Mascot</div>
        <label className="flex items-center justify-between text-sm">
          <span>Show the Byte mascot (off = chat only)</span>
          <Switch checked={prefs.mascot_enabled !== 'false'} onChange={v => void setPref('mascot_enabled', v ? 'true' : 'false')} />
        </label>

        {/* Customize (dresser) — live preview + button that opens Byte's wardrobe. */}
        <div className="flex items-center gap-3 rounded-lg border border-white/[0.08] p-3">
          <div className="w-12 h-12 shrink-0 rounded-md bg-[var(--surface-2,rgba(255,255,255,0.03))] overflow-hidden grid place-items-center">
            <Companion usageFraction={0} isThinking={false} isListening={false} size={48} config={mascotConfig} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm">Appearance</div>
            <div className="text-xs text-[var(--text-secondary)]">Colour, eyes, hat, glasses, outfit &amp; vibe.</div>
          </div>
          <button onClick={() => setWardrobeOpen(true)}
            className="shrink-0 flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-white/[0.08] hover:bg-surface-700 hover:border-[var(--accent,#6366f1)] transition">
            <Shirt size={14} /> Customize Byte
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm">Skin</span>
          <SkinSelector value={prefs.mascot_skin ?? 'default'} onChange={v => void setPref('mascot_skin', v)} />
          <span className="text-xs text-[var(--text-secondary)]">More skins appear here when added.</span>
        </div>
      </div>

      <MascotWardrobe open={wardrobeOpen} onOpenChange={setWardrobeOpen} config={mascotConfig} onChange={changeMascotConfig} />
    </div>
  )
}

function ProviderCard({ id, label, hint, connected, onChange, hideLabel }: {
  id: string; label: string; hint: string; connected: boolean; onChange: () => void; hideLabel?: boolean
}) {
  const [key, setKey] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function connect() {
    if (!key.trim()) return
    setBusy(true); setStatus('Validating…')
    const r = await api.ai.validateKey(id, key.trim())
    setBusy(false)
    if (!r.ok) { setStatus(`Error: ${r.error}`); return }
    setStatus(r.data.ok ? '✓ Connected' : `✗ ${r.data.error ?? 'Invalid key'}`)
    if (r.data.ok) setKey('')
    onChange()
  }
  async function disconnect() { await api.ai.deleteKey(id); setStatus('Disconnected'); onChange() }

  const outer = hideLabel ? '' : 'rounded-lg border border-white/[0.08] p-3 '
  return (
    <div className={outer + 'space-y-2'}>
      {!hideLabel && (
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">{label} {connected && <span className="text-[var(--status-success,#22c55e)]">✓ connected</span>}</div>
            <div className="text-[11px] text-[var(--text-secondary)]">{hint}</div>
          </div>
          {connected && <button onClick={() => void disconnect()} className="text-xs px-2 py-1 rounded border border-white/[0.08]">Disconnect</button>}
        </div>
      )}
      {hideLabel && connected && (
        <button onClick={() => void disconnect()} className="text-xs px-2 py-1 rounded border border-white/[0.08]">Remove free-tier key</button>
      )}
      {!connected && (
        <div className="flex gap-2">
          <input type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="Paste API key"
            className="flex-1 bg-surface-700 border border-white/[0.08] rounded px-2 py-1 text-sm" />
          <button onClick={() => void connect()} disabled={busy}
            className="px-3 py-1 rounded bg-[var(--accent,#6366f1)] text-white text-sm disabled:opacity-50">Connect</button>
        </div>
      )}
      {status && <div className="text-[11px] text-[var(--text-secondary)]">{status}</div>}
    </div>
  )
}

function DefaultModel({ prefs, onSet, providers }: {
  prefs: Record<string, string>; onSet: (k: string, v: string) => Promise<void>; providers: AIProvider[]
}) {
  const [models, setModels] = useState<ModelInfo[]>([])
  const provider = prefs.active_provider ?? 'free'
  useEffect(() => { void (async () => { const r = await api.ai.getModels(provider); if (r.ok) setModels(r.data) })() }, [provider])

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">Default provider &amp; model</div>
      <div className="flex gap-2 flex-wrap">
        <CustomSelect
          value={provider}
          onChange={v => void onSet('active_provider', v)}
          options={providers.map(p => ({
            value: p.id,
            label: p.displayName + (p.isConnected ? '' : ' — no key'),
            disabled: !p.isConnected,
          }))}
          className="w-48"
        />
        <SearchableCombobox
          value={prefs.active_model ?? ''}
          onChange={v => void onSet('active_model', v)}
          options={models.map(m => ({
            value: m.id,
            label: m.displayName + (m.isFree ? ' (free)' : ''),
          }))}
          searchPlaceholder="Search models…"
          className="flex-1 min-w-[180px]"
        />
      </div>
    </div>
  )
}
