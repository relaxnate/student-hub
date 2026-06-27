import { useEffect, useState, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Layers, ChevronDown, ChevronRight, FileText, ClipboardList,
  HelpCircle, BookOpen, Link as LinkIcon, Lock, RefreshCw,
  ExternalLink, List, AlignLeft, Tag, Search,
} from 'lucide-react'
import { api } from '../../lib/ipc'
import { cn } from '../../lib/utils'
import { Skeleton, EmptyState, SectionHeader, Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { LinkOpener, useLinkOpener } from '../../components/ui/LinkOpener'
import { useWorkspaceStore } from '../../store/workspace.store'
import { useAppStore } from '../../store/app.store'
import type { Module, ModuleItem, Course } from '@shared/types/entities'
import type { ModulesLayout } from '@shared/types/ipc'

// ─── Item icon ─────────────────────────────────────────────────────────────────

function ItemIcon({ type }: { type: ModuleItem['type'] }) {
  const cls = 'shrink-0 text-zinc-500'
  switch (type) {
    case 'Assignment':   return <ClipboardList size={13} className={cls} />
    case 'Quiz':         return <HelpCircle size={13} className={cls} />
    case 'File':         return <FileText size={13} className={cls} />
    case 'Page':         return <BookOpen size={13} className={cls} />
    case 'ExternalUrl':
    case 'ExternalTool': return <LinkIcon size={13} className={cls} />
    default:             return <FileText size={13} className={cls} />
  }
}

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ModuleWithItems extends Module { items: ModuleItem[]; expanded: boolean }

interface FlatItem extends ModuleItem {
  moduleName: string
}

// ─── Layout toggle ─────────────────────────────────────────────────────────────

const LAYOUT_OPTIONS: { value: ModulesLayout; icon: React.ReactNode; label: string }[] = [
  { value: 'lms',  icon: <List size={14} />,     label: 'Modules' },
  { value: 'flat', icon: <AlignLeft size={14} />, label: 'Flat'    },
  { value: 'type', icon: <Tag size={14} />,       label: 'By Type' },
]

const TYPE_COLORS: Record<string, string> = {
  Assignment:   'text-accent-400',
  Quiz:         'text-amber-400',
  File:         'text-blue-400',
  Page:         'text-green-400',
  ExternalUrl:  'text-violet-400',
  ExternalTool: 'text-violet-400',
  Discussion:   'text-pink-400',
  SubHeader:    'text-zinc-600',
}

// ─── LMS accordion layout (unchanged behaviour) ────────────────────────────────

function LmsLayout({ modules, onToggle, onItemClick }: {
  modules:    ModuleWithItems[]
  onToggle:   (id: string) => void
  onItemClick:(item: ModuleItem) => void
}) {
  if (!modules.length) return null
  return (
    <div className="space-y-2">
      {modules.map((mod, i) => (
        <motion.div key={mod.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.03 }}
          className="rounded-xl bg-surface-800 border border-white/5 overflow-hidden">
          <button onClick={() => onToggle(mod.id)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/3 transition-colors">
            <span className="text-zinc-500 shrink-0">
              {mod.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
            <span className="flex-1 text-sm font-medium text-zinc-200">{mod.name}</span>
            {mod.isLocked && <Lock size={12} className="text-zinc-600 shrink-0" />}
            <span className="text-xs text-zinc-600 shrink-0">{mod.items.length} item{mod.items.length !== 1 ? 's' : ''}</span>
          </button>

          <AnimatePresence>
            {mod.expanded && mod.items.length > 0 && (
              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                className="overflow-hidden border-t border-white/5">
                {mod.items.map((item, idx) => {
                  const isClickable = ['Assignment','Quiz','Page','ExternalUrl','ExternalTool','File'].includes(item.type)
                  const Wrap = isClickable ? 'button' : 'div'
                  return (
                    <Wrap key={item.id}
                      {...(isClickable ? { onClick: () => onItemClick(item) } : {})}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left',
                        idx < mod.items.length - 1 && 'border-b border-white/3',
                        item.type === 'SubHeader' ? 'bg-surface-700/50 py-2' : '',
                        isClickable ? 'hover:bg-white/3 transition-colors cursor-pointer' : ''
                      )}>
                      {item.type === 'SubHeader' ? (
                        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider ml-6">
                          {item.title}
                        </span>
                      ) : (
                        <>
                          <span className="w-5 flex justify-center shrink-0"><ItemIcon type={item.type} /></span>
                          <span className="flex-1 text-zinc-300 text-sm">{item.title}</span>
                          <Badge variant={item.type === 'Assignment' ? 'accent' : item.type === 'Quiz' ? 'warning' : 'default'}>
                            {item.type}
                          </Badge>
                          {item.url && <ExternalLink size={11} className="text-zinc-600 shrink-0" />}
                          {item.isCompleted && <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />}
                        </>
                      )}
                    </Wrap>
                  )
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      ))}
    </div>
  )
}

// ─── Flat list layout (all items, searchable) ──────────────────────────────────

function FlatLayout({ items, onItemClick }: {
  items:      FlatItem[]
  onItemClick:(item: ModuleItem) => void
}) {
  const [search, setSearch] = useState('')
  const filtered = useMemo(() =>
    search ? items.filter(i =>
      i.title.toLowerCase().includes(search.toLowerCase()) ||
      i.moduleName.toLowerCase().includes(search.toLowerCase())
    ) : items
  , [items, search])

  if (!items.length) return <EmptyState icon={<Layers size={20} />} title="No items" description="Sync to load module content." />

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search items..."
          className="w-full bg-surface-700 border border-white/10 rounded-lg text-sm text-zinc-200 pl-8 pr-4 py-2 focus:outline-none focus:border-accent-500/60" />
      </div>

      <div className="bg-surface-800 border border-white/5 rounded-xl divide-y divide-white/4 overflow-hidden">
        {!filtered.length && (
          <p className="text-xs text-zinc-600 text-center py-8">No items match your search</p>
        )}
        {filtered.filter(i => i.type !== 'SubHeader').map(item => {
          const isClickable = ['Assignment','Quiz','Page','ExternalUrl','ExternalTool','File'].includes(item.type)
          const Wrap = isClickable ? 'button' : 'div'
          return (
            <Wrap key={item.id}
              {...(isClickable ? { onClick: () => onItemClick(item) } : {})}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-2.5 text-left',
                isClickable ? 'hover:bg-white/3 transition-colors cursor-pointer' : ''
              )}>
              <span className="w-5 flex justify-center shrink-0"><ItemIcon type={item.type} /></span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-200 truncate">{item.title}</p>
                <p className="text-2xs text-zinc-500 mt-0.5">{item.moduleName}</p>
              </div>
              <span className={cn('text-2xs font-medium shrink-0', TYPE_COLORS[item.type] ?? 'text-zinc-500')}>
                {item.type}
              </span>
              {item.isCompleted && <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />}
            </Wrap>
          )
        })}
      </div>
    </div>
  )
}

// ─── By-type layout (grouped by item type) ────────────────────────────────────

function TypeLayout({ items, onItemClick }: {
  items:      FlatItem[]
  onItemClick:(item: ModuleItem) => void
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, FlatItem[]>()
    for (const item of items) {
      if (item.type === 'SubHeader') continue
      if (!map.has(item.type)) map.set(item.type, [])
      map.get(item.type)!.push(item)
    }
    return map
  }, [items])

  if (!grouped.size) return <EmptyState icon={<Layers size={20} />} title="No items" description="Sync to load module content." />

  const typeOrder = ['Assignment', 'Quiz', 'Page', 'File', 'ExternalUrl', 'ExternalTool', 'Discussion']
  const types = [...typeOrder.filter(t => grouped.has(t)), ...[...grouped.keys()].filter(t => !typeOrder.includes(t))]

  return (
    <div className="space-y-4">
      {types.map(type => {
        const typeItems = grouped.get(type)!
        return (
          <div key={type}>
            <div className="flex items-center gap-2 mb-2">
              <span className={cn('flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider', TYPE_COLORS[type] ?? 'text-zinc-500')}>
                <ItemIcon type={type as ModuleItem['type']} />
                {type}s
              </span>
              <span className="text-2xs text-zinc-600">({typeItems.length})</span>
            </div>
            <div className="bg-surface-800 border border-white/5 rounded-xl divide-y divide-white/4 overflow-hidden">
              {typeItems.map(item => {
                const isClickable = ['Assignment','Quiz','Page','ExternalUrl','ExternalTool','File'].includes(item.type)
                const Wrap = isClickable ? 'button' : 'div'
                return (
                  <Wrap key={item.id}
                    {...(isClickable ? { onClick: () => onItemClick(item) } : {})}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2.5 text-left',
                      isClickable ? 'hover:bg-white/3 transition-colors cursor-pointer' : ''
                    )}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-200 truncate">{item.title}</p>
                      <p className="text-2xs text-zinc-500 mt-0.5">{item.moduleName}</p>
                    </div>
                    {item.isCompleted && <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />}
                  </Wrap>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Modules() {
  const [searchParams]  = useSearchParams()
  const navigate        = useNavigate()
  const filterCourseId  = searchParams.get('course')
  const { linkState, open: openLink, close: closeLink } = useLinkOpener()

  const ws          = useWorkspaceStore()
  const active      = ws.active()
  const layout      = active.pagePrefs.modulesLayout
  const showHistory = useAppStore(s => s.preferences?.showHistoryCourses ?? false)
  const isSyncing   = useAppStore(s => s.isSyncing)

  const [courses,  setCourses]  = useState<Course[]>([])
  const [selected, setSelected] = useState<string | null>(filterCourseId)
  const [modules,  setModules]  = useState<ModuleWithItems[]>([])
  const [loading,  setLoading]  = useState(false)
  const [syncing,  setSyncing]  = useState(false)

  useEffect(() => {
    const fetch = showHistory ? api.courses.getAllIncludingInactive : api.courses.getAll
    fetch().then((r: { ok: boolean; data: Course[] }) => {
      if (r.ok) {
        setCourses(r.data)
        if (!selected && r.data.length > 0) setSelected(r.data[0].id)
      }
    })
  }, [showHistory, isSyncing])

  const loadModules = async (courseId: string) => {
    setLoading(true)
    const r = await api.modules.getByCourse(courseId)
    if (!r.ok) { setLoading(false); return }
    const withItems = await Promise.all(
      r.data.map(async (mod: Module) => {
        const ir = await api.modules.getItems(mod.id)
        return { ...mod, items: ir.ok ? ir.data : [], expanded: true }
      })
    )
    setModules(withItems)
    setLoading(false)
  }

  useEffect(() => {
    if (selected) loadModules(selected)
  }, [selected])

  const handleSync = async () => {
    setSyncing(true)
    await api.sync.startAll()
    if (selected) await loadModules(selected)
    setSyncing(false)
  }

  const handleItemClick = (item: ModuleItem) => {
    switch (item.type) {
      case 'Assignment':
        if (item.contentId) navigate(`/assignments/${item.contentId}`)
        break
      case 'Quiz':
        if (item.contentId) navigate(`/quizzes/${item.contentId}`)
        break
      case 'Page':
        if (item.pageUrl) navigate(`/pages/${item.courseId}/${encodeURIComponent(item.pageUrl)}`)
        break
      case 'ExternalUrl':
      case 'ExternalTool':
        if (item.url) openLink(item.url, item.title)
        break
      case 'File':
        if (item.contentId) api.files.open(item.contentId)
        break
    }
  }

  const toggleModule = (id: string) =>
    setModules(prev => prev.map(m => m.id === id ? { ...m, expanded: !m.expanded } : m))

  const flatItems: FlatItem[] = useMemo(() =>
    modules.flatMap(mod => mod.items.map(i => ({ ...i, moduleName: mod.name })))
  , [modules])

  const currentCourse = courses.find(c => c.id === selected)

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Course selector */}
      {courses.length > 1 && (
        <div className="px-6 pt-4 pb-3 border-b border-white/5 flex gap-2 overflow-x-auto shrink-0">
          {courses.map(c => (
            <button key={c.id} onClick={() => setSelected(c.id)}
              className={cn('shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors border',
                selected === c.id ? 'text-white border-transparent' : 'text-zinc-400 border-white/8 hover:bg-surface-700')}
              style={selected === c.id ? { background: c.color ?? '#6366f1' } : {}}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-3xl mx-auto space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <SectionHeader title="Modules"
              subtitle={currentCourse ? `${currentCourse.name} · ${modules.length} module${modules.length !== 1 ? 's' : ''}` : ''} />
            <div className="flex items-center gap-2 shrink-0">
              {/* Layout toggle */}
              <div className="flex rounded-lg border border-white/10 overflow-hidden">
                {LAYOUT_OPTIONS.map(o => (
                  <button key={o.value} onClick={() => ws.updatePagePrefs({ modulesLayout: o.value })}
                    title={o.label}
                    className={cn('px-2.5 py-1.5 transition-colors',
                      layout === o.value ? 'bg-accent-500/20 text-accent-400' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5')}>
                    {o.icon}
                  </button>
                ))}
              </div>
              <Button variant="secondary" size="sm" loading={syncing}
                icon={<RefreshCw size={12} />} onClick={handleSync}>
                {syncing ? 'Syncing...' : 'Sync'}
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2 py-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="rounded-lg bg-surface-800 border border-white/5 p-3 flex items-center gap-3">
                  <Skeleton className="w-4 h-4 rounded" />
                  <Skeleton className="flex-1 h-3" />
                  <Skeleton className="w-12 h-3" />
                </div>
              ))}
            </div>
          ) : modules.length === 0 ? (
            <EmptyState icon={<Layers size={20} />} title="No modules yet"
              description="Modules will appear after syncing."
              action={<Button variant="primary" size="sm" loading={syncing} icon={<RefreshCw size={12} />} onClick={handleSync}>Sync now</Button>} />
          ) : (
            <>
              {layout === 'lms'  && <LmsLayout modules={modules} onToggle={toggleModule} onItemClick={handleItemClick} />}
              {layout === 'flat' && <FlatLayout items={flatItems} onItemClick={handleItemClick} />}
              {layout === 'type' && <TypeLayout items={flatItems} onItemClick={handleItemClick} />}
            </>
          )}
        </div>
      </div>

      {linkState && <LinkOpener url={linkState.url} label={linkState.label} onClose={closeLink} />}
    </div>
  )
}
