'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import NuggetEditor from '@/components/NuggetEditor'
import { useHighlightSave } from '@/components/useHighlightSave'
import DomainIcon from '@/components/DomainIcon'
import TextStatsBar from '@/components/TextStatsBar'
import { countHtml } from '@/lib/textStats'
import { encodeAnchorToken, decodeAnchorToken, copyDeepLink, type AnchorToken } from '@/lib/bookmarkLink'
import { recordRecentNugget, updateRecentScroll, getRecentScroll } from '@/lib/recentNuggets'
import { Info, Highlighter, Search, ChevronUp, ChevronDown, X, Bookmark, Check, Link2, Waypoints } from 'lucide-react'

interface Domain {
  id: string
  name: string
  slug: string
  icon: string | null
  color: string | null
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

/** One proximity result from /api/nuggets/:id/related (derived via shared concepts). */
interface RelatedNugget {
  id: string
  title: string
  score: number
  sharedConcepts: { id: string; term: string }[]
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

/**
 * Smooth-scroll a range into view. By default it lands roughly at the vertical
 * centre; pass `topOffset` (a viewport-relative y in px) to instead align the
 * range's top edge to that offset — used by the bookmark jump so the line
 * reappears just below the sticky bar, exactly where it was when captured.
 */
function scrollRangeIntoView(range: Range, topOffset?: number): void {
  const rect = range.getBoundingClientRect()
  if (rect.height === 0 && rect.width === 0) return
  const anchor = topOffset ?? window.innerHeight / 2
  const top = window.scrollY + rect.top - anchor
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
}

// --- Bookmark text-quote anchors (W3C Web Annotation style) -----------------
// A bookmark stores the quoted line plus a little surrounding context so it can
// be re-located later by *meaning* rather than by a fragile scroll offset or
// document index — and resolved to the right spot even when the quote repeats.

/** How many characters of context to keep on each side of the quote. */
const ANCHOR_CONTEXT_LEN = 30
/** Max length of the human-readable line shown in the bookmark list. */
const ANCHOR_LINE_LEN = 120
/** Block-level tags whose text forms one readable "line" for the list display. */
const BLOCK_TAGS = new Set(['P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'TD', 'TH', 'FIGCAPTION'])

/** Collapse any run of whitespace to a single space. */
function squashWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ')
}

/** The text node at a viewport point, across the standard and WebKit caret APIs. */
function caretTextNodeAtPoint(x: number, y: number): Text | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node } | null
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }
  let node: Node | null = null
  if (typeof doc.caretPositionFromPoint === 'function') {
    node = doc.caretPositionFromPoint(x, y)?.offsetNode ?? null
  }
  if (!node && typeof doc.caretRangeFromPoint === 'function') {
    node = doc.caretRangeFromPoint(x, y)?.startContainer ?? null
  }
  if (!node) return null
  if (node.nodeType === Node.TEXT_NODE) return node as Text
  // Landed on an element — descend to its first text node with real content.
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
  let t = walker.nextNode() as Text | null
  while (t && (t.nodeValue ?? '').trim() === '') t = walker.nextNode() as Text | null
  return t
}

/** Text of the nearest block ancestor (the readable "line"), for list display. */
function nearestBlockText(node: Node, root: HTMLElement): string {
  let el: Node | null = node
  while (el && el !== root) {
    if (el.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((el as Element).tagName)) {
      return squashWhitespace(el.textContent ?? '').trim().slice(0, ANCHOR_LINE_LEN)
    }
    el = el.parentNode
  }
  return squashWhitespace(node.textContent ?? '').trim().slice(0, ANCHOR_LINE_LEN)
}

/** Capture-time context: the text immediately before/after a whole text node. */
function nodeAnchorContext(root: HTMLElement, node: Text): { prefix: string; suffix: string } {
  const before = document.createRange()
  before.setStart(root, 0)
  before.setEndBefore(node)
  const after = document.createRange()
  after.setStartAfter(node)
  after.setEnd(root, root.childNodes.length)
  return {
    prefix: squashWhitespace(before.toString()).slice(-ANCHOR_CONTEXT_LEN),
    suffix: squashWhitespace(after.toString()).slice(0, ANCHOR_CONTEXT_LEN),
  }
}

