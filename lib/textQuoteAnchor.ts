import type { AnchorToken } from './bookmarkLink'

/**
 * Client-only DOM text-quote-anchor machinery, extracted from
 * app/nugget/[id]/page.tsx so it can be shared between the main reading view
 * and the Peek-Tab reader (Spinnennetz Stufe 2 — see the plan). Kept
 * separate from lib/textAnchor.ts, which runs SERVER-SIDE for LLM-quote
 * verification against plain strings, no live document — this module needs
 * a real DOM (Range, TreeWalker, getComputedStyle) and must never be
 * imported by server code.
 */

/** How many characters of context to keep on each side of a quote. */
export const ANCHOR_CONTEXT_LEN = 30
/** Cap on the text sampled for a "Naheliegendes" query — generous since it feeds a similarity search, not a UI label. */
export const NEARBY_QUERY_LEN = 1000

/** Collapse any run of whitespace to a single space. */
export function squashWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ')
}

/** Every occurrence of `query` (case-insensitive) within `root`, one Range per match, in document order. */
export function findRanges(root: HTMLElement, query: string): Range[] {
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
 * Re-locate a text-quote anchor in the rendered content. Finds every
 * occurrence of the quote, then — when several exist — picks the one whose
 * surrounding text best matches the stored prefix/suffix, so duplicate lines
 * resolve to the right spot.
 */
export function resolveAnchor(root: HTMLElement, quote: string, prefix: string, suffix: string): Range | null {
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

/**
 * Build a text-quote anchor from an arbitrary DOM Range within the reading
 * content — the selection-based counterpart to a mark/bookmark anchor.
 * Clamped to the range's start text node (findRanges/resolveAnchor only match
 * within a single text node), so a selection spanning several paragraphs
 * anchors at its start. Returns null when the range holds no text.
 */
export function buildRangeAnchor(root: HTMLElement, sel: Range): AnchorToken | null {
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

/**
 * The full selected text across every node the range spans — the query text
 * for "Naheliegendes" (Spinnennetz). Deliberately NOT buildRangeAnchor's
 * `quote`, which is clamped to the range's first text node only (correct for
 * a jump-back anchor, wrong for a multi-paragraph search query).
 */
export function buildSelectionQueryText(sel: Range, maxLen: number = NEARBY_QUERY_LEN): string {
  return squashWhitespace(sel.toString()).trim().slice(0, maxLen)
}

/**
 * Smooth-scroll a range into view. By default it lands roughly at the
 * vertical centre; pass `topOffset` (a viewport-relative y in px) to instead
 * align the range's top edge to that offset — used e.g. so a bookmark jump
 * reappears just below the sticky bar, exactly where it was when captured.
 */
export function scrollRangeIntoView(range: Range, topOffset?: number): void {
  const rect = range.getBoundingClientRect()
  if (rect.height === 0 && rect.width === 0) return
  const anchor = topOffset ?? window.innerHeight / 2
  const top = window.scrollY + rect.top - anchor
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
}

// --- "Naheliegendes" source-passage highlight (Spinnennetz Stufe 2) --------
// A single named CSS Custom Highlight (styled in app/layout.tsx's inline
// <style>, teal/wavy — never mistaken for a real markierung) marking the
// passage a currently-open Naheliegendes search was triggered from, so
// returning to Haupt (or a Peek-Tab) after a scroll shows exactly what's
// being referenced, not just "some highlighted text I forgot about". A small,
// self-contained duplicate of app/nugget/[id]/page.tsx's own (module-private)
// `highlightRegistry()` accessor — that file already has five of these
// (search-all/current, annotation, annotation-active) and pulling all of them
// out into this module is a larger refactor than this one new highlight needs.

const NEARBY_SOURCE_HIGHLIGHT_NAME = 'nearby-source'

/** The CSS Custom Highlight registry, or null where unsupported (e.g. old iOS). */
function highlightRegistry(): Map<string, unknown> | null {
  return typeof CSS !== 'undefined' && 'highlights' in CSS
    ? (CSS as unknown as { highlights: Map<string, unknown> }).highlights
    : null
}

/**
 * Paints (or, given null, clears) the source-passage highlight. Callers pass
 * null whenever the currently-shown nugget isn't the search's source, or no
 * search is open — see components/useNearbySourceHighlight.ts, the shared
 * hook both the main reading view and Peek-Tabs use to drive this.
 */
export function setNearbySourceHighlight(range: Range | null): void {
  const reg = highlightRegistry()
  const HighlightCtor = (globalThis as unknown as { Highlight?: new (...r: Range[]) => { priority: number } }).Highlight
  if (!reg || !HighlightCtor) return
  reg.delete(NEARBY_SOURCE_HIGHLIGHT_NAME)
  if (!range) return
  const highlight = new HighlightCtor(range)
  highlight.priority = 1
  reg.set(NEARBY_SOURCE_HIGHLIGHT_NAME, highlight)
}
