'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import NuggetEditor from '@/components/NuggetEditor'
import { useHighlightSave } from '@/components/useHighlightSave'
import DomainIcon from '@/components/DomainIcon'
import { Info, Highlighter, Search, ChevronUp, ChevronDown, X } from 'lucide-react'

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
  _count: { nuggets: number }
}

interface NuggetConceptEntry {
  relevance: number
  note: string | null
  concept: Concept
}

interface Review {
  nextReview: string
  intervalDays: number
  repetitions: number
}

interface Nugget {
  id: string
  title: string
  contentHtml: string
  sourceUrl: string | null
  sourceLabel: string | null
  aiChatUrl: string | null
  tags: string
  domain: Domain | null
  concepts: NuggetConceptEntry[]
  reviews: Review[]
  createdAt: string
}

/** Returns the best display label: German → English → first available. */
function primaryLabel(labels: ConceptLabel[]): string {
  return (
    labels.find(l => l.language === 'de')?.term ??
    labels.find(l => l.language === 'en')?.term ??
    labels[0]?.term ?? '?'
  )
}

/** Maps a highlight's data-color to its CSS palette variable (default yellow). */
const HIGHLIGHT_VARS: Record<string, string> = {
  yellow: '--hl-yellow',
  blue:   '--hl-blue',
  green:  '--hl-green',
  pink:   '--hl-pink',
  orange: '--hl-orange',
}

/** Formats an ISO date as a short German date (e.g. 9. Juni 2026). */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

/**
 * Walk the reading content and build a Range for every case-insensitive
 * occurrence of `query` within a single text node. Matches that straddle
 * element boundaries are intentionally ignored (rare for search terms).
 */
function findRanges(root: HTMLElement, query: string): Range[] {
  const ranges: Range[] = []
  if (!query) return ranges
  const needle = query.toLowerCase()
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    const hay = (node.nodeValue ?? '').toLowerCase()
    let idx = hay.indexOf(needle)
    while (idx !== -1) {
      const range = document.createRange()
      range.setStart(node, idx)
      range.setEnd(node, idx + needle.length)
      ranges.push(range)
      idx = hay.indexOf(needle, idx + needle.length)
    }
  }
  return ranges
}

/** The CSS Custom Highlight registry, or null where unsupported (e.g. old iOS). */
function highlightRegistry(): Map<string, unknown> | null {
  return typeof CSS !== 'undefined' && 'highlights' in CSS
    ? (CSS as unknown as { highlights: Map<string, unknown> }).highlights
    : null
}

/**
 * Paint search matches via the CSS Custom Highlight API — no DOM mutation, so
 * the Tiptap reader (and its highlight-save baseline) stays untouched. The
 * current match is registered separately at higher priority to sit on top.
 */
function setSearchHighlights(ranges: Range[], current: number): void {
  const reg = highlightRegistry()
  const HighlightCtor = (globalThis as unknown as { Highlight?: new (...r: Range[]) => { priority: number } }).Highlight
  if (!reg || !HighlightCtor) return
  reg.delete('search-all')
  reg.delete('search-current')
  if (ranges.length === 0) return
  const all = new HighlightCtor(...ranges.filter((_, i) => i !== current))
  all.priority = 0
  reg.set('search-all', all)
  if (current >= 0 && ranges[current]) {
    const cur = new HighlightCtor(ranges[current])
    cur.priority = 1
    reg.set('search-current', cur)
  }
}

/** Remove both search highlight layers. */
function clearSearchHighlights(): void {
  const reg = highlightRegistry()
  reg?.delete('search-all')
  reg?.delete('search-current')
}

/** Smooth-scroll a range roughly to the vertical centre of the viewport. */
function scrollRangeIntoView(range: Range): void {
  const rect = range.getBoundingClientRect()
  if (rect.height === 0 && rect.width === 0) return
  const top = window.scrollY + rect.top - window.innerHeight / 2
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
}

/**
 * Read-only Tiptap reading view with debounced highlight persistence.
 * Mounted only once the nugget is loaded so the highlight hook is seeded with
 * the real initial HTML (its baseline is captured at first render).
 */
