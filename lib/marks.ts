import { JSDOM } from 'jsdom'
import { prisma } from '@/lib/prisma'
import { fallbackTitle } from '@/lib/content'
import {
  type MarkKind,
  type MarkScheme,
  HIGHLIGHT_PALETTE,
  UNDERLINE_PALETTE,
  markKey,
  markLabel,
  hasMarkLabel,
  parseMarkScheme,
  markDimension,
} from '@/lib/marking'
import type { AnchorToken } from '@/lib/bookmarkLink'

// Server-side counterpart to the client-only `openMarks()`/`anchorForMark()` in
// app/nugget/[id]/page.tsx — extracts highlight/underline marks straight out of
// a nugget's `contentHtml` string (via jsdom) instead of the rendered DOM, so
// marks can be aggregated across many nuggets at once ("Denkspuren"). Mirrors
// that file's merge/anchor algorithms exactly so the two stay in agreement.

/** Same selector as app/nugget/[id]/page.tsx — a plain <u> without data-color is not a marking. */
const MARK_SELECTOR = 'mark, u[data-color]'
/** Duplicated from app/nugget/[id]/page.tsx rather than hoisted — not worth editing that file for. */
const ANCHOR_CONTEXT_LEN = 30
/** Caps a single (merged) mark's text so one runaway highlight can't bloat the payload. */
const MARK_TEXT_MAX = 400
/** Mirrors the take:500 valve in app/api/nuggets/route.ts. */
const MAX_NUGGETS = 500
/** Response-payload safety valve across all scanned nuggets. */
const MAX_MARKS = 2000

/** Collapse any run of whitespace to a single space (mirrors the reading view's squashWhitespace). */
function squashWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ')
}

/**
 * The document's plain text plus, per marking element, where its text starts and
 * ends within that string. Built in ONE walk so anchors and the merge test can
 * be answered by slicing instead of by serializing DOM ranges.
 *
 * Why this exists: the obvious implementation asks jsdom for a Range from the
 * document start to each mark and calls `toString()`. That serializes the WHOLE
 * document once per marking — O(marks x document) — which measured 37 s for one
 * real domain (45 nuggets, 1.4 MB of HTML, single documents up to 10.5 s). The
 * offsets below make it a single linear pass.
 */
interface TextIndex {
  /** Concatenated text of every text node, in document order — what Range.toString() would yield. */
  full: string
  /** Element -> [startOffset, endOffset) within `full`. */
  bounds: Map<Element, [number, number]>
}

function buildTextIndex(root: Element, marks: Element[]): TextIndex {
  const wanted = new Set(marks)
  const bounds = new Map<Element, [number, number]>()
  const parts: string[] = []
  let offset = 0

  // Iterative walk (a deeply nested document must not blow the stack).
  const walk = (node: Node) => {
    if (node.nodeType === 3 /* TEXT_NODE */) {
      const text = node.nodeValue ?? ''
      parts.push(text)
      offset += text.length
      return
    }
    const isMark = node.nodeType === 1 && wanted.has(node as Element)
    const start = offset
    for (let child = node.firstChild; child; child = child.nextSibling) walk(child)
    // Recorded on the way out so nested markings (an hl and a ul over the same
    // text nest in the HTML) each get their own true span.
    if (isMark) bounds.set(node as Element, [start, offset])
  }
  walk(root)

  return { full: parts.join(''), bounds }
}

/**
 * Last `len` characters of `raw` after whitespace-squashing, without squashing
 * all of `raw`.
 *
 * Exactness: squashing only ever removes characters, and slicing a window off
 * the FRONT can only disturb the front of the result (a run of whitespace cut in
 * half yields one leading space either way). So once a window squashes to more
 * than `len` characters, its last `len` are identical to squashing the whole
 * string and taking the last `len`. The loop widens until that holds.
 */
function squashedTail(raw: string, len: number): string {
  let window = Math.min(raw.length, len * 8)
  for (;;) {
    const squashed = squashWhitespace(raw.slice(raw.length - window))
    if (squashed.length > len || window >= raw.length) return squashed.slice(-len)
    window = Math.min(raw.length, window * 4)
  }
}

/** First `len` characters after squashing — the mirror image of squashedTail. */
function squashedHead(raw: string, len: number): string {
  let window = Math.min(raw.length, len * 8)
  for (;;) {
    const squashed = squashWhitespace(raw.slice(0, window))
    if (squashed.length > len || window >= raw.length) return squashed.slice(0, len)
    window = Math.min(raw.length, window * 4)
  }
}

