'use client'

import { useEffect, useState } from 'react'
import { ChevronUp, ChevronDown, X, Trash2, Maximize2, Minimize2 } from 'lucide-react'
import { commentMarkdownToHtml } from '@/lib/content'

/**
 * A margin comment as the API ships it. Anchored to the text via a text-quote
 * anchor (quote + prefix/suffix context) — metadata only, contentHtml is never
 * touched (same principle as bookmarks).
 */
export interface NuggetAnnotation {
  id: string
  nuggetId: string
  quote: string
  prefix: string
  suffix: string
  body: string
  createdAt: string
  updatedAt: string
}

interface AnnotationSheetProps {
  /** All comments of the nugget, already in document order (unresolved last). */
  annotations: NuggetAnnotation[]
  /** Ids whose anchor was found in the rendered text (the rest are orphaned). */
  resolvedIds: string[]
  /** The comment currently shown/edited; the parent owns this. */
  activeId: string | null
  isOwner: boolean
  /** Move to the previous (-1) / next (1) comment in document order. */
  onStep: (dir: 1 | -1) => void
  /** Scroll the reading view to a comment's anchored spot. */
  onJump: (id: string) => void
  /** Live edit of a comment's text (parent persists it debounced). */
  onChangeBody: (id: string, body: string) => void
  /** Persist a comment immediately (textarea blur). */
  onFlush: (id: string) => void
  onDelete: (id: string) => void
  onClose: () => void
  /**
   * Follow an in-app nugget deep-link clicked inside a rendered comment body;
   * returns true when handled (the sheet then suppresses browser navigation).
   * External links stay with the browser.
   */
  onNuggetLink?: (href: string) => boolean
}

/**
 * The comment view for the nugget single view: a fixed bottom panel (roughly
 * the lower half on the iPhone) that shows ONE comment at a time — its anchored
 * text passage plus an editable comment field — with prev/next stepping in
 * document order. Deliberately WITHOUT a backdrop, like GraphSheet: the reading
 * text above stays scrollable, and scrolling it switches the active comment
 * (the parent owns that sync). Covers the BottomNav while open (z-60).
 */
