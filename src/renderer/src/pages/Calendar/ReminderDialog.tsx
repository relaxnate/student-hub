import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Bell, Trash2 } from 'lucide-react'
import { api } from '../../lib/ipc'
import { cn } from '../../lib/utils'
import { Button } from '../../components/ui/Button'
import { CustomSelect } from '../../components/ui/CustomSelect'
import type { Reminder, ReminderRepeat, CreateReminderInput } from '@shared/types/entities'

// "Notify me" presets → minutes before the event.
const NOTIFY_OPTIONS: { label: string; minutes: number }[] = [
  { label: 'At time of event', minutes: 0 },
  { label: '5 minutes before',  minutes: 5 },
  { label: '10 minutes before', minutes: 10 },
  { label: '15 minutes before', minutes: 15 },
  { label: '30 minutes before', minutes: 30 },
  { label: '1 hour before',     minutes: 60 },
  { label: '2 hours before',    minutes: 120 },
  { label: '1 day before',      minutes: 1440 },
  { label: '2 days before',     minutes: 2880 },
  { label: '1 week before',     minutes: 10080 },
]

const COLORS = [
  '#6366f1', '#3b82f6', '#a855f7', '#22c55e',
  '#f43f5e', '#f97316', '#eab308', '#14b8a6',
]

const REPEATS: { value: ReminderRepeat; label: string }[] = [
  { value: 'none',    label: 'None' },
  { value: 'daily',   label: 'Daily' },
  { value: 'weekly',  label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Date (YYYY-MM-DD) to prefill when creating. Ignored when editing. */
  defaultDate: string
  /** When set, the dialog edits this reminder instead of creating a new one. */
  editing?: Reminder | null
  /** Called after a successful create/update/delete so the calendar can refresh. */
  onSaved: () => void
}

const inputCls =
  'w-full h-9 px-3 rounded-md bg-surface-700 border border-white/[0.08] text-[13px] text-zinc-200 ' +
  'placeholder:text-zinc-600 focus:outline-none focus:border-accent-500/60 transition-colors'

const labelCls = 'text-[11px] font-medium uppercase tracking-wide text-zinc-500 mb-1.5 block'

export default function ReminderDialog({ open, onOpenChange, defaultDate, editing, onSaved }: Props) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(defaultDate)
  const [time, setTime] = useState('')
  const [minutesBefore, setMinutesBefore] = useState(15)
  const [color, setColor] = useState(COLORS[0])
  const [repeat, setRepeat] = useState<ReminderRepeat>('none')
  const [saving, setSaving] = useState(false)

  // Reset the form whenever the dialog opens (for create) or the target changes (for edit).
  useEffect(() => {
    if (!open) return
    if (editing) {
      setTitle(editing.title)
      setDate(editing.date)
      setTime(editing.time ?? '')
      setMinutesBefore(editing.reminderMinutesBefore)
      setColor(editing.color)
      setRepeat(editing.repeat)
    } else {
      setTitle('')
      setDate(defaultDate)
      setTime('')
      setMinutesBefore(15)
      setColor(COLORS[0])
      setRepeat('none')
    }
  }, [open, editing, defaultDate])

  const canSave = title.trim().length > 0 && !!date && !saving

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    const input: CreateReminderInput = {
      title: title.trim(),
      date,
      time: time || null,
      reminderMinutesBefore: minutesBefore,
      color,
      repeat,
    }
    const res = editing
      ? await api.reminders.update({ ...input, id: editing.id })
      : await api.reminders.create(input)
    setSaving(false)
    if (res.ok) { onSaved(); onOpenChange(false) }
  }

  const handleDelete = async () => {
    if (!editing) return
    setSaving(true)
    const res = await api.reminders.delete(editing.id)
    setSaving(false)
    if (res.ok) { onSaved(); onOpenChange(false) }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[420px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2',
            'rounded-xl border border-white/[0.09] bg-surface-800 p-5 shadow-2xl',
            'focus:outline-none'
          )}
        >
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Bell size={15} className="text-accent-400" />
              {editing ? 'Edit reminder' : 'New reminder'}
            </Dialog.Title>
            <Dialog.Close className="text-zinc-500 hover:text-zinc-200 transition-colors">
              <X size={16} />
            </Dialog.Close>
          </div>

          <div className="space-y-3.5">
            <div>
              <label className={labelCls}>Title</label>
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
                placeholder="What's this reminder for?"
                className={inputCls}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Time <span className="text-zinc-600 normal-case">(optional)</span></label>
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} />
              </div>
            </div>

            <div>
              <label className={labelCls}>Notify me</label>
              <CustomSelect
                value={String(minutesBefore)}
                onChange={(v) => setMinutesBefore(Number(v))}
                options={NOTIFY_OPTIONS.map((o) => ({ value: String(o.minutes), label: o.label }))}
              />
              {!time && (
                <p className="text-[11px] text-zinc-600 mt-1">All-day reminders notify relative to 9:00 AM.</p>
              )}
            </div>

            <div>
              <label className={labelCls}>Color</label>
              <div className="flex items-center gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={cn(
                      'w-6 h-6 rounded-full transition-transform',
                      color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-surface-800 scale-105' : 'hover:scale-105'
                    )}
                    style={{ background: c }}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className={labelCls}>Repeat</label>
              <div className="flex items-center gap-1.5">
                {REPEATS.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setRepeat(r.value)}
                    className={cn(
                      'h-8 px-3 rounded-md text-xs font-medium transition-colors',
                      repeat === r.value
                        ? 'bg-accent-500/15 text-accent-300 border border-accent-500/30'
                        : 'bg-surface-700 text-zinc-400 border border-white/[0.06] hover:text-zinc-200'
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mt-5 pt-4 border-t border-white/[0.06]">
            {editing ? (
              <Button variant="danger" size="sm" icon={<Trash2 size={13} />} onClick={handleDelete} disabled={saving}>
                Delete
              </Button>
            ) : <span />}
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={handleSave} disabled={!canSave} loading={saving}>
                {editing ? 'Save' : 'Add reminder'}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