/** One extracted, merged marking within a single nugget's contentHtml. */
export interface ExtractedMark {
  kind: MarkKind
  color: string
  key: string
  text: string
  order: number
  anchor: AnchorToken
  truncated: boolean
}

/**
 * Walks a nugget's `contentHtml` and returns every highlight/underline marking,
 * merging consecutive same-kind/same-colour elements that ProseMirror split
 * across paragraph boundaries (a direct port of `openMarks()`'s merge pass,
 * app/nugget/[id]/page.tsx:1017-1046, but over a jsdom-parsed string instead of
 * the live DOM). Never throws — malformed HTML degrades to an empty result,
 * the same tolerance philosophy as `parseMarkScheme`.
 */
export function extractMarks(contentHtml: string): ExtractedMark[] {
  try {
    const dom = new JSDOM(contentHtml)
    const document = dom.window.document
    const root = document.body
    const nodes = Array.from(root.querySelectorAll(MARK_SELECTOR))
    // Offsets for every marking, computed once; the merge test and the anchor
    // context below are then plain string slices rather than DOM range walks.
    const index = buildTextIndex(root, nodes)

    interface Group { text: string; color: string; kind: MarkKind; firstEl: Element; lastEl: Element }
    const groups: Group[] = []

    for (const el of nodes) {
      const kind: MarkKind = el.tagName === 'MARK' ? 'hl' : 'ul'
      const color = el.getAttribute('data-color') ?? 'yellow'
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
      const prev = groups[groups.length - 1]

      let contiguous = false
      if (prev && prev.color === color && prev.kind === kind) {
        // Same question as before ("is there only whitespace between them?"),
        // answered from the offset index instead of a serialized Range.
        const prevEnd = index.bounds.get(prev.lastEl)?.[1]
        const elStart = index.bounds.get(el)?.[0]
        if (prevEnd !== undefined && elStart !== undefined) {
          contiguous = index.full.slice(prevEnd, elStart).replace(/\s+/g, '') === ''
        }
      }

      if (prev && contiguous) {
        prev.text = `${prev.text} ${text}`.trim()
        prev.lastEl = el
      } else {
        groups.push({ text, color, kind, firstEl: el, lastEl: el })
      }
    }

    const marks: ExtractedMark[] = []
    let order = 0
    for (const group of groups) {
      if (!group.text) continue

      // Anchor is built from the FIRST element only, not the merged text — a
      // merged multi-paragraph quote spans several text nodes and would never
      // resolve later anyway, since findRanges/resolveAnchor only match within
      // a single text node (documented limitation; falls back to "jump to top").
      const [start, end] = index.bounds.get(group.firstEl) ?? [0, 0]
      const anchor: AnchorToken = {
        quote: squashWhitespace(group.firstEl.textContent ?? '').trim(),
        prefix: squashedTail(index.full.slice(0, start), ANCHOR_CONTEXT_LEN),
        suffix: squashedHead(index.full.slice(end), ANCHOR_CONTEXT_LEN),
      }

      const truncated = group.text.length > MARK_TEXT_MAX
      const text = truncated ? group.text.slice(0, MARK_TEXT_MAX - 1) + '…' : group.text

      marks.push({ kind: group.kind, color: group.color, key: markKey(group.kind, group.color), text, order, anchor, truncated })
      order += 1
    }

    return marks
  } catch {
    return []
  }
}

/** One nugget's fields needed to extract and label its marks. */
export interface NuggetMarkSource {
  id: string
  title: string
  contentHtml: string
  markScheme: string | null
}

/** An extracted mark, decorated with its owning nugget and resolved label. */
export interface DomainMark extends ExtractedMark {
  id: string
  nuggetId: string
  nuggetTitle: string
  label: string
  hasCustomLabel: boolean
  /** The colour's fixed semantic dimension ("Kern", "Grund", …) — see lib/marking.ts. */
  dimension: string
}

/** A (kind, colour) bucket — the primary facet (see lib/marks.ts's facet-nuance doc below). */
export interface MarkFacet {
  key: string
  kind: MarkKind
  color: string
  /** Whether `color` exists in the built-in palette (unknown/legacy colours sort last, muted). */
  known: boolean
  count: number
  nuggetCount: number
  defaultLabel: string
  labels: { label: string; count: number; custom: boolean }[]
  /** True when >=2 DISTINCT custom labels name this same (kind,colour) slot across the domain. */
  diverging: boolean
}

/** A cross-colour bucket keyed by normalized label — where cross-nugget meaning emerges. */
export interface MeaningFacet {
  slug: string
  label: string
  count: number
  nuggetCount: number
  keys: string[]
  custom: boolean
}

