'use client'

import { useEffect, useState } from 'react'
import { ChevronUp, ChevronDown, X, Trash2 } from 'lucide-react'

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
  onStep, onJump, onChangeBody, onFlush, onDelete, onClose,
}: AnnotationSheetProps) {
  // Two-tap delete confirmation, mirroring the single view's delete button.
  const [confirmDelete, setConfirmDelete] = useState(false)

  // A pending confirmation must not carry over to another comment.
  useEffect(() => setConfirmDelete(false), [activeId])

  const active = annotations.find(a => a.id === activeId) ?? null
  const index = active ? annotations.findIndex(a => a.id === active.id) : -1
  const resolved = active !== null && resolvedIds.includes(active.id)

  return (
    <div
      role="dialog"
      aria-modal={false}
      aria-label="Kommentare"
      className="fixed left-0 right-0 bottom-0 z-[60] flex flex-col sheet-enter"
      style={{
        height: '42dvh',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderBottom: 'none',
        borderRadius: '20px 20px 0 0',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
        paddingBottom: 'env(safe-area-inset-bottom)',
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

          {/* Keyed by comment id so switching comments remounts the field
              (fresh autofocus for a brand-new, still-empty comment). */}
          <textarea
            key={active.id}
            value={active.body}
            onChange={e => onChangeBody(active.id, e.target.value)}
            onBlur={() => onFlush(active.id)}
            readOnly={!isOwner}
            autoFocus={isOwner && active.body === ''}
            placeholder="Kommentar…"
            className="flex-1 min-h-0 w-full text-sm px-3 py-2.5 rounded-lg outline-none resize-none"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink)', lineHeight: 1.6 }}
          />

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