export default function AnnotationSheet({
  annotations, resolvedIds, activeId, isOwner,
  onStep, onJump, onChangeBody, onFlush, onDelete, onClose, onNuggetLink,
}: AnnotationSheetProps) {
  // Two-tap delete confirmation, mirroring the single view's delete button.
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Fullscreen mode: the sheet grows from the 42dvh peek to the full viewport
  // for focused reading/editing of a long comment. Deliberately a toggle, not
  // the default — fullscreen covers the text, so the scroll-sync with the
  // reading view only works in the peek state. Resets on close (unmount).
  const [expanded, setExpanded] = useState(false)

  // Tap-to-edit: the body is stored as Markdown and shown RENDERED; tapping it
  // (owner only) swaps in the textarea. Tracking the id — not a boolean — means
  // stepping to another comment implicitly leaves edit mode. An empty body
  // (brand-new comment) always starts in the editor; onFocus pins the id so the
  // editor doesn't fall back to the rendered view after the first keystroke.
  const [editingId, setEditingId] = useState<string | null>(null)

  // A pending confirmation must not carry over to another comment.
  useEffect(() => setConfirmDelete(false), [activeId])

  const active = annotations.find(a => a.id === activeId) ?? null
  const index = active ? annotations.findIndex(a => a.id === active.id) : -1
  const resolved = active !== null && resolvedIds.includes(active.id)
  const editing = isOwner && active !== null && (editingId === active.id || active.body === '')

  /** Clicks in the rendered body: links are followed, anything else edits. */
  const handleBodyClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest('a')
    const href = anchor?.getAttribute('href')
    if (href) {
      if (onNuggetLink?.(href)) event.preventDefault()
      return
    }
    if (isOwner && active) setEditingId(active.id)
  }

  return (
    <div
      role="dialog"
      aria-modal={false}
      aria-label="Kommentare"
      className="fixed left-0 right-0 bottom-0 z-[60] flex flex-col sheet-enter"
      style={{
        height: expanded ? '100dvh' : '42dvh',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderBottom: 'none',
        borderRadius: expanded ? 0 : '20px 20px 0 0',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
        paddingTop: expanded ? 'env(safe-area-inset-top)' : undefined,
        paddingBottom: 'env(safe-area-inset-bottom)',
        transition: 'height 0.2s ease, border-radius 0.2s ease',
      }}
    >
      <div
        className="flex items-center gap-2 px-5 pt-3 pb-2.5 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <h2 className="text-sm font-medium flex-1" style={{ color: 'var(--ink)' }}>
          Kommentare
          {annotations.length > 0 && (
            <span className="ml-2 text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
              {index + 1}/{annotations.length}
            </span>
          )}
        </h2>
        <button
          onClick={() => onStep(-1)}
          disabled={annotations.length < 2}
          aria-label="Vorheriger Kommentar"
          className="flex items-center justify-center p-1.5 rounded-lg disabled:opacity-40"
          style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
        >
          <ChevronUp size={16} />
        </button>
        <button
          onClick={() => onStep(1)}
          disabled={annotations.length < 2}
          aria-label="Nächster Kommentar"
          className="flex items-center justify-center p-1.5 rounded-lg disabled:opacity-40"
          style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
        >
          <ChevronDown size={16} />
        </button>
        <button
          onClick={() => setExpanded(e => !e)}
          aria-pressed={expanded}
          aria-label={expanded ? 'Vollbild verlassen' : 'Vollbild'}
          className="flex items-center justify-center p-1.5 rounded-lg"
          style={expanded
            ? { color: 'white', background: 'var(--accent)', border: '1px solid var(--accent)' }
            : { color: 'var(--muted)', border: '1px solid var(--border)' }}
        >
          {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
        <button
          onClick={onClose}
          aria-label="Schließen"
          className="flex items-center justify-center p-1.5 rounded-lg ml-1"
          style={{ color: 'var(--muted)' }}
        >
          <X size={18} />
        </button>
      </div>

      {active === null ? (
        <p className="text-sm text-center px-6 py-8" style={{ color: 'var(--muted)' }}>
          Keine Kommentare in diesem Nugget.
          {isOwner && ' Markiere Text und tippe im Menü auf die Sprechblase.'}
        </p>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col gap-2.5 px-5 pt-3 pb-4">
          {/* The anchored passage — tap to scroll the reading view there. The
              dotted underline echoes the in-text comment indicator. */}
          <button
            onClick={() => onJump(active.id)}
            disabled={!resolved}
            className="text-left text-xs line-clamp-2 break-words flex-shrink-0"
            style={{ color: 'var(--muted)', lineHeight: 1.5 }}
          >
            <span
              style={resolved ? {
                textDecoration: 'underline dotted var(--accent)',
                textDecorationThickness: '2px',
                textUnderlineOffset: '0.2em',
              } : undefined}
            >
              {active.quote}
            </span>
          </button>
          {!resolved && (
            <p className="text-xs flex-shrink-0" style={{ color: '#b45309' }}>
              Textstelle nicht mehr auffindbar — der Text wurde vermutlich geändert.
            </p>
          )}

          {editing ? (
            /* Keyed by comment id so switching comments remounts the field
               (fresh autofocus for a brand-new, still-empty comment). */
            <textarea
              key={active.id}
              value={active.body}
              onChange={e => onChangeBody(active.id, e.target.value)}
              onFocus={() => setEditingId(active.id)}
              onBlur={() => { onFlush(active.id); setEditingId(null) }}
              autoFocus
              placeholder="Kommentar… (Markdown)"
              className="flex-1 min-h-0 w-full text-sm px-3 py-2.5 rounded-lg outline-none resize-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink)', lineHeight: 1.6 }}
            />
          ) : (
            /* Rendered Markdown view — same box as the textarea so tapping into
               edit mode feels like focusing the field, not switching screens. */
            <div
              onClick={handleBodyClick}
              className="annotation-body flex-1 min-h-0 w-full text-sm px-3 py-2.5 rounded-lg overflow-y-auto"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink)', lineHeight: 1.6 }}
            >
              {active.body === '' ? (
                <span style={{ color: 'var(--muted)' }}>Kein Kommentartext.</span>
              ) : (
                <div dangerouslySetInnerHTML={{ __html: commentMarkdownToHtml(active.body) }} />
              )}
            </div>
          )}

          {isOwner && (
            <div className="flex items-center justify-end gap-1.5 flex-shrink-0">
              <button
                onClick={() => {
                  if (!confirmDelete) { setConfirmDelete(true); return }
                  setConfirmDelete(false)
                  onDelete(active.id)
                }}
                aria-label={confirmDelete ? 'Wirklich löschen?' : 'Kommentar löschen'}
                className="flex items-center justify-center p-1.5 rounded-lg transition-colors"
                style={{
                  background: confirmDelete ? '#c0392b' : 'transparent',
                  color: confirmDelete ? 'white' : '#c0392b',
                  border: '1px solid #c0392b',
                }}
              >
                <Trash2 size={15} />
              </button>
              {confirmDelete && (
                <button
                  onClick={() => setConfirmDelete(false)}
                  aria-label="Löschen abbrechen"
                  className="flex items-center justify-center p-1.5 rounded-lg"
                  style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
                >
                  <X size={15} />
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