/**
 * A bucket per semantic dimension — the colour's fixed meaning, merging a hue's
 * highlight and underline (statement level + language level of the same idea).
 *
 * This is the only bucketing that is BOTH meaningful and total: unlike
 * `meanings` it needs no per-nugget scheme, and unlike `facets` it says
 * something. It works because the dimension is a property of the COLOUR
 * (MARK_DIMENSIONS in lib/marking.ts), not of any applied template.
 */
export interface DimensionFacet {
  /** The dimension's colour, e.g. "yellow" — also the bucket key. */
  color: string
  /** Dimension name, e.g. "Kern". */
  name: string
  count: number
  nuggetCount: number
  /** The (kind, colour) keys that fed this bucket, e.g. ["hl:yellow", "ul:yellow"]. */
  keys: string[]
}

export interface DomainMarks {
  domain: { id: string; name: string; slug: string; icon: string | null; color: string | null } | null
  marks: DomainMark[]
  facets: MarkFacet[]
  meanings: MeaningFacet[]
  dimensions: DimensionFacet[]
  stats: { nuggetsScanned: number; nuggetsWithMarks: number; totalMarks: number; truncated: boolean }
}

/** Palette order index for a (kind,colour) — unknown colours sort after all known ones. */
function paletteIndex(kind: MarkKind, color: string): number {
  const palette = kind === 'hl' ? HIGHLIGHT_PALETTE : UNDERLINE_PALETTE
  const idx = palette.findIndex(c => c.name === color)
  return idx === -1 ? palette.length : idx
}

