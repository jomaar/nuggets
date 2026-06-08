'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import NuggetEditor from './NuggetEditor'

/** Delay before highlight changes in the reading view are persisted. */
const HIGHLIGHT_SAVE_DELAY_MS = 800

interface Domain {
  id: string
  name: string
  slug: string
  icon: string | null
}

interface ConceptLabel {
  language: string
  term: string
}

interface Concept {
  id: string
  description: string
  labels: ConceptLabel[]
}

interface NuggetConceptEntry {
  relevance: number
  concept: Concept
}

interface NuggetCardProps {
  id: string
  title?: string
  contentHtml: string
  sourceUrl?: string | null
  sourceLabel?: string | null
  aiChatUrl?: string | null
  tags: string[]
  domain?: Domain | null
  concepts?: NuggetConceptEntry[]
  nextReview?: Date | null
  defaultExpanded?: boolean
  onReview?: (id: string, rating: 'again' | 'hard' | 'easy') => void
  onDelete?: (id: string) => void
  showReviewButtons?: boolean
}

/** Returns the best display label: German → English → first available */
function primaryLabel(labels: ConceptLabel[]): string {
  return (
    labels.find(l => l.language === 'de')?.term ??
    labels.find(l => l.language === 'en')?.term ??
    labels[0]?.term ?? '?'
  )
}

/** Derives a fallback title from raw HTML when no title is stored */
function fallbackTitle(contentHtml: string): string {
  const plain = contentHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const sentence = plain.split(/[.!?]/)[0].trim()
  return sentence.length > 80 ? sentence.substring(0, 77) + '…' : sentence
}

