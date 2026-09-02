'use client'

import { useEffect, useRef } from 'react'
import { ArrowUpRight, MessageSquareText, X } from 'lucide-react'
import NuggetReader from './NuggetReader'
import { useSelectionRange } from './useSelectionRange'
import { useNearbySourceHighlight } from './useNearbySourceHighlight'
import { useTabs, type PeekSlotIndex, type PeekTarget } from './TabsContext'
import { parseMarkScheme } from '@/lib/marking'
import { commentMarkdownToHtml } from '@/lib/content'
import { decodeAnchorToken } from '@/lib/bookmarkLink'
import { buildRangeAnchor, buildSelectionQueryText, resolveAnchor, scrollRangeIntoView } from '@/lib/textQuoteAnchor'
import { recordRecentNugget, updateRecentScroll } from '@/lib/recentNuggets'

/** Matches jumpToAnchor's own retry cap (app/nugget/[id]/page.tsx) — enough frames for Tiptap's async render to catch up. */
const MAX_JUMP_ATTEMPTS = 40

/**
 * Spinnennetz Stufe 2 — a Peek-Tab: reads + references, does NOT mark,
 * comment, or edit (confirmed scope with the owner — that requires making
 * the nugget the actual Haupt tab via "Zum Haupt-Tab machen"). Takes
 * `nuggetId` as an explicit prop, never `useParams()`, so it can be mounted
 * independently of the URL — the data comes from TabsContext's own cache
 * (components/TabsContext.tsx's loadPeekNugget), not a fetch this component
 * does itself.
 */
