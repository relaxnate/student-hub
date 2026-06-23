import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ExternalLink, Download, BookOpen, X, Copy, Check } from 'lucide-react'
import { useState } from 'react'
import { api } from '../../lib/ipc'
import { cn } from '../../lib/utils'

interface LinkOpenerProps {
  url:      string
  label:    string
  isFile?:  boolean
  onClose:  () => void
}

export function LinkOpener({ url, label, isFile = false, onClose }: LinkOpenerProps) {
  const [copied, setCopied] = useState(false)

  const handleOpenBrowser = async () => {
    await api.app.openExternal(url)
    onClose()
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleObsidian = async () => {
    // Create a markdown link and copy it for pasting into Obsidian
    const md = `[${label}](${url})`
    await navigator.clipboard.writeText(md)
    setCopied(true)
    setTimeout(() => { setCopied(false); onClose() }, 1500)
  }

  const actions = [
    {
      icon: <ExternalLink size={16} />,
      label: 'Open in browser',
      desc:  'Opens in your default web browser',
      color: 'text-accent-400',
      onClick: handleOpenBrowser,
    },
    {
      icon: copied ? <Check size={16} /> : <Copy size={16} />,
      label: copied ? 'Copied!' : 'Copy link',
      desc:  'Copy the URL to clipboard',
      color: copied ? 'text-green-400' : 'text-zinc-400',
      onClick: handleCopy,
    },
    {
      icon: <BookOpen size={16} />,
      label: 'Copy as Obsidian link',
      desc:  'Copies [title](url) markdown format',
      color: 'text-violet-400',
      onClick: handleObsidian,
    },
  ]

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="w-full max-w-sm bg-surface-800 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-start justify-between p-4 border-b border-white/5">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-zinc-500 mb-0.5">Open link</p>
              <p className="text-sm font-medium text-zinc-200 truncate">{label}</p>
              <p className="text-xs text-zinc-600 truncate mt-0.5">{url}</p>
            </div>
            <button onClick={onClose}
              className="ml-3 w-7 h-7 rounded-md flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-surface-700 transition-colors shrink-0">
              <X size={14} />
            </button>
          </div>

          {/* Actions */}
          <div className="p-2">
            {actions.map(action => (
              <button key={action.label} onClick={action.onClick}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-surface-700 transition-colors text-left">
                <span className={cn('shrink-0', action.color)}>{action.icon}</span>
                <div>
                  <p className="text-sm font-medium text-zinc-200">{action.label}</p>
                  <p className="text-xs text-zinc-500">{action.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

/** Hook to manage the LinkOpener state */
export function useLinkOpener() {
  const [linkState, setLinkState] = useState<{ url: string; label: string } | null>(null)
  const open  = (url: string, label: string) => setLinkState({ url, label })
  const close = () => setLinkState(null)
  return { linkState, open, close }
}
