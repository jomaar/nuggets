'use client'

import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import NuggetEditor from '@/components/NuggetEditor'
import AnnotationSheet, { type NuggetAnnotation } from '@/components/AnnotationSheet'
import ScrollJumpButton from '@/components/ScrollJumpButton'
import { useHighlightSave } from '@/components/useHighlightSave'
import DomainIcon from '@/components/DomainIcon'
import TextStatsBar from '@/components/TextStatsBar'
import { countHtml } from '@/lib/textStats'
import { encodeAnchorToken, decodeAnchorToken, copyDeepLink, copyExternalDeepLink, type AnchorToken } from '@/lib/bookmarkLink'
import { recordRecentNugget, removeRecentNugget, updateRecentScroll, getRecentScroll } from '@/lib/recentNuggets'
import {
  HIGHLIGHT_PALETTE, UNDERLINE_PALETTE, MARK_LABEL_MAX,
  markColorVar, markKey, markLabel, hasMarkLabel, parseMarkScheme,
  type MarkKind, type MarkScheme,
} from '@/lib/marking'
import { useOwner } from '@/components/OwnerContext'
import {
  getNuggetFontSize, setNuggetFontSize,
  MIN_FONT_SIZE, MAX_FONT_SIZE, DEFAULT_FONT_SIZE, FONT_SIZE_STEP,
} from '@/lib/nuggetFontSize'
import { Info, Highlighter, Search, ChevronUp, ChevronDown, X, Bookmark, Check, Link2, Waypoints, Printer, Pencil, Trash2, ArrowLeft, MessageSquareText, ALargeSmall, Eye, EyeOff } from 'lucide-react'

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