function NuggetReader({ id, contentHtml }: { id: string; contentHtml: string }) {
  const { html, handleContentChange, handleEditorReady } = useHighlightSave(id, contentHtml)
  return (
    <NuggetEditor
      value={html}
      editable={false}
      onChange={handleContentChange}
      onReady={handleEditorReady}
    />
  )
}

export default function NuggetDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()

  const [nugget, setNugget]   = useState<Nugget | null>(null)
  const [loading, setLoading] = useState(true)
  const [isOwner, setIsOwner] = useState(false)
  const [infoOpen, setInfoOpen]       = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [marksOpen, setMarksOpen]     = useState(false)
  const [marks, setMarks]             = useState<{ text: string; color: string }[]>([])
  const [searchOpen, setSearchOpen]   = useState(false)
  const [query, setQuery]             = useState('')
  const [matchCount, setMatchCount]   = useState(0)
  const [currentMatch, setCurrentMatch] = useState(-1)
  // Wraps the reading content; used to record how far into it the user scrolled
  // so the edit view can restore the same position, and to locate highlight marks.
  const contentRef = useRef<HTMLDivElement>(null)
  // Live Range objects for the current query, kept out of state so stepping
  // through matches doesn't trigger a re-render of the whole reading view.
  const matchRanges = useRef<Range[]>([])

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/nuggets/${id}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setNugget(await res.json())
    } catch (e) {
      console.error('Fehler beim Laden:', e)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
    fetch('/api/auth/me')
      .then(r => r.json())
      .then((d: { isOwner: boolean }) => setIsOwner(d.isOwner))
      .catch(() => {})
  }, [load])

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    await fetch(`/api/nuggets/${id}`, { method: 'DELETE' })
    router.push('/all')
  }

  /**
   * Open the editor, remembering the current scroll depth *within the content*
   * (not the absolute page offset, since the edit page has different chrome
   * above the text). The edit view reads this back and scrolls to the same spot.
   */
  const goEdit = () => {
    const content = contentRef.current
    if (content) {
      const contentTop = content.getBoundingClientRect().top + window.scrollY
      sessionStorage.setItem(`nugget-edit-scroll-${id}`, String(window.scrollY - contentTop))
    }
    router.push(`/edit/${id}`)
  }

  /**
   * Collect all highlight marks from the rendered content in document order and
   * open the popup. Reading straight from the live DOM keeps the list indices
   * aligned with the actual <mark> elements we later scroll to.
   */
  const openMarks = () => {
    const nodes = contentRef.current?.querySelectorAll('mark') ?? []
    setMarks(Array.from(nodes).map(el => ({
      text:  (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
      color: el.getAttribute('data-color') ?? 'yellow',
    })))
    setMarksOpen(true)
  }

  /** Scroll the n-th highlight into view (clear of the sticky bar) and close the popup. */
  const scrollToMark = (index: number) => {
    const el = contentRef.current?.querySelectorAll('mark')[index]
    setMarksOpen(false)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  /**
   * Re-run the in-text search for the given query: rebuild match ranges, paint
   * them, and jump to the first hit. Called on every keystroke.
   */
  const runSearch = (q: string) => {
    setQuery(q)
    const root = contentRef.current
    const ranges = root ? findRanges(root, q.trim()) : []
    matchRanges.current = ranges
    setMatchCount(ranges.length)
    const idx = ranges.length ? 0 : -1
    setCurrentMatch(idx)
    setSearchHighlights(ranges, idx)
    if (idx >= 0) scrollRangeIntoView(ranges[idx])
  }

  /** Move to the next (dir=1) or previous (dir=-1) match, wrapping around. */
  const stepMatch = (dir: 1 | -1) => {
    const ranges = matchRanges.current
    if (!ranges.length) return
    const next = (currentMatch + dir + ranges.length) % ranges.length
    setCurrentMatch(next)
    setSearchHighlights(ranges, next)
    scrollRangeIntoView(ranges[next])
  }

  /** Close the search bar and clear its state and highlights. */
  const closeSearch = () => {
    setSearchOpen(false)
    setQuery('')
    matchRanges.current = []
    setMatchCount(0)
    setCurrentMatch(-1)
    clearSearchHighlights()
  }

  // Drop any lingering search highlights when leaving the page.
  useEffect(() => clearSearchHighlights, [])

  if (loading) {
    return (
      <div className="pt-10">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Lädt…</p>
      </div>
    )
  }

  if (!nugget) {
    return (
      <div className="pt-10">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Nugget nicht gefunden.</p>
        <Link href="/all" className="text-sm" style={{ color: 'var(--accent)' }}>← Zurück</Link>
      </div>
    )
  }

  const tags = JSON.parse(nugget.tags || '[]') as string[]
  // Most-connected concepts first (how many other nuggets share each concept).
  const concepts = [...nugget.concepts].sort(
    (a, b) => b.concept._count.nuggets - a.concept._count.nuggets,
  )
  const latestReview = nugget.reviews[0]

  return (
    <>
      {/* Sticky action bar — back / info / edit / delete reachable at any
          scroll position, so editing a long nugget never means scrolling up. */}
      <div
        className="sticky top-0 z-30 -mx-4 px-4 pt-10 pb-3"
        style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => router.back()}
            className="text-sm px-3 py-1 rounded-lg"
            style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
          >
            ← Zurück
          </button>

          {/* Search · highlights list · info toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
              aria-label="Im Text suchen"
              className="flex items-center justify-center p-1.5 rounded-lg transition-colors"
              style={{
                color:      searchOpen ? 'white'        : 'var(--muted)',
                background: searchOpen ? 'var(--accent)' : 'transparent',
                border: `1px solid ${searchOpen ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              <Search size={16} />
            </button>
            <button
              onClick={openMarks}
              aria-label="Markierungen"
              className="flex items-center justify-center p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
            >
              <Highlighter size={16} />
            </button>
            <button
              onClick={() => setInfoOpen(o => !o)}
              aria-label="Details & Konzepte"
              className="flex items-center justify-center p-1.5 rounded-lg transition-colors"
              style={{
                color:      infoOpen ? 'white'        : 'var(--muted)',
                background: infoOpen ? 'var(--accent)' : 'transparent',
                border: `1px solid ${infoOpen ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              <Info size={16} />
            </button>
          </div>

          {isOwner && (
            <div className="flex items-center gap-2">
              {!confirmDelete && (
                <button
                  onClick={goEdit}
                  className="text-xs px-3 py-1 rounded-lg"
                  style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
                >
                  Bearbeiten
                </button>
              )}
              <button
                onClick={handleDelete}
                className="text-xs px-3 py-1 rounded-lg"
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
        </div>

        {/* In-text search bar — kept inside the sticky bar so it (and the match
            counter) stays reachable while stepping through a long nugget. */}
        {searchOpen && (
          <div className="mt-3 flex items-center gap-2">
            <input
              autoFocus
              value={query}
              onChange={e => runSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter')  { e.preventDefault(); stepMatch(e.shiftKey ? -1 : 1) }
                if (e.key === 'Escape') closeSearch()
              }}
              placeholder="Im Nugget suchen…"
              className="flex-1 text-sm px-3 py-1.5 rounded-lg outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink)' }}
            />
            <span
              className="text-xs tabular-nums whitespace-nowrap min-w-[2.5rem] text-center"
              style={{ color: 'var(--muted)' }}
            >
              {query ? `${matchCount ? currentMatch + 1 : 0}/${matchCount}` : ''}
            </span>
            <button
              onClick={() => stepMatch(-1)}
              disabled={!matchCount}
              aria-label="Vorheriger Treffer"
              className="flex items-center justify-center p-1.5 rounded-lg disabled:opacity-40"
              style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
            >
              <ChevronUp size={16} />
            </button>
            <button
              onClick={() => stepMatch(1)}
              disabled={!matchCount}
              aria-label="Nächster Treffer"
              className="flex items-center justify-center p-1.5 rounded-lg disabled:opacity-40"
              style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
            >
              <ChevronDown size={16} />
            </button>
            <button
              onClick={closeSearch}
              aria-label="Suche schließen"
              className="flex items-center justify-center p-1.5 rounded-lg"
              style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>

      <header className="pt-4 pb-2">
        <div className="flex items-center gap-2">
          {nugget.domain && (
            <span
              className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full flex-shrink-0"
              style={{ background: 'var(--warm)', color: 'var(--muted)' }}
            >
              <DomainIcon slug={nugget.domain.slug} size={13} />
              {nugget.domain.name}
            </span>
          )}
        </div>
        {nugget.title && (
          <h1 className="text-2xl mt-2" style={{ color: 'var(--ink)' }}>
            {nugget.title}
          </h1>
        )}
      </header>

      {/* Collapsible info panel — toggled from the top bar, rendered above the
          content so it stays visible without scrolling a long nugget. */}
      {infoOpen && (
        <div
          className="mb-6 px-4 py-4 rounded-xl flex flex-col gap-5"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
            {/* Status */}
            <div>
              <h2 className="text-xs tracking-widest uppercase mb-2" style={{ color: 'var(--muted)' }}>
                Status
              </h2>
              <p className="text-sm" style={{ color: 'var(--ink)' }}>
                Erstellt: {formatDate(nugget.createdAt)}
              </p>
              {latestReview ? (
                <p className="text-sm" style={{ color: 'var(--ink)' }}>
                  Nächste Wiederholung: {formatDate(latestReview.nextReview)}
                  {' · '}Intervall {Math.round(latestReview.intervalDays)} T
                  {' · '}{latestReview.repetitions}× wiederholt
                </p>
              ) : (
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  Noch nicht wiederholt.
                </p>
              )}
            </div>

            {/* Links */}
            {(nugget.sourceUrl || nugget.aiChatUrl) && (
              <div className="flex gap-4 flex-wrap">
                {nugget.sourceUrl && (
                  <a
                    href={nugget.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs flex items-center gap-1.5"
                    style={{ color: 'var(--accent-light)' }}
                  >
                    <span>↗</span>
                    <span>{nugget.sourceLabel || 'Quelle'}</span>
                  </a>
                )}
                {nugget.aiChatUrl && (
                  <a
                    href={nugget.aiChatUrl}
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
            )}

            {/* Tags */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
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

            {/* Concepts — sorted by how many nuggets share them */}
            {concepts.length > 0 && (
              <div>
                <h2 className="text-xs tracking-widest uppercase mb-2" style={{ color: 'var(--muted)' }}>
                  Konzepte
                </h2>
                <div className="flex flex-wrap gap-2">
                  {concepts.map(({ concept }) => (
                    <Link
                      key={concept.id}
                      href={`/concepts/${concept.id}`}
                      className="text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5"
                      style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}
                    >
                      <span>{primaryLabel(concept.labels)}</span>
                      <span style={{ opacity: 0.6 }}>{concept._count.nuggets}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
        </div>
      )}

      {/* Content in focus */}
      <div ref={contentRef}>
        <NuggetReader id={nugget.id} contentHtml={nugget.contentHtml} />
      </div>

      {/* Highlights popup — lists every mark in reading order; tap a row to jump
          to it (closes the popup), or dismiss via × / backdrop. */}
      {marksOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(28,28,30,0.4)' }}
          onClick={() => setMarksOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl overflow-hidden flex flex-col"
            style={{ background: 'var(--surface)', maxHeight: '70vh', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}
            onClick={e => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-4 py-3 flex-shrink-0"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <h2 className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                Markierungen
              </h2>
              <button onClick={() => setMarksOpen(false)} aria-label="Schließen" style={{ color: 'var(--muted)' }}>
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto px-3 py-3 flex flex-col gap-2">
              {marks.length === 0 ? (
                <p className="text-sm text-center py-6" style={{ color: 'var(--muted)' }}>
                  Keine Markierungen in diesem Nugget.
                </p>
              ) : (
                marks.map((m, i) => (
                  <button
                    key={i}
                    onClick={() => scrollToMark(i)}
                    className="w-full text-left text-sm px-3 py-2 rounded-lg truncate transition-all active:scale-[0.99]"
                    style={{ background: `var(${HIGHLIGHT_VARS[m.color] ?? '--hl-yellow'})`, color: 'var(--ink)' }}
                  >
                    {m.text || '—'}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
