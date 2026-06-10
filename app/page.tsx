'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'

interface Bookmark {
  id: string
  quote: string
  prefix: string
  suffix: string
  lineText: string
  createdAt: string
  nugget: { id: string; title: string }
}

/** sessionStorage key handing the jump target over to the nugget view. */
const BOOKMARK_JUMP_KEY = 'nugget-bookmark-jump'

/**
 * Bookmarks landing page (the app's home tab). Lists saved reading spots newest
 * first — each row shows its nugget's title and the bookmarked line. Tapping a
 * row opens the nugget and scrolls to the spot; the trash icon removes it.
 * Deliberately no search: the list is meant to stay short (the last ~10–20 spots).
 */
export default function BookmarksPage() {
  const router = useRouter()
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/bookmarks')
      .then(r => r.json())
      .then((data: Bookmark[]) => { setBookmarks(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  /** Stash the anchor for the nugget view to resolve, then navigate there. */
  const openBookmark = (b: Bookmark) => {
    sessionStorage.setItem(
      BOOKMARK_JUMP_KEY,
      JSON.stringify({ id: b.nugget.id, quote: b.quote, prefix: b.prefix, suffix: b.suffix }),
    )
    router.push(`/nugget/${b.nugget.id}`)
  }

  /** Remove a bookmark and drop it from the list. */
  const removeBookmark = async (id: string) => {
    await fetch(`/api/bookmarks/${id}`, { method: 'DELETE' })
    setBookmarks(prev => prev.filter(b => b.id !== id))
  }

  return (
    <>
      <header className="pt-10 pb-6">
        <p className="text-xs tracking-widest uppercase mb-1" style={{ color: 'var(--muted)' }}>
          Gemerkte Stellen
        </p>
        <h1 className="text-3xl">Lesezeichen</h1>
      </header>

      {loading && (
        <p style={{ color: 'var(--muted)' }} className="text-sm">Lädt…</p>
      )}

      {!loading && bookmarks.length === 0 && (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">✦</p>
          <p className="serif text-xl mb-2">Noch keine Lesezeichen.</p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Tippe beim Lesen oben auf das Lesezeichen-Symbol, um eine Stelle zu merken.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {bookmarks.map(b => (
          <div
            key={b.id}
            className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <button
              onClick={() => openBookmark(b)}
              className="flex-1 min-w-0 text-left transition-all active:scale-[0.99]"
            >
              <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>
                {b.nugget.title || 'Ohne Titel'}
              </p>
              <p className="text-sm truncate mt-0.5" style={{ color: 'var(--ink)' }}>
                {b.lineText || b.quote || '—'}
              </p>
            </button>
            <button
              onClick={() => removeBookmark(b.id)}
              aria-label="Lesezeichen entfernen"
              className="flex-shrink-0 flex items-center justify-center p-2 rounded-lg transition-colors"
              style={{ color: 'var(--muted)' }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </>
  )
}