function isKnownColor(kind: MarkKind, color: string): boolean {
  const palette = kind === 'hl' ? HIGHLIGHT_PALETTE : UNDERLINE_PALETTE
  return palette.some(c => c.name === color)
}

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Pure aggregation over a batch of nuggets: extracts marks, resolves labels via
 * each nugget's own `markScheme`, then groups into the two facet views described
 * in the Denkspuren plan.
 *
 * Facet nuance: `markScheme` is per-nugget and sparse, so there is no global
 * colour->meaning mapping. `key` (kind+colour) is the PRIMARY bucket — the only
 * total function over a mark, needing zero configuration — while the resolved
 * `label` is a SECONDARY, derived facet (`meanings`) that degrades gracefully
 * (via markLabel's own palette fallback) when a nugget has no custom scheme.
 */
export function collectDomainMarks(sources: NuggetMarkSource[]): Omit<DomainMarks, 'domain'> {
  const marks: DomainMark[] = []
  let truncated = false
  let nuggetsWithMarks = 0

  outer: for (const source of sources) {
    const scheme: MarkScheme = parseMarkScheme(source.markScheme)
    const extracted = extractMarks(source.contentHtml)
    if (extracted.length > 0) nuggetsWithMarks += 1
    const nuggetTitle = source.title || fallbackTitle(source.contentHtml)

    for (const mark of extracted) {
      if (marks.length >= MAX_MARKS) {
        truncated = true
        break outer
      }
      marks.push({
        ...mark,
        id: `${source.id}:${mark.order}`,
        nuggetId: source.id,
        nuggetTitle,
        label: markLabel(scheme, mark.kind, mark.color),
        hasCustomLabel: hasMarkLabel(scheme, mark.kind, mark.color),
        dimension: markDimension(mark.color).name,
      })
    }
  }

  // --- facets: bucket by (kind, colour) ---------------------------------------
  const facetMap = new Map<string, { kind: MarkKind; color: string; nuggetIds: Set<string>; labels: Map<string, { count: number; custom: boolean }> }>()
  for (const mark of marks) {
    let bucket = facetMap.get(mark.key)
    if (!bucket) {
      bucket = { kind: mark.kind, color: mark.color, nuggetIds: new Set(), labels: new Map() }
      facetMap.set(mark.key, bucket)
    }
    bucket.nuggetIds.add(mark.nuggetId)
    const entry = bucket.labels.get(mark.label) ?? { count: 0, custom: mark.hasCustomLabel }
    entry.count += 1
    bucket.labels.set(mark.label, entry)
  }

  const facets: MarkFacet[] = Array.from(facetMap.entries()).map(([key, bucket]) => {
    const labels = Array.from(bucket.labels.entries()).map(([label, v]) => ({ label, count: v.count, custom: v.custom }))
    const palette = bucket.kind === 'hl' ? HIGHLIGHT_PALETTE : UNDERLINE_PALETTE
    const known = isKnownColor(bucket.kind, bucket.color)
    const defaultLabel = palette.find(c => c.name === bucket.color)?.label ?? bucket.color
    const customLabelCount = labels.filter(l => l.custom).length
    return {
      key,
      kind: bucket.kind,
      color: bucket.color,
      known,
      count: labels.reduce((sum, l) => sum + l.count, 0),
      nuggetCount: bucket.nuggetIds.size,
      defaultLabel,
      labels: labels.sort((a, b) => b.count - a.count),
      diverging: customLabelCount >= 2,
    }
  })
  facets.sort((a, b) => {
    if (a.known !== b.known) return a.known ? -1 : 1
    if (a.kind !== b.kind) return a.kind === 'hl' ? -1 : 1
    return paletteIndex(a.kind, a.color) - paletteIndex(b.kind, b.color)
  })

  // --- meanings: bucket by normalized label, across colours -------------------
  const meaningMap = new Map<string, { label: string; labelCounts: Map<string, number>; nuggetIds: Set<string>; keys: Set<string>; custom: boolean }>()
  for (const mark of marks) {
    const slug = normalizeLabel(mark.label)
    let bucket = meaningMap.get(slug)
    if (!bucket) {
      bucket = { label: mark.label, labelCounts: new Map(), nuggetIds: new Set(), keys: new Set(), custom: false }
      meaningMap.set(slug, bucket)
    }
    bucket.labelCounts.set(mark.label, (bucket.labelCounts.get(mark.label) ?? 0) + 1)
    bucket.nuggetIds.add(mark.nuggetId)
    bucket.keys.add(mark.key)
    if (mark.hasCustomLabel) bucket.custom = true
  }

  const meanings: MeaningFacet[] = Array.from(meaningMap.entries()).map(([slug, bucket]) => {
    // Display form = the most frequent original casing for this meaning.
    const displayLabel = Array.from(bucket.labelCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? bucket.label
    const count = Array.from(bucket.labelCounts.values()).reduce((sum, n) => sum + n, 0)
    return {
      slug,
      label: displayLabel,
      count,
      nuggetCount: bucket.nuggetIds.size,
      keys: Array.from(bucket.keys),
      custom: bucket.custom,
    }
  })
  meanings.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))

  // --- dimensions: bucket by colour, merging highlight + underline ------------
  const dimensionMap = new Map<string, { nuggetIds: Set<string>; keys: Set<string>; count: number }>()
  for (const mark of marks) {
    let bucket = dimensionMap.get(mark.color)
    if (!bucket) {
      bucket = { nuggetIds: new Set(), keys: new Set(), count: 0 }
      dimensionMap.set(mark.color, bucket)
    }
    bucket.count += 1
    bucket.nuggetIds.add(mark.nuggetId)
    bucket.keys.add(mark.key)
  }

  const dimensions: DimensionFacet[] = Array.from(dimensionMap.entries()).map(([color, bucket]) => ({
    color,
    name: markDimension(color).name,
    count: bucket.count,
    nuggetCount: bucket.nuggetIds.size,
    keys: Array.from(bucket.keys),
  }))
  // Palette order, not by count: the dimension bar must read in the same order
  // as the swatch rows the reader already knows.
  dimensions.sort((a, b) => paletteIndex('hl', a.color) - paletteIndex('hl', b.color))

  return {
    marks,
    facets,
    meanings,
    dimensions,
    stats: {
      nuggetsScanned: sources.length,
      nuggetsWithMarks,
      totalMarks: marks.length,
      truncated,
    },
  }
}

/**
 * Loads and aggregates every marking for a domain (or every domain when
 * `domainSlug` is null). The only DB touch in this module — kept here rather
 * than in the route handler so a future Stage-3 AI engine can call it directly
 * without an HTTP round trip, mirroring how lib/insights.ts keeps Prisma access
 * inside the lib. `contentHtml` never leaves this function: only the extracted,
 * structured result does.
 */
export async function loadDomainMarks(domainSlug: string | null): Promise<DomainMarks> {
  const [nuggets, domain] = await Promise.all([
    prisma.nugget.findMany({
      where: domainSlug ? { domain: { slug: domainSlug } } : {},
      select: { id: true, title: true, contentHtml: true, markScheme: true },
      orderBy: { createdAt: 'desc' },
      take: MAX_NUGGETS,
    }),
    domainSlug
      ? prisma.domain.findUnique({
          where: { slug: domainSlug },
          select: { id: true, name: true, slug: true, icon: true, color: true },
        })
      : Promise.resolve(null),
  ])

  return { domain, ...collectDomainMarks(nuggets) }
}