export default function PeekTabView({ slot }: { slot: PeekSlotIndex }) {
  const tabs = useTabs()
  const peek = tabs.peeks[slot]
  const contentRef = useRef<HTMLDivElement>(null)
  const selectionRangeRef = useSelectionRange(contentRef)
  useNearbySourceHighlight(contentRef, peek?.nugget?.id ?? null)

  // Same scroll-position bookkeeping the main page does — so "Zum Haupt-Tab
  // machen" (which hands off via the SAME sessionStorage key) restores the
  // reader to where they were, and so simply revisiting this nugget later
  // (via the recent list, or promoting it) remembers the spot.
  useEffect(() => {
    if (!peek?.nugget) return
    recordRecentNugget(peek.nugget.id, peek.nugget.title)
  }, [peek?.nugget?.id, peek?.nugget?.title])

  useEffect(() => {
    if (!peek?.nugget) return
    const nuggetId = peek.nugget.id
    let timer: number | undefined
    const onScroll = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => updateRecentScroll(nuggetId, window.scrollY), 200)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('scroll', onScroll)
    }
  }, [peek?.nugget?.id])

  /**
   * Jumps to `peek.target.anchor` once the nugget's content has actually
   * rendered — without this, opening a peek from a Naheliegendes result just
   * showed the nugget's TOP, defeating the point on any nugget long enough to
   * need searching in the first place. RAF-retry for the same reason
   * jumpToAnchor (app/nugget/[id]/page.tsx) retries: Tiptap renders async, so
   * the target text may not exist in the DOM on the first attempt. Guarded by
   * `jumpedForRef` so this fires exactly once per (nugget, anchor) — a later
   * re-render (e.g. scroll-position bookkeeping above) must not keep
   * yanking the reader back to the target after they've scrolled away.
   */
  const jumpedForRef = useRef<string | null>(null)
  useEffect(() => {
    const nugget = peek?.nugget
    const target = peek?.target
    if (!nugget || !target) return
    const jumpKey = `${nugget.id}:${target.anchor.quote}`
    if (jumpedForRef.current === jumpKey) return

    let raf = 0
    let attempts = 0
    const tryJump = () => {
      const root = contentRef.current
      const range = root ? resolveAnchor(root, target.anchor.quote, target.anchor.prefix, target.anchor.suffix) : null
      if (range) {
        scrollRangeIntoView(range)
        jumpedForRef.current = jumpKey
        return
      }
      if (attempts++ >= MAX_JUMP_ATTEMPTS) return
      raf = requestAnimationFrame(tryJump)
    }
    raf = requestAnimationFrame(tryJump)
    return () => cancelAnimationFrame(raf)
  }, [peek?.nugget, peek?.target])

  if (!peek) return null

  const triggerNearby = () => {
    if (!peek.nugget) return
    const root = contentRef.current
    const sel = selectionRangeRef.current
    if (!root || !sel) return
    const queryText = buildSelectionQueryText(sel)
    if (!queryText) return
    const anchor = buildRangeAnchor(root, sel)
    tabs.triggerNearby({
      sourceNuggetId: peek.nugget.id,
      sourceNuggetTitle: peek.nugget.title,
      queryText,
      anchor,
    })
  }

  /**
   * In-content link taps: a same-nugget `?bm=` token jumps in place (same
   * mechanic as the main page); a link to ANOTHER nugget opens into a peek
   * slot instead of navigating away — leaving a peek tab is only ever a
   * deliberate act ("Zum Haupt-Tab machen"), never a side effect of tapping
   * a link inside one. The `?bm=` anchor (if present) becomes that new
   * peek's target, so it lands on the linked spot too, not just the top.
   */
  const handleContentClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const anchorEl = (event.target as HTMLElement).closest('a')
    const href = anchorEl?.getAttribute('href')
    if (!href || !peek.nugget) return
    let url: URL
    try { url = new URL(href, window.location.origin) } catch { return }
    if (url.origin !== window.location.origin) return
    const match = url.pathname.match(/^\/nugget\/([^/]+)\/?$/)
    if (!match) return
    event.preventDefault()

    const targetId = match[1]
    const token = url.searchParams.get('bm')
    const anchor = token ? decodeAnchorToken(token) : null
    if (targetId === peek.nugget.id) {
      if (!anchor) return
      const root = contentRef.current
      const range = root ? resolveAnchor(root, anchor.quote, anchor.prefix, anchor.suffix) : null
      if (range) scrollRangeIntoView(range)
      return
    }
    const target: PeekTarget | null = anchor ? { anchor, commentText: null } : null
    tabs.openNuggetId(targetId, targetId, target)
  }

  const closeSlot = () => tabs.closePeek(slot)
  const promote = () => tabs.promotePeekToHaupt(slot)

  return (
    <div>
      <div
        className="flex items-center gap-2 sticky z-30 -mx-4 px-4 pt-3 pb-3"
        style={{ top: 'var(--tabbar-h, 0px)', background: 'var(--bg)' }}
      >
        <h1 className="text-base font-medium flex-1 truncate" style={{ color: 'var(--ink)' }}>
          {peek.title || 'Lädt…'}
        </h1>
        <button
          type="button"
          onClick={promote}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg flex-shrink-0"
          style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
        >
          <ArrowUpRight size={14} />
          Zum Haupt-Tab machen
        </button>
        <button
          type="button"
          onClick={closeSlot}
          aria-label="Tab schließen"
          className="flex items-center justify-center p-1.5 rounded-lg flex-shrink-0"
          style={{ color: 'var(--muted)' }}
        >
          <X size={18} />
        </button>
      </div>

      {peek.loading && !peek.nugget && (
        <p className="text-sm pt-3" style={{ color: 'var(--muted)' }}>Lädt…</p>
      )}
      {peek.error && (
        <p className="text-sm pt-3" style={{ color: '#b45309' }}>{peek.error}</p>
      )}

      {/* A Peek-Tab has no comment-viewing UI at all (deliberately — see the
          file doc comment) — so a comment-kind Naheliegendes result would
          otherwise be nearly useless here: the quoted passage becomes
          visible once scrolled to, but the comment ITSELF, which is what the
          result was actually about, never would. The KnowledgeUnit's `text`
          ("quote — body") was already loaded with the search result, so this
          costs no extra fetch. */}
      {peek.nugget && peek.target?.commentText && (
        <div
          className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-lg annotation-body"
          style={{ background: 'var(--warm)', border: '1px solid var(--border)' }}
        >
          <MessageSquareText size={16} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--muted)' }} />
          <div
            className="text-sm min-w-0"
            style={{ color: 'var(--ink)' }}
            dangerouslySetInnerHTML={{ __html: commentMarkdownToHtml(peek.target.commentText) }}
          />
        </div>
      )}

      {peek.nugget && (
        <div ref={contentRef} onClick={handleContentClick}>
          <NuggetReader
            id={peek.nugget.id}
            contentHtml={peek.nugget.contentHtml}
            markScheme={parseMarkScheme(peek.nugget.markScheme)}
            enableMarking={false}
            onNearby={triggerNearby}
          />
        </div>
      )}
    </div>
  )
}
