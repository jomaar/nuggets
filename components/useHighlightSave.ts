import { useState, useRef, useEffect, useCallback } from 'react'

/** Delay before highlight changes in a reading view are persisted. */
const HIGHLIGHT_SAVE_DELAY_MS = 800

/**
 * Shared reading-view persistence for the read-only Tiptap editor.
 *
 * Both the list card and the single (detail) view render the canonical HTML
 * read-only and let the user add multi-color highlights (<mark data-color>) by
 * selecting text. Those changes must be debounce-saved without ever firing a
 * spurious PATCH on mere mount/expand. This hook owns that whole dance so the
 * two call sites stay byte-for-byte identical in behaviour.
 *
 * Wire it to <NuggetEditor> as:
 *   const { html, handleContentChange, handleEditorReady } = useHighlightSave(id, contentHtml)
 *   <NuggetEditor value={html} editable={false} onChange={handleContentChange} onReady={handleEditorReady} />
 */
export function useHighlightSave(id: string, initialHtml: string) {
  // Local copy of the canonical HTML so highlight edits survive re-renders without
  // the editor's external-sync effect reverting them.
  const [html, setHtml] = useState(initialHtml)

  const saveTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingHtml = useRef<string | null>(null)
  // The editor's own serialization of the currently-saved content. Seeded from the
  // editor's onReady (its normalized form of the loaded HTML) and updated after each
  // save. Comparing against it suppresses no-op PATCHes — most importantly the
  // spurious onUpdate the read-only editor emits when a card is merely expanded.
  const lastSavedHtml = useRef<string | null>(null)

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
  const handleEditorReady = (readyHtml: string) => {
    if (lastSavedHtml.current === null) lastSavedHtml.current = readyHtml
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

  // Flush a pending save when the view unmounts (e.g. navigation) so no edit is lost.
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        if (pendingHtml.current !== null) persist(pendingHtml.current)
      }
    }
  }, [persist])

  return { html, handleContentChange, handleEditorReady }
}
