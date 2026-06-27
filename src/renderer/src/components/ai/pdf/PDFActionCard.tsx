// Action card shown in chat when Byte proposes PDF changes (Phase 4 —
// experimental). The student must click Apply & Save before anything is written;
// the original PDF is never modified. After saving, a success card offers
// Open / Reveal.
import { FileText, FolderOpen, ExternalLink } from 'lucide-react'
import type { PDFProposal } from '@shared/types/ipc'

export function PDFActionCard({ proposal, busy, onApply, onDismiss }: {
  proposal: PDFProposal; busy: boolean; onApply: () => void; onDismiss: () => void
}) {
  const canApply = proposal.kind === 'fillable'
    ? proposal.answers.length > 0
    : (proposal.placements?.length ?? 0) > 0
  const typeLabel = proposal.kind === 'fillable'
    ? `Fillable form (${proposal.fieldCount} fields)`
    : proposal.kind === 'flat'
      ? `Flat / scanned PDF${proposal.detection ? ` · read via ${proposal.detection === 'vision' ? 'image AI' : proposal.detection === 'mixed' ? 'text + image AI' : 'text layer'}` : ''}`
      : 'Unknown'
  return (
    <div className="rounded-xl border border-[var(--accent,#6366f1)] bg-[var(--surface-2,rgba(255,255,255,0.04))] p-3 text-xs space-y-2">
      <div className="flex items-center gap-2">
        <FileText size={15} />
        <span className="font-medium">PDF Action</span>
        <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-[var(--status-warning,#f59e0b)] text-black">Experimental</span>
      </div>
      <div className="text-[var(--text-secondary)]">
        <div><b>File:</b> {proposal.fileName}</div>
        <div><b>Type:</b> {typeLabel}</div>
        {proposal.kind !== 'fillable' && canApply && (
          <div><b>Answers placed:</b> {proposal.placements!.length}</div>
        )}
      </div>

      {proposal.note && <div className="text-[var(--text-secondary)] italic">{proposal.note}</div>}

      {/* Placement preview — see exactly where each answer will land before applying */}
      {proposal.previews && proposal.previews.length > 0 && (
        <div className="flex gap-2 overflow-x-auto rounded bg-[var(--surface-1,rgba(0,0,0,0.2))] p-2">
          {proposal.previews.map((src, i) => (
            <img key={i} src={src} alt={`Page ${i + 1} preview`}
              className="h-56 w-auto rounded border border-[var(--border)] shrink-0" />
          ))}
        </div>
      )}

      {canApply && proposal.answers.length > 0 && (
        <div className="max-h-44 overflow-auto rounded bg-[var(--surface-1,rgba(0,0,0,0.2))] p-2 space-y-1.5">
          {proposal.answers.map(a => (
            <div key={a.name}>
              <div className="text-[var(--text-secondary)]">{a.question}</div>
              <div><b>{a.answer}</b></div>
            </div>
          ))}
        </div>
      )}

      <div className="text-[10px] text-[var(--status-warning,#f59e0b)]">
        ⚠ AI-generated answers may be incorrect. Review everything before submitting to your teacher.
      </div>

      {canApply ? (
        <div className="flex items-center gap-2">
          <button onClick={onApply} disabled={busy}
            className="px-3 py-1 rounded bg-[var(--accent,#6366f1)] text-white disabled:opacity-50">{busy ? 'Saving…' : 'Apply & Save'}</button>
          <button onClick={onDismiss} className="px-3 py-1 rounded border border-[var(--border)]">Dismiss</button>
          <span className="text-[10px] text-[var(--text-secondary)] ml-auto">Saves a copy to Student Hub managed files — your original is untouched.</span>
        </div>
      ) : (
        <button onClick={onDismiss} className="px-3 py-1 rounded border border-[var(--border)]">Dismiss</button>
      )}
    </div>
  )
}

export function PDFSavedCard({ path, onOpen, onReveal }: {
  path: string; onOpen: () => void; onReveal: () => void
}) {
  return (
    <div className="rounded-xl border border-[var(--status-success,#22c55e)] bg-[var(--surface-2,rgba(255,255,255,0.04))] p-3 text-xs space-y-2">
      <div className="font-medium">✓ Filled PDF saved</div>
      <div className="text-[var(--text-secondary)] break-all">{path}</div>
      <div className="flex gap-2">
        <button onClick={onOpen} className="flex items-center gap-1 px-3 py-1 rounded bg-[var(--accent,#6366f1)] text-white"><ExternalLink size={13} /> Open</button>
        <button onClick={onReveal} className="flex items-center gap-1 px-3 py-1 rounded border border-[var(--border)]"><FolderOpen size={13} /> Reveal</button>
      </div>
    </div>
  )
}