interface Nugget {
  id: string
  title: string
  contentHtml: string
  sourceUrl: string | null
  sourceLabel: string | null
  aiChatUrl: string | null
  tags: string
  markScheme: string
  domain: Domain | null
  concepts: NuggetConceptEntry[]
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

/**
 * Selector matching every reader marking in the rendered content: highlight
 * marks and coloured underlines. openMarks/scrollToMark/copyMarkLink must all
 * use THIS selector so an entry's index resolves to the same element everywhere
 * (querySelectorAll returns document order regardless of tag).
 */
const MARK_SELECTOR = 'mark, u[data-color]'

/**
 * Equal fixed box for every sticky-bar action button — sizing via padding only
 * left the coloured buttons looking slightly larger than their neighbours.
 */
const ACTION_BTN = 'flex items-center justify-center w-8 h-8 rounded-lg transition-colors shrink-0'

/**
 * Look of the sticky-bar action buttons: each action carries its own colour
 * (CSS var --act-*) as a soft wash behind the saturated icon so the icons are
 * distinguishable at a glance; `active` flips to a solid fill with a white
 * icon. Without a colour the button keeps the neutral muted/border look.
 */
function actionStyle(color?: string, active?: boolean): CSSProperties {
  if (!color) return { color: 'var(--muted)', border: '1px solid var(--border)' }
  if (active) return { color: '#fff', background: color, border: `1px solid ${color}` }
  return {
    color,
    background: `color-mix(in srgb, ${color} 12%, transparent)`,
    border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
  }
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
 * Paint every comment anchor via the CSS Custom Highlight API — same
 * no-DOM-mutation approach as the search painting, so the Tiptap reader (and
 * its highlight-save baseline) stays untouched. Styles live in layout.tsx
 * (`::highlight(annotation)` — subtle wash + dotted underline).
 */
function setAnnotationHighlights(ranges: Range[]): void {
  const reg = highlightRegistry()
  const HighlightCtor = (globalThis as unknown as { Highlight?: new (...r: Range[]) => { priority: number } }).Highlight
  if (!reg || !HighlightCtor) return
  reg.delete('annotation')
  if (ranges.length === 0) return
  const all = new HighlightCtor(...ranges)
  all.priority = 0
  reg.set('annotation', all)
}

/** Stronger wash on the active comment while the sheet is open (null = off). */
function setActiveAnnotationHighlight(range: Range | null): void {
  const reg = highlightRegistry()
  const HighlightCtor = (globalThis as unknown as { Highlight?: new (...r: Range[]) => { priority: number } }).Highlight
  if (!reg || !HighlightCtor) return
  reg.delete('annotation-active')
  if (!range) return
  const active = new HighlightCtor(range)
  active.priority = 2
  reg.set('annotation-active', active)
}

/** Remove both comment highlight layers. */
function clearAnnotationHighlights(): void {
  const reg = highlightRegistry()
  reg?.delete('annotation')
  reg?.delete('annotation-active')
}

/**
 * Smooth-scroll a range into view. By default it lands roughly at the vertical
 * centre; pass `topOffset` (a viewport-relative y in px) to instead align the
 * range's top edge to that offset — used by the bookmark jump so the line
 * reappears just below the sticky bar, exactly where it was when captured.
 */
/** Computed line-height (px) of a range's text, falling back to a sane default. */
function lineHeightOf(range: Range): number {
  const el = range.startContainer.parentElement
  const lh = el ? parseFloat(getComputedStyle(el).lineHeight) : NaN
  return Number.isFinite(lh) ? lh : 24
}

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

/**
 * A readable "line" for the bookmark list, starting AT the captured node.
 *
 * We take the text from the captured node's start to the end of its nearest
 * block ancestor (or `root` when there is none), squashed and capped. Starting
 * at the node — rather than at the block's beginning — matters when a whole
 * document lives in a single block (e.g. an entire chapter in one `<p>`, verses
 * split only by inline markers): the old "block text from the top" then made
 * every bookmark show the document's opening line. Anchoring at the node makes
 * the label begin with the bookmarked spot and stay local.
 */
function nearestBlockText(node: Node, root: HTMLElement): string {
  let block: Node = root
  let el: Node | null = node
  while (el && el !== root) {
    if (el.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((el as Element).tagName)) {
      block = el
      break
    }
    el = el.parentNode
  }
  const range = document.createRange()
  range.setStartBefore(node)
  range.setEnd(block, block.childNodes.length)
  return squashWhitespace(range.toString()).trim().slice(0, ANCHOR_LINE_LEN)
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
 * Build a portable text-quote anchor for a marking element (`<mark>` highlight
 * or `<u data-color>` underline) so it can be deep-linked from another nugget.
 * The marked text is itself the quote; the surrounding text gives the
 * prefix/suffix context that disambiguates repeats.
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

/**
 * Build a text-quote anchor from an arbitrary DOM Range within the reading
 * content — the selection-based counterpart to `anchorForMark`. Clamped to the
 * range's start text node (findRanges/resolveAnchor only match within a single
 * text node), so a selection spanning several paragraphs anchors at its start,
 * mirroring the comment anchor. Returns null when the range holds no text.
 */
function buildRangeAnchor(root: HTMLElement, sel: Range): AnchorToken | null {
  let node: Text | null = null
  let startOffset = 0
  if (sel.startContainer.nodeType === Node.TEXT_NODE) {
    node = sel.startContainer as Text
    startOffset = sel.startOffset
  } else {
    const walker = document.createTreeWalker(sel.startContainer, NodeFilter.SHOW_TEXT)
    let t = walker.nextNode() as Text | null
    while (t && (t.nodeValue ?? '').trim() === '') t = walker.nextNode() as Text | null
    node = t
  }
  if (!node) return null

  const nodeText = node.nodeValue ?? ''
  let endOffset = sel.endContainer === node ? sel.endOffset : nodeText.length
  let quote = nodeText.slice(startOffset, endOffset).trim()
  if (!quote) { startOffset = 0; endOffset = nodeText.length; quote = nodeText.trim() }
  if (!quote) return null

  const before = document.createRange()
  before.setStart(root, 0)
  before.setEnd(node, startOffset)
  const after = document.createRange()
  after.setStart(node, Math.min(endOffset, nodeText.length))
  after.setEnd(root, root.childNodes.length)
  return {
    quote,
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
function NuggetReader({ id, contentHtml, markScheme, onComment, onExternalLink, externalLinkCopied }: {
  id: string
  contentHtml: string
  markScheme: MarkScheme
  onComment?: () => void
  onExternalLink?: () => void
  externalLinkCopied?: boolean
}) {
  const { html, handleContentChange, handleEditorReady } = useHighlightSave(id, contentHtml)
  return (
    <NuggetEditor
      value={html}
      editable={false}
      onChange={handleContentChange}
      onReady={handleEditorReady}
      markScheme={markScheme}
      onComment={onComment}
      onExternalLink={onExternalLink}
      externalLinkCopied={externalLinkCopied}
      renderMermaid
    />
  )
}

export default function NuggetDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()

  const [nugget, setNugget]   = useState<Nugget | null>(null)
  const [relatedNuggets, setRelatedNuggets] = useState<RelatedNugget[]>([])
  const [loading, setLoading] = useState(true)
  const { isOwner } = useOwner()
  const [infoOpen, setInfoOpen]       = useState(false)
  // View-settings row in the sticky bar (font size + verse markers): reachable
  // at any scroll depth, unlike the info panel above the content.
  const [viewOpen, setViewOpen]       = useState(false)
  // Reading font size for nugget text (px). Default first to match SSR, then
  // read the per-device preference on mount to avoid a hydration mismatch.
  const [fontSize, setFontSize]       = useState(DEFAULT_FONT_SIZE)
  // Bible verse markers ([chapter.verse]) visibility — default hidden
  // (scroll-style flow text), kept per nugget in sessionStorage so the edit
  // round-trip (this view unmounts) doesn't silently switch markers off again.
  const [showVerses, setShowVerses]   = useState(false)
  // Comment indicators (dotted underline + wash) visibility — default shown,
  // per nugget in sessionStorage like the verse toggle. Hiding only skips
  // painting the 'annotation' highlight layer; the anchors keep resolving, so
  // the sheet, its ordering and jumps still work (the active-comment wash
  // stays visible while the sheet is open — it is functional, not decoration).
  const [showAnnotationMarks, setShowAnnotationMarks] = useState(true)
  // Hidden marking styles — markKeys ("hl:yellow", "ul:red") whose styling is
  // switched off in the reading view (plain text; contentHtml untouched).
  // Viewing preference like the verse toggle: per nugget in sessionStorage,
  // toggled via the eye buttons in the marks popup's legend.
  const [hiddenMarks, setHiddenMarks] = useState<string[]>([])
  // "Nur Text" master switch: reads the document completely unannotated (verse
  // markers, marking styles AND comment indicators off at once). A pure
  // OVERRIDE — the three individual settings above keep their stored values,
  // so switching back restores the exact fine-grained state. Per nugget in
  // sessionStorage like its siblings.
  const [pureText, setPureText] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [marksOpen, setMarksOpen]     = useState(false)
  const [marks, setMarks]             = useState<{ text: string; color: string; kind: MarkKind; markIndex: number }[]>([])
  // Per-nugget colour meanings (legend), parsed from nugget.markScheme and kept
  // as live state so legend edits reflect immediately in swatches + popup rows.
  const [scheme, setScheme]           = useState<MarkScheme>({})
  // Scheme import ("Schema übernehmen von …"): dialog open, candidate nuggets
  // (null = loading), and the picked source while the replace/merge question shows.
  const [importOpen, setImportOpen]       = useState(false)
  const [importSources, setImportSources] = useState<{ id: string; title: string; scheme: MarkScheme }[] | null>(null)
  const [importSource, setImportSource]   = useState<{ id: string; title: string; scheme: MarkScheme } | null>(null)
  // Mark index whose deep-link was just copied (flips that row's icon to a check).
  const [copiedMarkIndex, setCopiedMarkIndex] = useState<number | null>(null)
  // Margin comments (annotations): anchored the same way as bookmarks
  // (text-quote anchor), stored as metadata — contentHtml is never touched.
  const [annotations, setAnnotations] = useState<NuggetAnnotation[]>([])
  const [annotationsOpen, setAnnotationsOpen] = useState(false)
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null)
  // Comment ids in document order (anchors resolved against the rendered
  // content; orphaned ones last). Drives the sheet's prev/next stepping.
  const [annotationOrder, setAnnotationOrder] = useState<string[]>([])
  // Live Range per comment id — a ref, not state: ranges are re-resolved after
  // content mutations and read by scroll-sync/tap hit-testing, none of which
  // should re-render the reading view.
  const annotationRanges = useRef<Map<string, Range>>(new Map())
  // Bumped (debounced) when the reader DOM mutates, to re-resolve anchors.
  const [annotationResolveTick, setAnnotationResolveTick] = useState(0)
  // Last non-collapsed DOM selection inside the content (via selectionchange):
  // the comment button's raw material — reading the selection in its click
  // handler is too late, iOS may already have collapsed it.
  const selectionRangeRef = useRef<Range | null>(null)
  // Debounce timers for comment PATCHes, one per comment id.
  const annotationSaveTimers = useRef<Map<string, number>>(new Map())
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
  // Brief confirmation that an external deep link was copied (icon flips to a
  // check in the BubbleMenu button itself — see copyExternalLink).
  const [externalLinkCopied, setExternalLinkCopied] = useState(false)
  // Live Range objects for the current query, kept out of state so stepping
  // through matches doesn't trigger a re-render of the whole reading view.
  const matchRanges = useRef<Range[]>([])

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/nuggets/${id}`)
      // Gone for good (deleted, possibly on another device): drop the stale
      // entry from this device's recent list so it stops offering a dead link.
      if (res.status === 404) removeRecentNugget(id)
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
  }, [load])

  // Load this nugget's comments. A same-segment hop to another nugget resets
  // the whole comment state — the sheet must never show the previous nugget's.
  useEffect(() => {
    setAnnotations([])
    setAnnotationOrder([])
    setActiveAnnotationId(null)
    setAnnotationsOpen(false)
    annotationRanges.current = new Map()
    clearAnnotationHighlights()
    fetch(`/api/annotations?nuggetId=${id}`)
      .then(r => (r.ok ? r.json() : []))
      .then((list: NuggetAnnotation[]) => setAnnotations(list))
      .catch(() => {})
  }, [id])

  // Track the last non-collapsed selection inside the reading content. The
  // BubbleMenu's comment button needs the DOM Range to build the anchor, and
  // by the time its click handler runs the selection may already be collapsed.
  useEffect(() => {
    const onSelectionChange = () => {
      const sel = document.getSelection()
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return
      const range = sel.getRangeAt(0)
      if (!contentRef.current?.contains(range.commonAncestorContainer)) return
      selectionRangeRef.current = range.cloneRange()
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [])

  // Re-resolve comment anchors (debounced) whenever the reader DOM changes:
  // Tiptap renders async, and adding/removing highlights redraws nodes, which
  // silently orphans previously resolved Ranges.
  useEffect(() => {
    if (!nugget) return
    const root = contentRef.current
    if (!root) return
    let timer = 0
    const observer = new MutationObserver(() => {
      clearTimeout(timer)
      timer = window.setTimeout(() => setAnnotationResolveTick(t => t + 1), 300)
    })
    observer.observe(root, { childList: true, characterData: true, subtree: true })
    return () => { observer.disconnect(); clearTimeout(timer) }
  }, [nugget])

  // Resolve every comment anchor against the rendered content, establish the
  // document order, and paint the in-text indicators (CSS Custom Highlight
  // API — no DOM mutation). Retries across frames while Tiptap is still
  // rendering, same pattern as the bookmark jump.
  useEffect(() => {
    if (!nugget) return
    let attempts = 0
    let raf = 0
    const resolveAll = () => {
      const root = contentRef.current
      const ready = !!root && (root.textContent ?? '').trim().length > 0
      if (!ready && annotations.length > 0 && attempts++ < 40) {
        raf = requestAnimationFrame(resolveAll)
        return
      }
      const map = new Map<string, Range>()
      if (root) {
        for (const a of annotations) {
          const range = resolveAnchor(root, a.quote, a.prefix, a.suffix)
          if (range) map.set(a.id, range)
        }
      }
      annotationRanges.current = map
      const resolvedIds = annotations
        .filter(a => map.has(a.id))
        .sort((a, b) => map.get(a.id)!.compareBoundaryPoints(Range.START_TO_START, map.get(b.id)!))
        .map(a => a.id)
      const orphanIds = annotations.filter(a => !map.has(a.id)).map(a => a.id)
      setAnnotationOrder([...resolvedIds, ...orphanIds])
      // Ranges are always resolved (sheet order/jumps need them); only the
      // painted indicator layer follows the visibility toggle — or the
      // "Nur Text" master switch, which overrides it.
      setAnnotationHighlights(showAnnotationMarks && !pureText ? [...map.values()] : [])
    }
    raf = requestAnimationFrame(resolveAll)
    return () => cancelAnimationFrame(raf)
  }, [annotations, nugget, annotationResolveTick, showAnnotationMarks, pureText])

  // Stronger wash on the active comment while the sheet is open. The order
  // dependency re-runs this after a re-resolution, replacing a stale Range.
  useEffect(() => {
    const range = annotationsOpen && activeAnnotationId
      ? annotationRanges.current.get(activeAnnotationId) ?? null
      : null
    setActiveAnnotationHighlight(range)
  }, [annotationsOpen, activeAnnotationId, annotationOrder])

  // While the sheet is open, scrolling the text switches the active comment
  // to the topmost one visible in the reading area (sticky bar → sheet edge) —
  // "scroll to a spot and the sheet shows what you noted there".
  useEffect(() => {
    if (!annotationsOpen) return
    let timer = 0
    const onScroll = () => {
      clearTimeout(timer)
      timer = window.setTimeout(() => {
        const stickyBottom = stickyRef.current?.getBoundingClientRect().bottom ?? 0
        const viewBottom = window.innerHeight * 0.56 // the sheet covers ~42dvh
        let best: string | null = null
        let bestTop = Infinity
        annotationRanges.current.forEach((range, aid) => {
          const rect = range.getBoundingClientRect()
          if (rect.height === 0 && rect.width === 0) return
          if (rect.bottom < stickyBottom || rect.top > viewBottom) return
          if (rect.top < bestTop) { bestTop = rect.top; best = aid }
        })
        if (best) setActiveAnnotationId(best)
      }, 150)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); clearTimeout(timer) }
  }, [annotationsOpen])

  // Remember this nugget as recently opened (per-device, localStorage), so the
  // bookmarks home tab can list current work without an explicit bookmark.
  useEffect(() => {
    if (nugget) recordRecentNugget(nugget.id, nugget.title)
  }, [nugget])

  // Sync the control to the stored reading size on mount (the CSS var itself is
  // already applied flash-free by the boot script in layout.tsx).
  useEffect(() => { setFontSize(getNuggetFontSize()) }, [])

  // Restore the per-nugget verse-marker visibility (keyed on id: a same-segment
  // hop to another nugget must pick up THAT nugget's stored state).
  useEffect(() => {
    setShowVerses(sessionStorage.getItem(`nugget-verses-${id}`) === '1')
  }, [id])

  /** Toggle the verse markers and remember the choice for this nugget. */
  const toggleVerses = () => {
    const next = !showVerses
    setShowVerses(next)
    sessionStorage.setItem(`nugget-verses-${id}`, next ? '1' : '0')
  }

  // Restore the per-nugget "Nur Text" master switch (default off).
  useEffect(() => {
    setPureText(sessionStorage.getItem(`nugget-pure-${id}`) === '1')
  }, [id])

  /** Toggle the "Nur Text" master switch and remember the choice. */
  const togglePureText = () => {
    const next = !pureText
    setPureText(next)
    sessionStorage.setItem(`nugget-pure-${id}`, next ? '1' : '0')
  }

  // Restore the per-nugget comment-indicator visibility (default shown).
  useEffect(() => {
    setShowAnnotationMarks(sessionStorage.getItem(`nugget-annotation-marks-${id}`) !== '0')
  }, [id])

  /** Toggle the in-text comment indicators and remember the choice. */
  const toggleAnnotationMarks = () => {
    const next = !showAnnotationMarks
    setShowAnnotationMarks(next)
    sessionStorage.setItem(`nugget-annotation-marks-${id}`, next ? '1' : '0')
  }

  // Restore the per-nugget hidden marking styles (keyed on id like the verse
  // toggle — a same-segment hop must pick up THAT nugget's stored state).
  useEffect(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem(`nugget-hidden-marks-${id}`) ?? '[]')
      setHiddenMarks(Array.isArray(stored) ? stored.filter(k => typeof k === 'string') : [])
    } catch {
      setHiddenMarks([])
    }
  }, [id])

  /** Apply a new hidden-markings set and remember it for this nugget. */
  const applyHiddenMarks = (next: string[]) => {
    setHiddenMarks(next)
    sessionStorage.setItem(`nugget-hidden-marks-${id}`, JSON.stringify(next))
  }

  /** Show/hide one (style, colour) pair's styling in the reading view. */
  const toggleMarkHidden = (kind: MarkKind, color: string) => {
    const key = markKey(kind, color)
    applyHiddenMarks(hiddenMarks.includes(key)
      ? hiddenMarks.filter(k => k !== key)
      : [...hiddenMarks, key])
  }

  /** Hide/show ALL marking styles of the legend at once. */
  const setAllMarksHidden = (hidden: boolean, keys: string[]) => {
    applyHiddenMarks(hidden ? keys : [])
  }

  // Seed the live colour-meaning scheme whenever a (new) nugget arrives.
  useEffect(() => {
    if (nugget) setScheme(parseMarkScheme(nugget.markScheme))
  }, [nugget])

  /**
   * Rename a (style, colour) combination in the legend: update the live scheme
   * and persist it. Metadata only — contentHtml is never touched, so this can't
   * collide with the debounced highlight save.
   */
  const commitMarkLabel = async (kind: MarkKind, color: string, value: string) => {
    const key = markKey(kind, color)
    const label = value.trim().slice(0, MARK_LABEL_MAX)
    if ((scheme[key] ?? '') === label) return
    const next = { ...scheme }
    if (label) next[key] = label
    else delete next[key]
    setScheme(next)
    await fetch(`/api/nuggets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markScheme: next }),
    })
  }

  /**
   * Open the scheme-import dialog and (re)load the candidates: every other
   * nugget with at least one named colour (list GET ships markScheme).
   */
  const openImport = () => {
    setImportOpen(true)
    setImportSource(null)
    setImportSources(null)
    fetch('/api/nuggets')
      .then(r => (r.ok ? r.json() : []))
      .then((rows: { id: string; title: string; markScheme?: string }[]) =>
        setImportSources(rows
          .map(r => ({ id: r.id, title: r.title, scheme: parseMarkScheme(r.markScheme) }))
          .filter(r => r.id !== id && Object.keys(r.scheme).length > 0)))
      .catch(() => setImportSources([]))
  }

  /**
   * A source nugget was picked. With no local names the import is unambiguous
   * (plain copy); otherwise hold the source and ask replace vs. merge.
   */
  const pickImportSource = (source: { id: string; title: string; scheme: MarkScheme }) => {
    if (Object.keys(scheme).length === 0) applyImport(source.scheme)
    else setImportSource(source)
  }

  /** Persist an imported scheme — metadata copy only, contentHtml untouched. */
  const applyImport = async (next: MarkScheme) => {
    setImportOpen(false)
    setScheme(next)
    await fetch(`/api/nuggets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markScheme: next }),
    })
  }

  /** Step the reading font size by `delta` px (clamped + persisted + applied). */
  const changeFontSize = (delta: number) => setFontSize(setNuggetFontSize(fontSize + delta))
  /** Reset the reading font size to the default. */
  const resetFontSize = () => setFontSize(setNuggetFontSize(DEFAULT_FONT_SIZE))

  // Persist the reading scroll position for this nugget, from any entry point,
  // so the recent list can return here. A periodic save during a long scroll
  // plus a trailing save when scrolling settles captures the resting position.
  // We deliberately do NOT save on cleanup: leaving via an in-app link scrolls
  // the page to the top first, so a cleanup read of window.scrollY would clobber
  // the good value with 0 (this is exactly why it failed on iOS but not in a
  // hard-reload test).
  useEffect(() => {
    if (!nugget) return
    const id = nugget.id
    let lastSave = 0
    let trailing = 0
    const save = () => { lastSave = Date.now(); updateRecentScroll(id, window.scrollY) }
    const onScroll = () => {
      if (Date.now() - lastSave > 400) save()       // periodic during continuous scroll
      clearTimeout(trailing)
      trailing = window.setTimeout(save, 200)         // resting position after scrolling stops
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      clearTimeout(trailing)
    }
  }, [nugget])

  // Tracks which nugget's saved scroll we've already restored (survives the
  // same-segment re-render that related links cause without a remount).
  const restoredScrollFor = useRef<string | null>(null)

  /**
   * Restore the saved scroll position when the recent list asked for it (absolute
   * window offset from localStorage) OR when the user returns from the edit view
   * (position stashed by the editor's Schließen as a FRACTION of the content
   * height — the two pages have different chrome above the text and a different
   * text-column width, i.e. different line wrapping, so pixel offsets don't
   * transfer). A bookmark target (URL `?bm=` or a stashed jump) takes precedence,
   * so a deliberate jump always wins. Tiptap renders async and grows the page, so
   * we re-apply the target across animation frames until it fits (or time out).
   */
  useEffect(() => {
    if (!nugget || restoredScrollFor.current === nugget.id) return
    if (new URLSearchParams(window.location.search).get('bm')) return
    if (sessionStorage.getItem(BOOKMARK_JUMP_KEY)) return

    const editReturnRaw = sessionStorage.getItem(`nugget-read-pos-${nugget.id}`)
    const fromRecent = sessionStorage.getItem(SCROLL_RESTORE_KEY) === nugget.id
    if (editReturnRaw === null && !fromRecent) return

    restoredScrollFor.current = nugget.id
    sessionStorage.removeItem(`nugget-read-pos-${nugget.id}`)
    if (fromRecent) sessionStorage.removeItem(SCROLL_RESTORE_KEY)

    // Edit return wins over the recent-list target: it is the fresher position.
    const contentRatio = editReturnRaw !== null ? Number(editReturnRaw) : NaN
    const absoluteTarget = Number.isNaN(contentRatio) ? getRecentScroll(nugget.id) : undefined
    if (Number.isNaN(contentRatio) && !absoluteTarget) return

    // Re-apply the target each frame until we reach it and hold briefly, or a
    // safety cap elapses. Tiptap renders async and grows the page (so the target
    // may be unreachable for a while on a slow device), and a late scroll-to-top
    // can strand us at 0 — holding past first contact beats both. The ratio is
    // re-applied to the CURRENT content height each frame for the same reason.
    const start = performance.now()
    let reachedAt = 0
    let raf = 0
    const tick = () => {
      let target = absoluteTarget ?? 0
      if (!Number.isNaN(contentRatio)) {
        const content = contentRef.current
        if (!content) {
          if (performance.now() - start < 2500) raf = requestAnimationFrame(tick)
          return
        }
        const contentTop = content.getBoundingClientRect().top + window.scrollY
        target = contentTop + contentRatio * content.offsetHeight
      }
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight
      const goal = Math.min(Math.max(0, target), Math.max(0, maxScroll))
      window.scrollTo({ top: goal })
      const reached = Math.abs(window.scrollY - goal) <= 2
      reachedAt = reached ? (reachedAt || performance.now()) : 0
      const held = reachedAt && performance.now() - reachedAt > 150
      if (held || performance.now() - start > 2500) return
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [nugget])

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    await fetch(`/api/nuggets/${id}`, { method: 'DELETE' })
    // This device just opened the nugget to delete it, so it sits at the top
    // of the recent list — remove it or the list offers a dead link.
    removeRecentNugget(id)
    router.push('/all')
  }

  /**
   * Open the editor, remembering the current scroll depth *within the content*
   * as a FRACTION of the content height (not the absolute page offset): the edit
   * page has different chrome above the text AND a narrower text column (editor
   * padding + border), so the same spot sits at a different pixel offset there —
   * a proportional position transfers across the differing line wrapping.
   */
  const goEdit = () => {
    const content = contentRef.current
    if (content) {
      const contentTop = content.getBoundingClientRect().top + window.scrollY
      const ratio = (window.scrollY - contentTop) / Math.max(1, content.offsetHeight)
      sessionStorage.setItem(`nugget-edit-pos-${id}`, String(ratio))
    }
    router.push(`/edit/${id}`)
  }

  /**
   * Collect reader markings (highlights + coloured underlines) from the
   * rendered content and open the popup. A single block selection spanning
   * several paragraphs becomes one element per paragraph (ProseMirror can't
   * span block boundaries), so we merge consecutive markings of the same
   * style + colour that are only separated by whitespace/block boundaries
   * into one list entry. `markIndex` keeps each entry pointing at its first
   * element (index over the shared MARK_SELECTOR list) for scroll-to.
   */
  const openMarks = () => {
    const nodes = Array.from(contentRef.current?.querySelectorAll(MARK_SELECTOR) ?? [])
    const groups: { text: string; color: string; kind: MarkKind; markIndex: number; lastEl: Element }[] = []

    nodes.forEach((el, i) => {
      const kind: MarkKind = el.tagName === 'MARK' ? 'hl' : 'ul'
      const color = el.getAttribute('data-color') ?? 'yellow'
      const text  = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
      const prev  = groups[groups.length - 1]

      let contiguous = false
      if (prev && prev.color === color && prev.kind === kind) {
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
        groups.push({ text, color, kind, markIndex: i, lastEl: el })
      }
    })

    setMarks(groups.map(({ text, color, kind, markIndex }) => ({ text, color, kind, markIndex })))
    setMarksOpen(true)
  }

  /** Scroll the marking at the given MARK_SELECTOR index into view and close the popup. */
  const scrollToMark = (markIndex: number) => {
    const el = contentRef.current?.querySelectorAll(MARK_SELECTOR)[markIndex]
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
    const mark = root?.querySelectorAll(MARK_SELECTOR)[markIndex]
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
   * Create a comment from the captured selection and open the sheet on it.
   * The anchor is clamped to the selection's first text node — findRanges/
   * resolveAnchor match within single text nodes, mirroring the bookmark
   * anchors — so a selection spanning paragraphs anchors at its start.
   */
  const addAnnotation = async () => {
    const root = contentRef.current
    const sel = selectionRangeRef.current
    if (!root || !sel) return
    const anchor = buildRangeAnchor(root, sel)
    if (!anchor) return

    const res = await fetch('/api/annotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nuggetId: id, ...anchor, body: '' }),
    })
    if (!res.ok) return
    const created: NuggetAnnotation = await res.json()
    setAnnotations(prev => [...prev, created])
    setActiveAnnotationId(created.id)
    setAnnotationsOpen(true)
  }

  /**
   * Copy an ABSOLUTE deep link to the current selection, for sharing outside
   * the app (Reminders, Kalender, chat, email) — TODO 8. Unlike the internal
   * cross-nugget links (site-relative href, portable across domain moves), a
   * link meant to leave the app must carry the domain. Reuses the exact anchor
   * mechanic behind bookmarks/comments/highlight links, just built from an
   * arbitrary selection instead of a `<mark>` or a sampled line. The selection
   * is left intact (unlike the comment button) so the checkmark confirmation
   * is visible in place before the menu closes.
   */
  const copyExternalLink = async () => {
    const root = contentRef.current
    const sel = selectionRangeRef.current
    if (!root || !sel) return
    const anchor = buildRangeAnchor(root, sel)
    if (!anchor) return
    const path = `/nugget/${id}?bm=${encodeAnchorToken(anchor)}`
    if (await copyExternalDeepLink(path, anchor.quote)) {
      setExternalLinkCopied(true)
      setTimeout(() => setExternalLinkCopied(false), 1200)
    }
  }

  /** Live-edit a comment: state immediately, PATCH debounced per comment. */
  const updateAnnotationBody = (annotationId: string, body: string) => {
    setAnnotations(prev => prev.map(a => (a.id === annotationId ? { ...a, body } : a)))
    const timers = annotationSaveTimers.current
    clearTimeout(timers.get(annotationId))
    timers.set(annotationId, window.setTimeout(() => {
      timers.delete(annotationId)
      fetch(`/api/annotations/${annotationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      }).catch(() => {})
    }, 600))
  }

  /** Persist a pending comment edit immediately (textarea blur). */
  const flushAnnotationSave = (annotationId: string) => {
    const timers = annotationSaveTimers.current
    const timer = timers.get(annotationId)
    if (timer === undefined) return
    clearTimeout(timer)
    timers.delete(annotationId)
    const body = annotations.find(a => a.id === annotationId)?.body ?? ''
    fetch(`/api/annotations/${annotationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    }).catch(() => {})
  }

  /** Delete a comment; the active one hands over to its document-order neighbour. */
  const deleteAnnotation = async (annotationId: string) => {
    clearTimeout(annotationSaveTimers.current.get(annotationId))
    annotationSaveTimers.current.delete(annotationId)
    setAnnotations(prev => prev.filter(a => a.id !== annotationId))
    if (activeAnnotationId === annotationId) {
      const idx = annotationOrder.indexOf(annotationId)
      const rest = annotationOrder.filter(x => x !== annotationId)
      setActiveAnnotationId(rest[idx] ?? rest[idx - 1] ?? null)
    }
    await fetch(`/api/annotations/${annotationId}`, { method: 'DELETE' })
  }

  /**
   * Close the sheet. Comments left empty are junk (created but never written),
   * so they are deleted — no orphaned indicators linger in the text.
   */
  const closeAnnotations = () => {
    setAnnotationsOpen(false)
    if (!isOwner) return
    annotations.filter(a => a.body.trim() === '').forEach(a => deleteAnnotation(a.id))
  }

  /** Open the sheet from the toolbar (first comment active unless one already is). */
  const openAnnotations = () => {
    if (!activeAnnotationId || !annotations.some(a => a.id === activeAnnotationId)) {
      setActiveAnnotationId(annotationOrder[0] ?? null)
    }
    setAnnotationsOpen(true)
  }

  /** Make a comment active and scroll its anchored spot into the reading area. */
  const jumpToAnnotation = (annotationId: string) => {
    setActiveAnnotationId(annotationId)
    const range = annotationRanges.current.get(annotationId)
    if (!range) return
    const stickyBottom = stickyRef.current?.getBoundingClientRect().bottom ?? 0
    scrollRangeIntoView(range, stickyBottom + 24)
  }

  /** Step through comments in document order (wrapping), scrolling the text along. */
  const stepAnnotation = (dir: 1 | -1) => {
    if (annotationOrder.length === 0) return
    const idx = annotationOrder.indexOf(activeAnnotationId ?? '')
    const next = annotationOrder[(idx + dir + annotationOrder.length) % annotationOrder.length]
    jumpToAnnotation(next)
  }

  /**
   * Open the sheet when a tap lands on a commented passage. Hit-testing uses
   * the resolved Ranges' client rects (with a little slop): no DOM markers
   * exist — the indicator is painted via the CSS Custom Highlight API.
   */
  const handleAnnotationTap = (event: React.MouseEvent) => {
    // Hidden indicators are invisible tap targets — taps must not surprise-
    // open the sheet (the toolbar button still does).
    if (!showAnnotationMarks || pureText) return
    // A drag-selection's trailing click must not open the sheet.
    const sel = document.getSelection()
    if (sel && !sel.isCollapsed) return
    const x = event.clientX
    const y = event.clientY
    const SLOP = 6
    let hit: string | null = null
    annotationRanges.current.forEach((range, aid) => {
      if (hit) return
      for (const rect of Array.from(range.getClientRects())) {
        if (x >= rect.left - SLOP && x <= rect.right + SLOP &&
            y >= rect.top - SLOP && y <= rect.bottom + SLOP) {
          hit = aid
          return
        }
      }
    })
    if (!hit) return
    setActiveAnnotationId(hit)
    setAnnotationsOpen(true)
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
    if (idx >= 0) {
      const stickyBottom = stickyRef.current?.getBoundingClientRect().bottom ?? 0
      scrollRangeIntoView(ranges[idx], stickyBottom + lineHeightOf(ranges[idx]))
    }
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
    const stickyBottom = stickyRef.current?.getBoundingClientRect().bottom ?? 0
    scrollRangeIntoView(ranges[next], stickyBottom + lineHeightOf(ranges[next]))
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

  // Drop any lingering search/comment highlights when leaving the page.
  useEffect(() => clearSearchHighlights, [])
  useEffect(() => clearAnnotationHighlights, [])

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
   * Follow a same-origin `/nugget/<id>?bm=…` deep-link in app: a link to
   * another nugget navigates (the target view resolves `?bm=`), a link within
   * THIS nugget jumps directly — no remount would re-run the load-jump effect.
   * Returns true when the link was handled (caller must preventDefault);
   * external / non-nugget links return false and stay with the browser.
   * Shared by the reading-content click handler and the comment sheet's
   * rendered Markdown bodies.
   */
  const followNuggetLink = useCallback((href: string): boolean => {
    let url: URL
    try { url = new URL(href, window.location.origin) } catch { return false }
    if (url.origin !== window.location.origin) return false

    const match = url.pathname.match(/^\/nugget\/([^/]+)\/?$/)
    if (!match) return false

    const targetId = match[1]
    if (targetId === id) {
      const token = url.searchParams.get('bm')
      const target = token ? decodeAnchorToken(token) : null
      if (target) jumpToAnchor(target)
      return true
    }
    router.push(url.pathname + url.search)
    return true
  }, [id, jumpToAnchor, router])

  /**
   * Intercept clicks on cross-nugget deep-links inside the reading content.
   * Tiptap renders pasted links as plain `<a>` (openOnClick is off), so the DOM
   * click bubbles up here and is routed through followNuggetLink.
   */
  const handleContentClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest('a')
    const href = anchor?.getAttribute('href')
    if (!href) {
      // Not a link — maybe a tap on a commented passage.
      handleAnnotationTap(event)
      return
    }
    if (followNuggetLink(href)) event.preventDefault()
  }

  if (loading) {
    return (
      <div className="pt-3">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Lädt…</p>
      </div>
    )
  }

  if (!nugget) {
    return (
      <div className="pt-3">
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
  // Bible imports carry <sup data-verse> atoms — only they get the verse toggle.
  const hasVerses = nugget.contentHtml.includes('data-verse=')

  // Legend rows: every (style, colour) that occurs in the document or carries a
  // custom name — palette order, highlights first (marks is filled by openMarks).
  const legendRows = [
    ...HIGHLIGHT_PALETTE.map(c => ({ kind: 'hl' as MarkKind, ...c })),
    ...UNDERLINE_PALETTE.map(c => ({ kind: 'ul' as MarkKind, ...c })),
  ].filter(r =>
    marks.some(m => m.kind === r.kind && m.color === r.name) ||
    hasMarkLabel(scheme, r.kind, r.name),
  )
  // Master eye state: every legend row's marking style is currently hidden.
  const allLegendHidden = legendRows.length > 0 &&
    legendRows.every(r => hiddenMarks.includes(markKey(r.kind, r.name)))

  // Sheet order: resolved anchors in document order, orphans behind them, plus
  // any comment so fresh the resolve effect hasn't caught up yet, at the end.
  const orderedAnnotations = [
    ...annotationOrder
      .map(aid => annotations.find(a => a.id === aid))
      .filter((a): a is NuggetAnnotation => a !== undefined),
    ...annotations.filter(a => !annotationOrder.includes(a.id)),
  ]
  const resolvedAnnotationIds = annotationOrder.filter(aid => annotationRanges.current.has(aid))

  return (
    <>
      {/* Sticky action bar — back / info / edit / delete reachable at any
          scroll position, so editing a long nugget never means scrolling up. */}
      <div
        ref={stickyRef}
        className="sticky top-0 z-30 -mx-4 px-4 pt-3 pb-3"
        style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}
      >
        {/* All actions as equal-sized icon buttons in ONE flat row, spread
            evenly across the full bar width (justify-between) — a right-packed
            group left dead space next to the back arrow and made the tight
            targets easy to mistap. gap-0.5 is the minimum spacing so ten
            32px boxes still fit a 375px iPhone. */}
        <div className="flex items-center justify-between gap-0.5">
          <button
            onClick={() => router.back()}
            aria-label="Zurück"
            className={ACTION_BTN}
            style={actionStyle()}
          >
            <ArrowLeft size={16} />
          </button>

          {isOwner && (
            <button
              onClick={addBookmark}
              aria-label="Lesezeichen setzen"
              className={ACTION_BTN}
              style={actionStyle('var(--act-bookmark)', bookmarkSaved)}
            >
              {bookmarkSaved ? <Check size={16} /> : <Bookmark size={16} />}
            </button>
          )}
          <button
            onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
            aria-label="Im Text suchen"
            className={ACTION_BTN}
            style={actionStyle('var(--act-search)', searchOpen)}
          >
            <Search size={16} />
          </button>
          <button
            onClick={openMarks}
            aria-label="Markierungen"
            className={ACTION_BTN}
            style={actionStyle('var(--act-marks)')}
          >
            <Highlighter size={16} />
          </button>
          {(isOwner || annotations.length > 0) && (
            <button
              onClick={() => (annotationsOpen ? closeAnnotations() : openAnnotations())}
              aria-label="Kommentare"
              className={ACTION_BTN}
              style={actionStyle('var(--act-comments)', annotationsOpen)}
            >
              <MessageSquareText size={16} />
            </button>
          )}
          <button
            onClick={() => setViewOpen(o => !o)}
            aria-label="Ansicht: Schriftgröße, Versangaben & Kommentarstellen"
            className={ACTION_BTN}
            style={actionStyle('var(--act-view)', viewOpen)}
          >
            <ALargeSmall size={16} />
          </button>
          {/* Info + PDF stay neutral on purpose — colouring every single icon
              would drown out the meaningful hues. */}
          <button
            onClick={() => setInfoOpen(o => !o)}
            aria-label="Details & Konzepte"
            className={ACTION_BTN}
            style={infoOpen ? actionStyle('var(--accent)', true) : actionStyle()}
          >
            <Info size={16} />
          </button>
          <Link
            href={`/nugget/${nugget.id}/print`}
            aria-label="Als PDF exportieren"
            className={ACTION_BTN}
            style={actionStyle()}
          >
            <Printer size={16} />
          </Link>
          {isOwner && !confirmDelete && (
            <button
              onClick={goEdit}
              aria-label="Bearbeiten"
              className={ACTION_BTN}
              style={actionStyle('var(--accent)')}
            >
              <Pencil size={16} />
            </button>
          )}
          {isOwner && (
            <button
              onClick={handleDelete}
              aria-label={confirmDelete ? 'Wirklich löschen?' : 'Löschen'}
              className={ACTION_BTN}
              style={actionStyle('var(--act-delete)', confirmDelete)}
            >
              <Trash2 size={16} />
            </button>
          )}
          {isOwner && confirmDelete && (
            <button
              onClick={() => setConfirmDelete(false)}
              aria-label="Löschen abbrechen"
              className={ACTION_BTN}
              style={actionStyle()}
            >
              <X size={16} />
            </button>
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
              className="flex items-center justify-center p-1 rounded-lg disabled:opacity-40"
              style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
            >
              <ChevronUp size={16} />
            </button>
            <button
              onClick={() => stepMatch(1)}
              disabled={!matchCount}
              aria-label="Nächster Treffer"
              className="flex items-center justify-center p-1 rounded-lg disabled:opacity-40"
              style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
            >
              <ChevronDown size={16} />
            </button>
            <button
              onClick={closeSearch}
              aria-label="Suche schließen"
              className="flex items-center justify-center p-1 rounded-lg"
              style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* View-settings row — font size (+ verse markers for Bible imports)
            live in the sticky bar so adjusting them never costs the reading
            position; the info panel sits above the content and would. */}
        {viewOpen && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {/* "Nur Text" master switch — completely unannotated reading in one
                tap. While on, the individual visibility toggles below (and the
                legend eyes in the marks popup) are dimmed: the master wins. */}
            <button
              type="button"
              onClick={togglePureText}
              className="text-xs px-2.5 py-1.5 rounded-lg transition-all"
              style={{
                background: pureText ? 'var(--accent)' : 'transparent',
                color:      pureText ? 'white'         : 'var(--muted)',
                border: `1px solid ${pureText ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              Nur Text {pureText ? 'an' : 'aus'}
            </button>
            <button
              onClick={() => changeFontSize(-FONT_SIZE_STEP)}
              disabled={fontSize <= MIN_FONT_SIZE}
              aria-label="Schrift verkleinern"
              className="flex items-center justify-center w-8 h-8 rounded-lg disabled:opacity-40"
              style={{ color: 'var(--ink)', border: '1px solid var(--border)', fontSize: '12px' }}
            >
              A
            </button>
            <span className="text-xs tabular-nums w-10 text-center" style={{ color: 'var(--ink)' }}>
              {fontSize} px
            </span>
            <button
              onClick={() => changeFontSize(FONT_SIZE_STEP)}
              disabled={fontSize >= MAX_FONT_SIZE}
              aria-label="Schrift vergrößern"
              className="flex items-center justify-center w-8 h-8 rounded-lg disabled:opacity-40"
              style={{ color: 'var(--ink)', border: '1px solid var(--border)', fontSize: '17px' }}
            >
              A
            </button>
            <button
              onClick={resetFontSize}
              disabled={fontSize === DEFAULT_FONT_SIZE}
              className="text-xs px-2.5 py-1.5 rounded-lg disabled:opacity-40"
              style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
            >
              Zurücksetzen
            </button>
            {hasVerses && (
              <button
                type="button"
                onClick={toggleVerses}
                disabled={pureText}
                className="text-xs px-2.5 py-1.5 rounded-lg ml-auto transition-all disabled:opacity-40"
                style={{
                  background: showVerses ? 'var(--accent)' : 'transparent',
                  color:      showVerses ? 'white'         : 'var(--muted)',
                  border: `1px solid ${showVerses ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                Versangaben {showVerses ? 'an' : 'aus'}
              </button>
            )}
            {annotations.length > 0 && (
              <button
                type="button"
                onClick={toggleAnnotationMarks}
                disabled={pureText}
                className={`text-xs px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-40${hasVerses ? '' : ' ml-auto'}`}
                style={{
                  background: showAnnotationMarks ? 'var(--accent)' : 'transparent',
                  color:      showAnnotationMarks ? 'white'         : 'var(--muted)',
                  border: `1px solid ${showAnnotationMarks ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                Kommentarstellen {showAnnotationMarks ? 'an' : 'aus'}
              </button>
            )}
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
            </div>

            {/* Reading font size — scopes to nugget text only (--nugget-font-size). */}
            <div>
              <h2 className="text-xs tracking-widest uppercase mb-2" style={{ color: 'var(--muted)' }}>
                Schriftgröße
              </h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => changeFontSize(-FONT_SIZE_STEP)}
                  disabled={fontSize <= MIN_FONT_SIZE}
                  aria-label="Schrift verkleinern"
                  className="flex items-center justify-center w-9 h-9 rounded-lg disabled:opacity-40"
                  style={{ color: 'var(--ink)', border: '1px solid var(--border)', fontSize: '13px' }}
                >
                  A
                </button>
                <span className="text-sm tabular-nums w-12 text-center" style={{ color: 'var(--ink)' }}>
                  {fontSize} px
                </span>
                <button
                  onClick={() => changeFontSize(FONT_SIZE_STEP)}
                  disabled={fontSize >= MAX_FONT_SIZE}
                  aria-label="Schrift vergrößern"
                  className="flex items-center justify-center w-9 h-9 rounded-lg disabled:opacity-40"
                  style={{ color: 'var(--ink)', border: '1px solid var(--border)', fontSize: '20px' }}
                >
                  A
                </button>
                <button
                  onClick={resetFontSize}
                  disabled={fontSize === DEFAULT_FONT_SIZE}
                  className="text-xs px-2.5 py-1 rounded-lg disabled:opacity-40 ml-auto"
                  style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
                >
                  Zurücksetzen
                </button>
              </div>
            </div>

            {/* Bible verse markers toggle — only for nuggets that contain
                <sup data-verse> atoms (Bible imports). Same state as the
                sticky-bar view row; persisted per nugget in sessionStorage. */}
            {hasVerses && (
              <div>
                <h2 className="text-xs tracking-widest uppercase mb-2" style={{ color: 'var(--muted)' }}>
                  Versangaben
                </h2>
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: 'var(--ink)' }}>
                    Kapitel.Vers im Text anzeigen
                  </span>
                  <button
                    type="button"
                    onClick={toggleVerses}
                    disabled={pureText}
                    className="text-xs px-3 py-1 rounded-lg transition-all disabled:opacity-40"
                    style={{
                      background: showVerses ? 'var(--accent)' : 'transparent',
                      color:      showVerses ? 'white'         : 'var(--muted)',
                      border: `1px solid ${showVerses ? 'var(--accent)' : 'var(--border)'}`,
                    }}
                  >
                    {showVerses ? 'An' : 'Aus'}
                  </button>
                </div>
              </div>
            )}

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
      <div
        ref={contentRef}
        onClick={handleContentClick}
        // Verse markers are hidden by default (scroll-style reading); hidden
        // marking styles map to .mark-hidden-<kind>-<colour> classes (rules in
        // globals.css). "Nur Text" overrides both: it forces verses-hidden and
        // blankets ALL marking styles via marks-hidden-all, without touching
        // the individual settings. The edit view never gets these classes, so
        // markers and markings stay visible while editing.
        className={[
          showVerses && !pureText ? '' : 'verses-hidden',
          pureText ? 'marks-hidden-all' : '',
          ...hiddenMarks.map(k => `mark-hidden-${k.replace(':', '-')}`),
        ].filter(Boolean).join(' ') || undefined}
      >
        <NuggetReader
          key={nugget.id}
          id={nugget.id}
          contentHtml={nugget.contentHtml}
          markScheme={scheme}
          onComment={isOwner ? addAnnotation : undefined}
          onExternalLink={copyExternalLink}
          externalLinkCopied={externalLinkCopied}
        />
      </div>

      {/* Floating jump-to-end / jump-back button (keyed like the reader so a
          same-segment hop to another nugget resets any pending return jump). */}
      <ScrollJumpButton key={`jump-${nugget.id}`} />

      {/* Margin comments — bottom half sheet, no backdrop: the text above
          stays scrollable, and scrolling switches the active comment. */}
      {annotationsOpen && (
        <AnnotationSheet
          annotations={orderedAnnotations}
          resolvedIds={resolvedAnnotationIds}
          activeId={activeAnnotationId}
          isOwner={isOwner}
          onStep={stepAnnotation}
          onJump={jumpToAnnotation}
          onChangeBody={updateAnnotationBody}
          onFlush={flushAnnotationSave}
          onDelete={deleteAnnotation}
          onClose={closeAnnotations}
          onNuggetLink={followNuggetLink}
        />
      )}

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
            className="w-full max-w-xl rounded-2xl overflow-hidden flex flex-col"
            style={{ background: 'var(--surface)', maxHeight: '80vh', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}
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
              {/* Legend — name what each used (style, colour) means in THIS
                  nugget. Inputs are uncontrolled (committed on blur/Enter);
                  the popup remounts them fresh each time it opens. */}
              {(legendRows.length > 0 || isOwner) && (
                <div className="flex flex-col gap-1.5 pb-2 mb-1" style={{ borderBottom: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs tracking-widest uppercase flex-1" style={{ color: 'var(--muted)' }}>
                      Legende
                    </h3>
                    {/* Master visibility toggle — hide/show ALL marking styles
                        at once (viewing preference, available to any reader).
                        Disabled while "Nur Text" hides everything anyway. */}
                    {legendRows.length > 0 && (
                      <button
                        onClick={() => setAllMarksHidden(
                          !allLegendHidden,
                          legendRows.map(r => markKey(r.kind, r.name)),
                        )}
                        disabled={pureText}
                        aria-label={allLegendHidden ? 'Alle Markierungen einblenden' : 'Alle Markierungen ausblenden'}
                        title={pureText ? '„Nur Text" ist aktiv' : allLegendHidden ? 'Alle einblenden' : 'Alle ausblenden'}
                        className="flex items-center justify-center p-1.5 rounded-lg flex-shrink-0 disabled:opacity-40"
                        style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
                      >
                        {allLegendHidden ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    )}
                    {/* Scheme import — copy another nugget's colour meanings here. */}
                    {isOwner && (
                      <button
                        onClick={openImport}
                        className="text-xs px-2.5 py-1 rounded-full flex-shrink-0"
                        style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}
                      >
                        Übernehmen von …
                      </button>
                    )}
                  </div>
                  {legendRows.map(r => {
                    const rowHidden = hiddenMarks.includes(markKey(r.kind, r.name))
                    return (
                    <div
                      key={markKey(r.kind, r.name)}
                      className="flex items-center gap-2.5"
                      // Dim the whole row while its marking style is hidden.
                      style={{ opacity: rowHidden ? 0.45 : 1 }}
                    >
                      <span
                        className="flex-shrink-0"
                        style={r.kind === 'hl'
                          ? {
                              width: 20, height: 20, borderRadius: '50%',
                              background: markColorVar('hl', r.name),
                              border: '1px solid rgba(0,0,0,0.18)',
                            }
                          : {
                              width: 20, height: 20, borderRadius: 6,
                              background: 'var(--surface)',
                              border: '1px solid rgba(0,0,0,0.18)',
                              boxShadow: `inset 0 -5px 0 ${markColorVar('ul', r.name)}`,
                            }}
                      />
                      {isOwner ? (
                        <input
                          // Value in the key: uncontrolled inputs must remount when
                          // the scheme changes underneath them (import, rename).
                          key={`${markKey(r.kind, r.name)}=${scheme[markKey(r.kind, r.name)] ?? ''}`}
                          defaultValue={scheme[markKey(r.kind, r.name)] ?? ''}
                          placeholder={r.label}
                          maxLength={MARK_LABEL_MAX}
                          onBlur={e => commitMarkLabel(r.kind, r.name, e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                          className="flex-1 min-w-0 text-sm px-2.5 py-1.5 rounded-lg outline-none"
                          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink)' }}
                        />
                      ) : (
                        <span className="flex-1 min-w-0 text-sm" style={{ color: 'var(--ink)' }}>
                          {markLabel(scheme, r.kind, r.name)}
                        </span>
                      )}
                      {/* Per-style visibility toggle (eye = shown, slashed = hidden).
                          Disabled while "Nur Text" hides everything anyway. */}
                      <button
                        onClick={() => toggleMarkHidden(r.kind, r.name)}
                        disabled={pureText}
                        aria-pressed={rowHidden}
                        aria-label={rowHidden ? 'Markierung einblenden' : 'Markierung ausblenden'}
                        title={pureText ? '„Nur Text" ist aktiv' : rowHidden ? 'Einblenden' : 'Ausblenden'}
                        className="flex items-center justify-center p-1.5 rounded-lg flex-shrink-0 disabled:opacity-40"
                        style={{ color: 'var(--muted)' }}
                      >
                        {rowHidden ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                    )
                  })}
                </div>
              )}

              {marks.length === 0 ? (
                <p className="text-sm text-center py-6" style={{ color: 'var(--muted)' }}>
                  Keine Markierungen in diesem Nugget.
                </p>
              ) : (
                marks.map((m, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-1 rounded-lg flex-shrink-0 overflow-hidden"
                    // Row look mirrors the marking style: highlights get their
                    // background wash, underlines a neutral fill with the text
                    // carrying the thick coloured line. Dimmed while the style
                    // is hidden in the text (jump still works).
                    style={{
                      background: m.kind === 'hl' ? markColorVar('hl', m.color) : 'var(--warm)',
                      opacity: hiddenMarks.includes(markKey(m.kind, m.color)) ? 0.45 : 1,
                    }}
                  >
                    <button
                      onClick={() => scrollToMark(m.markIndex)}
                      className="flex-1 min-w-0 text-left text-sm px-3 py-2 transition-all active:scale-[0.99]"
                      style={{ color: 'var(--ink)' }}
                    >
                      {/* Custom colour meaning, when this nugget has named the colour. */}
                      {hasMarkLabel(scheme, m.kind, m.color) && (
                        <span
                          className="block text-[10px] tracking-wide uppercase mb-0.5"
                          style={{ color: 'var(--muted)' }}
                        >
                          {markLabel(scheme, m.kind, m.color)}
                        </span>
                      )}
                      {/* Underline rows carry the thick coloured line on the text
                          itself (not the row background) — keep line-clamp here. */}
                      <span
                        className="block line-clamp-2 break-words"
                        style={m.kind === 'ul' ? {
                          textDecoration: 'underline',
                          textDecorationThickness: '0.18em',
                          textDecorationColor: markColorVar('ul', m.color),
                          textUnderlineOffset: '0.14em',
                          textDecorationSkipInk: 'none',
                        } : undefined}
                      >
                        {m.text || '—'}
                      </span>
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

      {/* Scheme-import dialog — pick a source nugget with named colours, then
          (only if THIS nugget already has names) choose replace vs. merge.
          Metadata copy only: contentHtml is never touched. Sits above the
          marks popup so the legend stays visible behind it. */}
      {importOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(28,28,30,0.4)' }}
          onClick={() => setImportOpen(false)}
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
                Schema übernehmen
              </h2>
              <button onClick={() => setImportOpen(false)} aria-label="Schließen" style={{ color: 'var(--muted)' }}>
                <X size={18} />
              </button>
            </div>

            <div
              className="overflow-y-auto px-3 py-3 flex flex-col gap-2"
              style={{ overscrollBehavior: 'contain' }}
            >
              {importSource ? (
                /* Local names exist — resolve the conflict: replace or fill gaps. */
                <>
                  <p className="text-sm" style={{ color: 'var(--ink)' }}>
                    Dieses Nugget hat bereits benannte Farben. Wie soll das Schema von
                    „{importSource.title}“ übernommen werden?
                  </p>
                  <button
                    onClick={() => applyImport(importSource.scheme)}
                    className="text-left text-sm px-3 py-2.5 rounded-lg transition-all active:scale-[0.99]"
                    style={{ background: 'var(--accent)', color: 'white' }}
                  >
                    Ersetzen — Schema des Quell-Nuggets 1:1 übernehmen
                  </button>
                  <button
                    // Merge: local names win; the source only fills unnamed colours.
                    onClick={() => applyImport({ ...importSource.scheme, ...scheme })}
                    className="text-left text-sm px-3 py-2.5 rounded-lg transition-all active:scale-[0.99]"
                    style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}
                  >
                    Ergänzen — nur Farben ohne eigenen Namen füllen
                  </button>
                  <button
                    onClick={() => setImportSource(null)}
                    className="text-sm px-3 py-2 rounded-lg"
                    style={{ color: 'var(--muted)' }}
                  >
                    ← Zurück zur Auswahl
                  </button>
                </>
              ) : importSources === null ? (
                <p className="text-sm text-center py-6" style={{ color: 'var(--muted)' }}>
                  Lädt…
                </p>
              ) : importSources.length === 0 ? (
                <p className="text-sm text-center py-6" style={{ color: 'var(--muted)' }}>
                  Kein anderes Nugget hat benannte Farben.
                </p>
              ) : (
                importSources.map(src => (
                  <button
                    key={src.id}
                    onClick={() => pickImportSource(src)}
                    className="text-left px-3 py-2.5 rounded-lg flex flex-col gap-1.5 transition-all active:scale-[0.99]"
                    style={{ background: 'var(--warm)' }}
                  >
                    <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                      {src.title}
                    </span>
                    {/* Mini preview: every named colour as swatch + name. */}
                    <span className="flex flex-wrap gap-x-3 gap-y-1">
                      {Object.entries(src.scheme).map(([key, label]) => {
                        const [kind, color] = key.split(':') as [MarkKind, string]
                        return (
                          <span
                            key={key}
                            className="inline-flex items-center gap-1.5 text-xs"
                            style={{ color: 'var(--muted)' }}
                          >
                            <span
                              className="flex-shrink-0"
                              style={kind === 'hl'
                                ? {
                                    width: 12, height: 12, borderRadius: '50%',
                                    background: markColorVar('hl', color),
                                    border: '1px solid rgba(0,0,0,0.18)',
                                  }
                                : {
                                    width: 12, height: 12, borderRadius: 4,
                                    background: 'var(--surface)',
                                    border: '1px solid rgba(0,0,0,0.18)',
                                    boxShadow: `inset 0 -3px 0 ${markColorVar('ul', color)}`,
                                  }}
                            />
                            {label}
                          </span>
                        )
                      })}
                    </span>
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
