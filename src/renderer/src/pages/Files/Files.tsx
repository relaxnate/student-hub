import { useEffect, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  FolderOpen, Search, Download, ExternalLink,
  FolderIcon, Eye, Loader2,
  FileText, Table2, ImageIcon, Video, Music, Archive, Globe, Braces, File,
} from 'lucide-react'
import { api } from '../../lib/ipc'
import { cn, formatFileSize } from '../../lib/utils'
import { Skeleton, EmptyState, SectionHeader, Badge } from '../../components/ui/Badge'
import { CustomSelect } from '../../components/ui/CustomSelect'
import { useAppStore } from '../../store/app.store'
import type { CourseFile, Course } from '@shared/types/entities'

const MIME_ICON: Record<string, React.ReactNode> = {
  'application/pdf':   <FileText size={16} className="text-red-400" />,
  'application/msword': <FileText size={16} className="text-blue-400" />,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': <FileText size={16} className="text-blue-400" />,
  'application/vnd.ms-powerpoint': <FileText size={16} className="text-orange-400" />,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': <FileText size={16} className="text-orange-400" />,
  'application/vnd.ms-excel': <Table2 size={16} className="text-green-400" />,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': <Table2 size={16} className="text-green-400" />,
  'image/jpeg': <ImageIcon size={16} className="text-purple-400" />,
  'image/png':  <ImageIcon size={16} className="text-purple-400" />,
  'image/webp': <ImageIcon size={16} className="text-purple-400" />,
  'image/gif':  <ImageIcon size={16} className="text-purple-400" />,
  'video/mp4':       <Video size={16} className="text-pink-400" />,
  'video/quicktime': <Video size={16} className="text-pink-400" />,
  'video/webm':      <Video size={16} className="text-pink-400" />,
  'audio/mpeg': <Music size={16} className="text-amber-400" />,
  'audio/wav':  <Music size={16} className="text-amber-400" />,
  'audio/ogg':  <Music size={16} className="text-amber-400" />,
  'text/plain': <FileText size={16} className="text-zinc-400" />,
  'text/html':  <Globe size={16} className="text-cyan-400" />,
  'text/css':   <Braces size={16} className="text-violet-400" />,
  'application/zip':            <Archive size={16} className="text-zinc-400" />,
  'application/x-zip-compressed': <Archive size={16} className="text-zinc-400" />,
  'application/json': <Braces size={16} className="text-yellow-400" />,
}

function fileIcon(contentType: string): React.ReactNode {
  return MIME_ICON[contentType] ?? <File size={16} className="text-zinc-500" />
}

interface FileWithCourse extends CourseFile {
  course?: Course
}