export default function NuggetCard({
  id, title, contentHtml, sourceUrl, sourceLabel, aiChatUrl,
  tags, domain, concepts, onReview, onDelete,
  showReviewButtons = false, defaultExpanded = true,
}: NuggetCardProps) {
  const [expanded, setExpanded]       = useState(defaultExpanded)
  const [reviewed, setReviewed]       = useState(false)
  const [loading, setLoading]         = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Local copy of the canonical HTML so highlight edits survive re-renders without
  // the editor's external-sync effect reverting them.
  const [html, setHtml]               = useState(contentHtml)

  // Debounced persistence of highlight changes made while reading.
  const saveTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingHtml = useRef<string | null>(null)
  // The editor's own serialization of the currently-saved content. Seeded from the
  // editor's onReady (its normalized form of the loaded HTML) and updated after each
  // save. Comparing against it suppresses no-op PATCHes — most importantly the
  // spurious onUpdate the read-only editor emits when a card is merely expanded.
  const lastSavedHtml = useRef<string | null>(null)

  const displayTitle = title || fallbackTitle(html)

  /** PATCH the new contentHtml (highlights live in it) to the server. */
  const persist = useCallback(async (next: string) => {
    lastSavedHtml.current = next
    await fetch(`/api/nuggets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentHtml: next }),
    })
  }, [id])

  /** Backstop baseline from the editor's onCreate (may arrive late, see handleContentChange). */
  const handleEditorReady = (initialHtml: string) => {
    if (lastSavedHtml.current === null) lastSavedHtml.current = initialHtml
  }

  /** Highlight (or any content) change from the reading view → debounced save. */
  const handleContentChange = (next: string) => {
    setHtml(next)
    // The first emission establishes the save baseline without persisting. With
    // immediatelyRender:false the editor's onCreate (→ onReady) can fire *after* its first
    // onUpdate, so we can't rely on it alone. That first onUpdate is always the editor's
    // mount-time re-normalization of the stored HTML — the user cannot have highlighted yet,
    // so it never represents a real edit.
    if (lastSavedHtml.current === null) {
      lastSavedHtml.current = next
      return
    }
    // Skip writes that don't change what the server already holds — e.g. re-expanding a card.
    if (next === lastSavedHtml.current) return
    pendingHtml.current = next
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null
      if (pendingHtml.current !== null) {
        persist(pendingHtml.current)
        pendingHtml.current = null
      }
    }, HIGHLIGHT_SAVE_DELAY_MS)
  }

  // Flush a pending save when the card unmounts (e.g. navigation) so no edit is lost.
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        if (pendingHtml.current !== null) persist(pendingHtml.current)
      }
    }
  }, [persist])

  const handleReview = async (rating: 'again' | 'hard' | 'easy') => {
    if (!onReview || loading) return
    setLoading(true)
    await onReview(id, rating)
    setReviewed(true)
    setLoading(false)
  }

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    await fetch(`/api/nuggets/${id}`, { method: 'DELETE' })
    onDelete?.(id)
  }

  return (
    <article
      className="rounded-2xl border mb-3 transition-all overflow-hidden"
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--border)',
        boxShadow: '0 2px 12px rgba(26,23,20,0.06)',
      }}
    >
      {/* Header row — always visible, click to toggle */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left px-5 py-4 flex items-center justify-between gap-3"
      >
        <div className="flex items-center gap-2 min-w-0">
          {domain && (
            <span
              className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
              style={{ background: 'var(--warm)', color: 'var(--muted)' }}
            >
              {domain.icon}
            </span>
          )}
          <span
            className="text-sm font-medium truncate"
            style={{ color: 'var(--ink)' }}
          >
            {displayTitle}
          </span>
        </div>
        <span
          className="flex-shrink-0 text-xs transition-transform"
          style={{
            color: 'var(--muted)',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          ▾
        </span>
      </button>

      {/* Collapsed: show concept chips as preview */}
      {!expanded && concepts && concepts.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-5 pb-3">
          {concepts.map(({ concept }) => (
            <Link
              key={concept.id}
              href={`/concepts/${concept.id}`}
              onClick={e => e.stopPropagation()}
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}
            >
              {primaryLabel(concept.labels)}
            </Link>
          ))}
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <div className="px-5 pb-5">
          {/* Read-only Tiptap view: same document model as the editor, so
              multi-color highlights (<mark data-color>) render identically.
              Selecting text still shows the highlight BubbleMenu; changes are
              debounce-saved via onChange. */}
          <NuggetEditor
            value={html}
            editable={false}
            onChange={handleContentChange}
            onReady={handleEditorReady}
          />

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {tags.map(tag => (
                <span
                  key={tag}
                  className="text-xs px-2.5 py-1 rounded-full"
                  style={{ background: 'var(--warm)', color: 'var(--muted)' }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Concept chips */}
          {concepts && concepts.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {concepts.map(({ concept }) => (
                <Link
                  key={concept.id}
                  href={`/concepts/${concept.id}`}
                  className="text-xs px-2.5 py-1 rounded-full transition-all"
                  style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}
                >
                  {primaryLabel(concept.labels)}
                </Link>
              ))}
            </div>
          )}

          {/* Source & AI Chat links */}
          <div className="flex gap-4 mt-4 flex-wrap">
            {sourceUrl && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs flex items-center gap-1.5"
                style={{ color: 'var(--accent-light)' }}
              >
                <span>↗</span>
                <span>{sourceLabel || 'Quelle'}</span>
              </a>
            )}
            {aiChatUrl && (
              <a
                href={aiChatUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs flex items-center gap-1.5"
                style={{ color: 'var(--accent)' }}
              >
                <span>✦</span>
                <span>KI-Chat öffnen</span>
              </a>
            )}
          </div>

          {/* Edit + Delete buttons */}
          {onDelete && (
            <div className="flex justify-end gap-2 mt-3">
              {!confirmDelete && (
                <Link
                  href={`/edit/${id}`}
                  className="text-xs px-3 py-1 rounded-lg transition-all"
                  style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
                >
                  Bearbeiten
                </Link>
              )}
              <button
                onClick={handleDelete}
                className="text-xs px-3 py-1 rounded-lg transition-all"
                style={{
                  background: confirmDelete ? '#c0392b' : 'transparent',
                  color: confirmDelete ? 'white' : 'var(--muted)',
                  border: `1px solid ${confirmDelete ? '#c0392b' : 'var(--border)'}`,
                }}
              >
                {confirmDelete ? 'Wirklich löschen?' : 'Löschen'}
              </button>
              {confirmDelete && (
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs px-3 py-1 rounded-lg"
                  style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
                >
                  Abbrechen
                </button>
              )}
            </div>
          )}

          {/* Review buttons */}
          {showReviewButtons && !reviewed && (
            <div className="flex gap-3 mt-5 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
              <button
                onClick={() => handleReview('again')}
                disabled={loading}
                className="flex-1 py-2 rounded-xl text-sm font-medium transition-all active:scale-95"
                style={{ background: 'var(--warm)', color: 'var(--muted)' }}
              >
                Nochmal
              </button>
              <button
                onClick={() => handleReview('hard')}
                disabled={loading}
                className="flex-1 py-2 rounded-xl text-sm font-medium transition-all active:scale-95"
                style={{ background: '#f0e8d8', color: 'var(--accent)' }}
              >
                Schwer
              </button>
              <button
                onClick={() => handleReview('easy')}
                disabled={loading}
                className="flex-1 py-2 rounded-xl text-sm font-medium transition-all active:scale-95"
                style={{ background: 'var(--accent)', color: 'white' }}
              >
                Leicht ✓
              </button>
            </div>
          )}

          {reviewed && (
            <p className="text-xs mt-4 text-center" style={{ color: 'var(--muted)' }}>
              ✓ Bewertet – bis zum nächsten Mal
            </p>
          )}
        </div>
      )}
    </article>
  )
}