/**
 * Build a portable text-quote anchor for a highlight `<mark>` element so it can
 * be deep-linked from another nugget. The marked text is itself the quote; the
 * surrounding text gives the prefix/suffix context that disambiguates repeats.
 */
function anchorForMark(root: HTMLElement, mark: Element): AnchorToken {
  const before = document.createRange()
  before.setStart(root, 0)
  before.setEndBefore(mark)
  const after = document.createRange()
  after.setStartAfter(mark)
  after.setEnd(root, root.childNodes.length)
  return {
    quote:  squashWhitespace(mark.textContent ?? '').trim(),
    prefix: squashWhitespace(before.toString()).slice(-ANCHOR_CONTEXT_LEN),
    suffix: squashWhitespace(after.toString()).slice(0, ANCHOR_CONTEXT_LEN),
  }
}

/** Length of the longest common suffix of `a` and `b`. */
function commonSuffixLen(a: string, b: string): number {
  let i = 0
  while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i++
  return i
}

/** Length of the longest common prefix of `a` and `b`. */
function commonPrefixLen(a: string, b: string): number {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}

/**
 * Re-locate a bookmark anchor in the rendered content. Finds every occurrence of
 * the quote, then — when several exist — picks the one whose surrounding text best
 * matches the stored prefix/suffix, so duplicate lines resolve to the right spot.
 */
function resolveAnchor(root: HTMLElement, quote: string, prefix: string, suffix: string): Range | null {
  const ranges = findRanges(root, quote)
  if (ranges.length <= 1) return ranges[0] ?? null

  let best = ranges[0]
  let bestScore = -1
  for (const range of ranges) {
    const before = document.createRange()
    before.setStart(root, 0)
    before.setEnd(range.startContainer, range.startOffset)
    const after = document.createRange()
    after.setStart(range.endContainer, range.endOffset)
    after.setEnd(root, root.childNodes.length)
    const score =
      commonSuffixLen(squashWhitespace(before.toString()), prefix) +
      commonPrefixLen(squashWhitespace(after.toString()), suffix)
    if (score > bestScore) { bestScore = score; best = range }
  }
  return best
}