export default function Files() {
  const [courses,  setCourses]  = useState<Course[]>([])
  const [files,    setFiles]    = useState<FileWithCourse[]>([])
  const [selected, setSelected] = useState<string | 'all'>('all')
  const [search,   setSearch]   = useState('')
  const [loading,  setLoading]  = useState(true)

  const showHistory = useAppStore(s => s.preferences?.showHistoryCourses ?? false)

  // Load courses once on mount
  useEffect(() => {
    const fetch = showHistory ? api.courses.getAllIncludingInactive : api.courses.getAll
    fetch().then((r: { ok: boolean; data: Course[] }) => {
      if (r.ok) setCourses(r.data)
    })
  }, [showHistory])

  // Re-fetch files whenever the course selection changes
  useEffect(() => {
    if (courses.length === 0) return
    setLoading(true)

    const targets = selected === 'all' ? courses : courses.filter(c => c.id === selected)

    Promise.all(
      targets.map(async course => {
        const r = await api.files.getByCourse(course.id)
        return (r.ok ? r.data : []).map((f: CourseFile) => ({ ...f, course }))
      })
    ).then(nested => {
      setFiles(nested.flat())
      setLoading(false)
    })
  }, [courses, selected])

  // Search filter
  const visible = useMemo(() => {
    if (!search.trim()) return files
    const q = search.toLowerCase()
    return files.filter(f =>
      f.displayName.toLowerCase().includes(q) ||
      f.filename.toLowerCase().includes(q) ||
      f.folderPath.toLowerCase().includes(q)
    )
  }, [files, search])

  // Group by folder path within the selected view
  const grouped = useMemo(() => {
    const map = new Map<string, FileWithCourse[]>()
    for (const f of visible) {
      // If showing all courses, prefix with course name to avoid path collisions
      const key = selected === 'all' && f.course
        ? `${f.course.name} / ${f.folderPath}`
        : f.folderPath || '/'
      map.set(key, [...(map.get(key) ?? []), f])
    }
    return map
  }, [visible, selected])

  const totalSize = useMemo(
    () => files.reduce((sum, f) => sum + f.size, 0),
    [files]
  )

  if (loading) {
    return (
      <div className="p-6 space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2.5">
            <Skeleton className="w-4 h-4 rounded" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="w-52 h-3" />
              <Skeleton className="w-32 h-2.5" />
            </div>
            <Skeleton className="w-20 h-3" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-3 shrink-0">
        <SectionHeader
          title="Files"
          subtitle={files.length > 0
            ? `${files.length} file${files.length !== 1 ? 's' : ''} · ${formatFileSize(totalSize)}`
            : 'No files synced yet'}
        />
      </div>

      {/* Controls */}
      <div className="px-6 pb-3 flex items-center gap-3 shrink-0 border-b border-white/5 flex-wrap">
        {/* Course filter */}
        <CustomSelect
          value={selected}
          onChange={setSelected}
          options={[
            { value: 'all', label: 'All courses' },
            ...courses.map(c => ({ value: c.id, label: c.name })),
          ]}
          className="w-44"
        />

        {/* Search */}
        <div className="relative ml-auto">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search files…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-surface-700 border border-white/10 rounded-md text-xs text-zinc-300 pl-7 pr-3 py-1.5 w-44 focus:outline-none focus:border-accent-500/60 focus:w-56 transition-all placeholder:text-zinc-600"
          />
        </div>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {files.length === 0 ? (
          <EmptyState
            icon={<FolderOpen size={20} />}
            title="No files synced"
            description="Your school may restrict file access for student tokens. Try syncing, or download files directly from Canvas. Canvas often limits the Files API to certain token scopes."
          />
        ) : grouped.size === 0 ? (
          <EmptyState
            icon={<Search size={20} />}
            title="No files match"
            description="Try a different search term."
          />
        ) : (
          <div className="space-y-5 max-w-3xl mx-auto">
            {[...grouped.entries()].map(([folder, folderFiles]) => (
              <FolderGroup key={folder} folder={folder} files={folderFiles} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Folder group ─────────────────────────────────────────────────────────────

function FolderGroup({ folder, files }: { folder: string; files: FileWithCourse[] }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Folder header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="flex items-center gap-2 mb-2 group"
      >
        <FolderOpen size={13} className="text-zinc-500 group-hover:text-zinc-300 transition-colors" />
        <span className="text-xs font-medium text-zinc-500 group-hover:text-zinc-300 transition-colors truncate max-w-xs">
          {folder}
        </span>
        <span className="text-2xs text-zinc-700">
          {files.length} file{files.length !== 1 ? 's' : ''} · {formatFileSize(files.reduce((s, f) => s + f.size, 0))}
        </span>
      </button>

      {/* File rows */}
      {!collapsed && (
        <div className="rounded-xl bg-surface-800 border border-white/5 overflow-hidden">
          {files.map((file, i) => (
            <FileRow
              key={file.id}
              file={file}
              isLast={i === files.length - 1}
            />
          ))}
        </div>
      )}
    </motion.div>
  )
}

// ─── File row ─────────────────────────────────────────────────────────────────

type DownloadState = 'idle' | 'downloading' | 'done' | 'error'

function FileRow({ file, isLast }: { file: FileWithCourse; isLast: boolean }) {
  const [dlState,   setDlState]   = useState<DownloadState>('idle')
  const [progress,  setProgress]  = useState(0)   // 0–100
  const [localPath, setLocalPath] = useState<string | null>(file.localPath)
  const [opening,   setOpening]   = useState(false)

  const handleDownload = async () => {
    setDlState('downloading')
    setProgress(0)

    const off = api.files.onDownloadProgress((p: { fileId: string; received: number; total: number | null; done: boolean; localPath: string | null; error: string | null }) => {
      if (p.fileId !== file.id) return
      if (p.total) setProgress(Math.round((p.received / p.total) * 100))
      if (p.done) {
        setLocalPath(p.localPath)
        setDlState('done')
        off()
      }
      if (p.error) {
        setDlState('error')
        off()
      }
    })

    const result = await api.files.download(file.id)
    if (!result.ok) {
      setDlState('error')
      off()
    }
  }

  const handleOpen = async () => {
    setOpening(true)
    await api.files.open(file.id)
    setOpening(false)
  }

  const handleReveal = () => api.files.revealInExplorer(file.id)

  const isDownloaded = !!(localPath || file.localPath)

  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-2.5 hover:bg-white/3 transition-colors',
      !isLast && 'border-b border-white/3'
    )}>
      <span className="shrink-0 select-none" aria-hidden>
        {fileIcon(file.contentType)}
      </span>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-200 truncate">{file.displayName}</p>
        <div className="flex items-center gap-2">
          <p className="text-xs text-zinc-600">{file.contentType} · {formatFileSize(file.size)}</p>
          {dlState === 'downloading' && progress > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-20 h-1 bg-surface-600 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent-500 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-2xs text-zinc-500">{progress}%</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {isDownloaded ? (
          <Badge variant="success">Downloaded</Badge>
        ) : dlState === 'error' ? (
          <Badge variant="danger">Failed</Badge>
        ) : (
          <Badge variant="default">Cloud</Badge>
        )}
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        {/* Open */}
        <button
          onClick={handleOpen}
          disabled={opening}
          title={isDownloaded ? 'Open file' : 'Open in browser'}
          className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-surface-700 transition-colors disabled:opacity-40"
        >
          {isDownloaded ? <Eye size={13} /> : <ExternalLink size={13} />}
        </button>

        {/* Reveal in Finder */}
        {isDownloaded && (
          <button
            onClick={handleReveal}
            title="Reveal in Finder"
            className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-surface-700 transition-colors"
          >
            <FolderIcon size={13} />
          </button>
        )}

        {/* Download */}
        {!isDownloaded && file.url && (
          <button
            onClick={handleDownload}
            disabled={dlState === 'downloading'}
            title="Download"
            className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-500 hover:text-accent-400 hover:bg-surface-700 transition-colors disabled:opacity-40"
          >
            {dlState === 'downloading'
              ? <Loader2 size={13} className="animate-spin" />
              : <Download size={13} />}
          </button>
        )}
      </div>
    </div>
  )
}
