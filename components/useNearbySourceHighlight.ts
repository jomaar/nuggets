'use client'

import { useEffect, type RefObject } from 'react'
import { useTabs } from './TabsContext'
import { resolveAnchor, setNearbySourceHighlight } from '@/lib/textQuoteAnchor'

/** Matches jumpToAnchor's own retry cap (app/nugget/[id]/page.tsx) — enough frames for Tiptap's async render to catch up. */
const MAX_RESOLVE_ATTEMPTS = 40

/**
 * Spinnennetz Stufe 2 — paints a persistent highlight on the passage a
 * currently-open Naheliegendes search was triggered from, in WHICHEVER
 * reading view (Haupt or a Peek-Tab) currently shows that source nugget.
 * Directly answers the owner's ask: after scrolling away and back, or after
 * switching tabs and returning, it's still visible at a glance which text
 * the current "Naheliegendes" list is about — instead of having to
 * re-select it to remember.
 *
 * Two timing problems, both solved the same way `jumpToAnchor` already
 * solves them for bookmark jumps — retrying across animation frames:
 *
 * 1. Tiptap renders async, so on the very first attempt the anchor's text
 *    may not exist in the DOM yet.
 * 2. `NuggetDetailPage` never actually unmounts when switching away from
 *    Haupt to another tab — only the JSX branch it returns changes (see
 *    app/nugget/[id]/page.tsx's "swap not stack" comment) — so `nuggetId`
 *    and `nearby` can easily stay unchanged across an entire away-and-back
 *    cycle while `contentRef.current` briefly becomes null (Haupt's own DOM
 *    unmounted) and then valid again (Haupt remounted). A plain dependency
 *    array on values that never change across that cycle would never
 *    re-trigger the resolve — `tabs.activeTab` is included specifically so
 *    every tab switch retries, cheaply, regardless of what else changed.
 *
 * Cleared automatically whenever it no longer applies: the shown nugget
 * isn't the search's source, a fresh search replaces the anchor, or the
 * Naheliegendes tab is closed (tabs.closeNearby sets `nearby` to null).
 */
export function useNearbySourceHighlight(contentRef: RefObject<HTMLElement | null>, nuggetId: string | null) {
  const tabs = useTabs()
  const nearby = tabs.nearby

  useEffect(() => {
    const matches = nearby && nuggetId && nearby.sourceNuggetId === nuggetId && nearby.sourceAnchor
    if (!matches) {
      setNearbySourceHighlight(null)
      return
    }
    const anchor = nearby.sourceAnchor!
    let raf = 0
    let attempts = 0
    const tryResolve = () => {
      const root = contentRef.current
      const range = root ? resolveAnchor(root, anchor.quote, anchor.prefix, anchor.suffix) : null
      if (range) {
        setNearbySourceHighlight(range)
        return
      }
      if (attempts++ >= MAX_RESOLVE_ATTEMPTS) return
      raf = requestAnimationFrame(tryResolve)
    }
    raf = requestAnimationFrame(tryResolve)
    return () => {
      cancelAnimationFrame(raf)
      setNearbySourceHighlight(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- contentRef is a stable ref object; only .current matters, which effects can't depend on directly
  }, [nuggetId, nearby, tabs.activeTab])
}
