'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Link2, Check, Clock } from 'lucide-react'
import { encodeAnchorToken, copyDeepLink } from '@/lib/bookmarkLink'
import { getRecentNuggets, type RecentNugget } from '@/lib/recentNuggets'

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
/** sessionStorage key signalling the nugget view to restore its saved scroll. */
const SCROLL_RESTORE_KEY = 'nugget-restore-scroll'

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
  // The last few nuggets opened on this device (localStorage, newest first).
  const [recent, setRecent] = useState<RecentNugget[]>([])
  // Id of the bookmark whose link was just copied (flips the icon to a check).
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/bookmarks')
      .then(r => r.json())
      .then((data: Bookmark[]) => { setBookmarks(data); setLoading(false) })
      .catch(() => setLoading(false))
    // localStorage is client-only, so read the recents after mount.
    setRecent(getRecentNuggets(3))
  }, [])

  /** Stash the anchor for the nugget view to resolve, then navigate there. */
  const openBookmark = (b: Bookmark) => {
    sessionStorage.setItem(
      BOOKMARK_JUMP_KEY,
      JSON.stringify({ id: b.nugget.id, quote: b.quote, prefix: b.prefix, suffix: b.suffix }),
    )
    router.push(`/nugget/${b.nugget.id}`)
  }

  /**
   * Copy a deep link to this reading spot. The anchor travels in a `?bm=` token;
   * pasted into another nugget's text it becomes a clickable cross-reference that
   * jumps straight to the spot. The nugget id lives in the path.
   */
  const copyBookmarkLink = async (b: Bookmark) => {
    const token = encodeAnchorToken({ quote: b.quote, prefix: b.prefix, suffix: b.suffix })
    // Site-relative path so the stored link survives a domain/server move.
    const path = `/nugget/${b.nugget.id}?bm=${token}`
    // Visible link text = the bookmarked line; URL stays hidden in the href.
    if (await copyDeepLink(path, b.lineText || b.quote)) {
      setCopiedId(b.id)
      setTimeout(() => setCopiedId(null), 1200)
    }
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

      {/* Recently opened — current work surfaced without an explicit bookmark.
          Per-device (localStorage); a small divider separates it from the
          saved bookmarks below. Hidden entirely when nothing was opened yet. */}
      {recent.length > 0 && (
        <section className="mb-6">
          <p className="text-xs tracking-widest uppercase mb-2" style={{ color: 'var(--muted)' }}>
            Zuletzt geöffnet
          </p>
          <div className="flex flex-col gap-2">
            {recent.map(r => (
              <button
                key={r.id}
                onClick={() => {
                  // Signal the nugget view to restore where this nugget was left.
                  // scroll: false stops Next from scrolling the new route to the
                  // top, which would otherwise fight the restore.
                  sessionStorage.setItem(SCROLL_RESTORE_KEY, r.id)
                  router.push(`/nugget/${r.id}`, { scroll: false })
                }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all active:scale-[0.99]"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <Clock size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                <span className="text-sm truncate" style={{ color: 'var(--ink)' }}>
                  {r.title || 'Ohne Titel'}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-6 border-t" style={{ borderColor: 'var(--border)' }} />
        </section>
      )}

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
              onClick={() => copyBookmarkLink(b)}
              aria-label="Link zur Stelle kopieren"
              className="flex-shrink-0 flex items-center justify-center p-2 rounded-lg transition-colors"
              style={{ color: copiedId === b.id ? 'var(--accent)' : 'var(--muted)' }}
            >
              {copiedId === b.id ? <Check size={16} /> : <Link2 size={16} />}
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