/** sessionStorage key carrying a bookmark target across navigation to the nugget. */
const BOOKMARK_JUMP_KEY = 'nugget-bookmark-jump'
/** sessionStorage key signalling that the recent list wants the saved scroll restored. */
const SCROLL_RESTORE_KEY = 'nugget-restore-scroll'

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
  const [relatedNuggets, setRelatedNuggets] = useState<RelatedNugget[]>([])
  const [loading, setLoading] = useState(true)
  const [isOwner, setIsOwner] = useState(false)
  const [infoOpen, setInfoOpen]       = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [marksOpen, setMarksOpen]     = useState(false)
  const [marks, setMarks]             = useState<{ text: string; color: string; markIndex: number }[]>([])
  // Mark index whose deep-link was just copied (flips that row's icon to a check).
  const [copiedMarkIndex, setCopiedMarkIndex] = useState<number | null>(null)
  const [searchOpen, setSearchOpen]   = useState(false)
  const [query, setQuery]             = useState('')
  const [matchCount, setMatchCount]   = useState(0)
  const [currentMatch, setCurrentMatch] = useState(-1)
  // Wraps the reading content; used to record how far into it the user scrolled
  // so the edit view can restore the same position, and to locate highlight marks.
  const contentRef = useRef<HTMLDivElement>(null)
  // The sticky action bar; its bottom edge marks where the visible reading area
  // starts, i.e. the point a bookmark samples as the user's current line.
  const stickyRef = useRef<HTMLDivElement>(null)
  // Brief confirmation that a bookmark was saved (icon flips to a check).
  const [bookmarkSaved, setBookmarkSaved] = useState(false)
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

  // Proximity neighbours for the "Verwandte Nuggets" block below the content.
  // Fetched separately from the detail: it is non-critical, so a failure (or an
  // empty graph) just hides the block. Re-runs when a related link navigates to
  // another nugget (same route, new id).
  useEffect(() => {
    setRelatedNuggets([])
    fetch(`/api/nuggets/${id}/related`)
      .then(r => (r.ok ? r.json() : []))
      .then((list: RelatedNugget[]) => setRelatedNuggets(list))
      .catch(() => {})
  }, [id])

  useEffect(() => {
    load()
    fetch('/api/auth/me')
      .then(r => r.json())
      .then((d: { isOwner: boolean }) => setIsOwner(d.isOwner))
      .catch(() => {})
  }, [load])

  // Remember this nugget as recently opened (per-device, localStorage), so the
  // bookmarks home tab can list current work without an explicit bookmark.
  useEffect(() => {
    if (nugget) recordRecentNugget(nugget.id, nugget.title)
  }, [nugget])

  // Persist the reading scroll position for this nugget (throttled), from any
  // entry point, so the recent list can return here. Also captured on leave.
  useEffect(() => {
    if (!nugget) return
    const id = nugget.id
    let last = 0
    const onScroll = () => {
      const now = Date.now()
      if (now - last < 300) return
      last = now
      updateRecentScroll(id, window.scrollY)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      updateRecentScroll(id, window.scrollY)
    }
  }, [nugget])

  // Tracks which nugget's saved scroll we've already restored (survives the
  // same-segment re-render that related links cause without a remount).
  const restoredScrollFor = useRef<string | null>(null)

  /**
   * Restore the saved scroll position when the recent list asked for it. A
   * bookmark target (URL `?bm=` or a stashed jump) takes precedence, so a
   * deliberate jump always wins. Tiptap renders async and grows the page, so we
   * re-apply the target across animation frames until it fits (or time out).
   */
  useEffect(() => {
    if (!nugget || restoredScrollFor.current === nugget.id) return
    if (new URLSearchParams(window.location.search).get('bm')) return
    if (sessionStorage.getItem(BOOKMARK_JUMP_KEY)) return
    if (sessionStorage.getItem(SCROLL_RESTORE_KEY) !== nugget.id) return

    restoredScrollFor.current = nugget.id
    sessionStorage.removeItem(SCROLL_RESTORE_KEY)
    const target = getRecentScroll(nugget.id)
    if (!target) return

    // Re-apply the target every frame for a short window. Tiptap renders async
    // and grows the page, and a late scroll-to-top (router/browser) can strand
    // us at 0 — re-applying for ~700ms beats both without locking out the user.
    const start = performance.now()
    let raf = 0
    const tick = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight
      window.scrollTo({ top: Math.min(target, Math.max(0, maxScroll)) })
      if (performance.now() - start < 700) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [nugget])

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
   * Collect highlight marks from the rendered content and open the popup.
   * A single block selection spanning several paragraphs becomes one <mark>
   * per paragraph (ProseMirror can't span block boundaries), so we merge
   * consecutive marks of the same colour that are only separated by
   * whitespace/block boundaries into one list entry. `markIndex` keeps each
   * entry pointing at its first <mark> for scroll-to.
   */
  const openMarks = () => {
    const nodes = Array.from(contentRef.current?.querySelectorAll('mark') ?? [])
    const groups: { text: string; color: string; markIndex: number; lastEl: Element }[] = []

    nodes.forEach((el, i) => {
      const color = el.getAttribute('data-color') ?? 'yellow'
      const text  = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
      const prev  = groups[groups.length - 1]

      let contiguous = false
      if (prev && prev.color === color) {
        const between = document.createRange()
        between.setStartAfter(prev.lastEl)
        between.setEndBefore(el)
        // Only whitespace between the two marks → same continuous selection.
        contiguous = between.toString().replace(/\s+/g, '') === ''
      }

      if (prev && contiguous) {
        prev.text   = `${prev.text} ${text}`.trim()
        prev.lastEl = el
      } else {
        groups.push({ text, color, markIndex: i, lastEl: el })
      }
    })

    setMarks(groups.map(({ text, color, markIndex }) => ({ text, color, markIndex })))
    setMarksOpen(true)
  }

  /** Scroll the highlight at the given <mark> index into view and close the popup. */
  const scrollToMark = (markIndex: number) => {
    const el = contentRef.current?.querySelectorAll('mark')[markIndex]
    setMarksOpen(false)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  /**
   * Copy a deep link to a highlight. The marked text becomes a `?bm=` anchor;
   * pasted into another nugget's text it turns into a clickable cross-reference
   * that branches straight to this highlighted spot. The popup stays open so the
   * row's check-mark confirmation is visible.
   */
  const copyMarkLink = async (markIndex: number) => {
    const root = contentRef.current
    const mark = root?.querySelectorAll('mark')[markIndex]
    if (!root || !mark) return
    const anchor = anchorForMark(root, mark)
    // Site-relative path so the stored link survives a domain/server move.
    const path = `/nugget/${id}?bm=${encodeAnchorToken(anchor)}`
    // Visible link text = the highlighted text itself; URL stays hidden in href.
    if (await copyDeepLink(path, anchor.quote)) {
      setCopiedMarkIndex(markIndex)
      setTimeout(() => setCopiedMarkIndex(null), 1200)
    }
  }

  /**
   * Bookmark the line currently at the top of the reading area. We sample the
   * text just below the sticky bar (nudging downward past any inter-line gap)
   * and store it as a text-quote anchor — the quote plus a little surrounding
   * context — so it survives reflow/edits and resolves the right spot on return.
   */
  const addBookmark = async () => {
    const root = contentRef.current
    if (!root) return
    const contentLeft  = root.getBoundingClientRect().left + 24
    const stickyBottom = stickyRef.current?.getBoundingClientRect().bottom ?? 0

    let node: Text | null = null
    for (const dy of [8, 28, 48, 80, 120]) {
      const hit = caretTextNodeAtPoint(contentLeft, stickyBottom + dy)
      if (hit && (hit.nodeValue ?? '').trim().length >= 2) { node = hit; break }
    }
    if (!node) return

    const quote = (node.nodeValue ?? '').trim()
    const { prefix, suffix } = nodeAnchorContext(root, node)
    const lineText = nearestBlockText(node, root)

    await fetch('/api/bookmarks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nuggetId: id, quote, prefix, suffix, lineText }),
    })
    setBookmarkSaved(true)
    setTimeout(() => setBookmarkSaved(false), 1200)
  }

  /**
   * Rebuild match ranges for `q`, paint them, and jump to the first hit.
   * Returns whether any match was found. Shared by the live search box and the
   * auto-search seeded from the all-list (`?q=`).
   */
  const applySearch = (q: string): boolean => {
    const root = contentRef.current
    const ranges = root ? findRanges(root, q.trim()) : []
    matchRanges.current = ranges
    setMatchCount(ranges.length)
    const idx = ranges.length ? 0 : -1
    setCurrentMatch(idx)
    setSearchHighlights(ranges, idx)
    if (idx >= 0) scrollRangeIntoView(ranges[idx])
    return ranges.length > 0
  }

  /** Re-run the in-text search on every keystroke. */
  const runSearch = (q: string) => {
    setQuery(q)
    applySearch(q)
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

  // Guards the one-shot auto-search seeded from the all-list (`?q=`).
  const didInitSearch = useRef(false)

  /**
   * If the page was opened from the all-list search (`?q=`), pre-fill the
   * in-text search and jump to the first hit. The Tiptap reader renders its
   * content asynchronously, so retry across animation frames until the content
   * DOM is populated (or give up, leaving the bar open at 0/0).
   */
  useEffect(() => {
    if (!nugget || didInitSearch.current) return
    const q = new URLSearchParams(window.location.search).get('q')?.trim()
    if (!q) return
    didInitSearch.current = true
    setSearchOpen(true)
    setQuery(q)

    let attempts = 0
    let raf = 0
    const tryRun = () => {
      if (applySearch(q) || attempts++ >= 30) return
      raf = requestAnimationFrame(tryRun)
    }
    raf = requestAnimationFrame(tryRun)
    return () => cancelAnimationFrame(raf)
  }, [nugget])

  // Guards the one-shot bookmark jump handed over on first load.
  const didJumpToBookmark = useRef(false)

  /**
   * Resolve a text-quote anchor against the rendered content and scroll to it,
   * retrying across animation frames until Tiptap has populated the DOM. Returns
   * a canceller for the pending frame. Shared by the on-load jump and the
   * cross-nugget link handler.
   */
  const jumpToAnchor = useCallback((target: { quote: string; prefix: string; suffix: string }) => {
    let attempts = 0
    let raf = 0
    const tryJump = () => {
      const root = contentRef.current
      const range = root ? resolveAnchor(root, target.quote, target.prefix, target.suffix) : null
      if (range) {
        // Align the anchored line to the top of the reading area (just below the
        // sticky bar), matching where addBookmark() sampled it.
        const stickyBottom = stickyRef.current?.getBoundingClientRect().bottom ?? 0
        scrollRangeIntoView(range, stickyBottom)
        return
      }
      if (attempts++ >= 40) return
      raf = requestAnimationFrame(tryJump)
    }
    raf = requestAnimationFrame(tryJump)
    return () => cancelAnimationFrame(raf)
  }, [])

  /**
   * On first load, jump to a target spot if one was handed over. Two sources:
   * a `?bm=` deep-link token in the URL (a cross-nugget link that was clicked or
   * shared) or an anchor stashed in sessionStorage by the bookmark list. The URL
   * token wins when both are present.
   */
  useEffect(() => {
    if (!nugget || didJumpToBookmark.current) return

    let target: { quote: string; prefix: string; suffix: string } | null = null

    const token = new URLSearchParams(window.location.search).get('bm')
    if (token) target = decodeAnchorToken(token)

    if (!target) {
      const raw = sessionStorage.getItem(BOOKMARK_JUMP_KEY)
      if (raw) {
        try {
          const stashed = JSON.parse(raw)
          if (stashed?.id === id) {
            target = { quote: stashed.quote, prefix: stashed.prefix, suffix: stashed.suffix }
          }
        } catch { /* ignore malformed stash */ }
      }
    }
    if (!target) return

    didJumpToBookmark.current = true
    sessionStorage.removeItem(BOOKMARK_JUMP_KEY)
    return jumpToAnchor(target)
  }, [nugget, id, jumpToAnchor])

  /**
   * Intercept clicks on cross-nugget deep-links inside the reading content.
   * Tiptap renders pasted links as plain `<a>` (openOnClick is off), so the DOM
   * click bubbles up here. A same-origin `/nugget/<id>?bm=…` link is handled in
   * app: a link to another nugget navigates (the target view resolves `?bm=`),
   * a link within THIS nugget jumps directly — no remount would re-run the
   * load-jump effect. Everything else (external links) is left to the browser.
   */
  const handleContentClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest('a')
    const href = anchor?.getAttribute('href')
    if (!href) return

    let url: URL
    try { url = new URL(href, window.location.origin) } catch { return }
    if (url.origin !== window.location.origin) return

    const match = url.pathname.match(/^\/nugget\/([^/]+)\/?$/)
    if (!match) return

    event.preventDefault()
    const targetId = match[1]
    if (targetId === id) {
      const token = url.searchParams.get('bm')
      const target = token ? decodeAnchorToken(token) : null
      if (target) jumpToAnchor(target)
      return
    }
    router.push(url.pathname + url.search)
  }

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
        ref={stickyRef}
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

          {/* Bookmark current line · search · highlights list · info toggle */}
          <div className="flex items-center gap-2">
            {isOwner && (
              <button
                onClick={addBookmark}
                aria-label="Lesezeichen setzen"
                className="flex items-center justify-center p-1.5 rounded-lg transition-colors"
                style={{
                  color:      bookmarkSaved ? 'white'        : 'var(--muted)',
                  background:  bookmarkSaved ? 'var(--accent)' : 'transparent',
                  border: `1px solid ${bookmarkSaved ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                {bookmarkSaved ? <Check size={16} /> : <Bookmark size={16} />}
              </button>
            )}
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
              <DomainIcon slug={nugget.domain.slug} icon={nugget.domain.icon} color={nugget.domain.color} size={13} colored />
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

            {/* Concepts — sorted by how many nuggets share them. Each entry shows
                the edge reading (NuggetConcept.note): what THIS nugget says about
                the concept — the WHY of the link, not just that it exists. */}
            {concepts.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xs tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
                    Konzepte
                  </h2>
                  {/* Entry into the ego-network view, focused on this nugget. */}
                  <Link
                    href={`/graph?type=nugget&id=${nugget.id}`}
                    className="text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5"
                    style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}
                  >
                    <Waypoints size={13} />
                    <span>Netz</span>
                  </Link>
                </div>
                <div className="flex flex-col gap-2.5">
                  {concepts.map(({ concept, note }) => (
                    <div key={concept.id}>
                      <Link
                        href={`/concepts/${concept.id}`}
                        className="inline-flex text-xs px-2.5 py-1 rounded-full items-center gap-1.5"
                        style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}
                      >
                        <span>{primaryLabel(concept.labels)}</span>
                        <span style={{ opacity: 0.6 }}>{concept._count.nuggets}</span>
                      </Link>
                      {note && (
                        <p className="text-xs mt-1" style={{ color: 'var(--muted)', lineHeight: '1.5' }}>
                          {note}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
        </div>
      )}

      {/* Length read-out above the text — characters · words · paragraphs. */}
      <TextStatsBar stats={countHtml(nugget.contentHtml)} className="pb-3" />

      {/* Content in focus. Keyed by nugget id: same-segment navigation (related
          links, cross-nugget deeplinks) re-renders this page WITHOUT remounting,
          but the reader's highlight-save hook seeds its state/baseline only on
          mount — the key forces a clean remount for the new nugget. */}
      <div ref={contentRef} onClick={handleContentClick}>
        <NuggetReader key={nugget.id} id={nugget.id} contentHtml={nugget.contentHtml} />
      </div>

      {/* Related nuggets — proximity over shared abstract concepts (lib/graph.ts).
          Each row names the shared concepts: the reason the two nuggets are close. */}
      {relatedNuggets.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xs tracking-widest uppercase mb-4" style={{ color: 'var(--muted)' }}>
            Verwandte Nuggets
          </h2>
          <div className="flex flex-col gap-2">
            {relatedNuggets.map(r => (
              <Link
                key={r.id}
                href={`/nugget/${r.id}`}
                className="flex flex-col gap-1 px-5 py-2.5 rounded-2xl border transition-all active:scale-[0.99]"
                style={{
                  background: 'var(--surface)',
                  borderColor: 'var(--border)',
                  boxShadow: '0 2px 12px rgba(26,23,20,0.06)',
                }}
              >
                <span className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>
                  {r.title}
                </span>
                <span className="text-xs truncate" style={{ color: 'var(--muted)' }}>
                  gemeinsam: {r.sharedConcepts.map(c => c.term).join(' · ')}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

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

            <div
              className="overflow-y-auto px-3 py-3 flex flex-col gap-2"
              style={{ overscrollBehavior: 'contain' }}
            >
              {marks.length === 0 ? (
                <p className="text-sm text-center py-6" style={{ color: 'var(--muted)' }}>
                  Keine Markierungen in diesem Nugget.
                </p>
              ) : (
                marks.map((m, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1 rounded-lg flex-shrink-0 overflow-hidden"
                    style={{ background: `var(${HIGHLIGHT_VARS[m.color] ?? '--hl-yellow'})` }}
                  >
                    <button
                      onClick={() => scrollToMark(m.markIndex)}
                      className="flex-1 min-w-0 text-left text-sm px-3 py-2 truncate transition-all active:scale-[0.99]"
                      style={{ color: 'var(--ink)' }}
                    >
                      {m.text || '—'}
                    </button>
                    <button
                      onClick={() => copyMarkLink(m.markIndex)}
                      aria-label="Link zur Markierung kopieren"
                      className="flex-shrink-0 flex items-center justify-center p-2 mr-1 rounded-lg transition-transform active:scale-95"
                      style={{ color: 'var(--ink)' }}
                    >
                      {copiedMarkIndex === m.markIndex ? <Check size={15} /> : <Link2 size={15} />}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
