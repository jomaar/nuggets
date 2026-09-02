'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { AnchorToken } from '@/lib/bookmarkLink'
import { SCROLL_RESTORE_KEY } from '@/lib/recentNuggets'
import type { NearbyResult } from './NearbyResultRow'

/**
 * Spinnennetz Stufe 2 — the persistent multi-tab state living ABOVE the
 * routed page (app/layout.tsx), so it survives navigation between different
 * /nugget/[id] URLs (React only reconciles {children}, not the layout tree
 * around it). "Haupt" is not tracked here at all — it's simply whatever the
 * URL currently routes to; this context only manages the SIDE tabs.
 *
 * Deliberately in-memory only, not sessionStorage-persisted: peek slots
 * cache full nugget JSON (contentHtml up to ~100k chars), a real quota risk
 * across 3 slots, and no existing sessionStorage key in this app holds a
 * bulk API payload (only tiny scalars). A reload loses open tabs — a minor,
 * easily-recovered inconvenience, not data loss (bookmarks/comments/marks
 * are unaffected). A peek tab's SCROLL position still survives via the
 * existing lib/recentNuggets.ts mechanism (PeekTabView calls
 * recordRecentNugget/updateRecentScroll exactly like the main page does).
 *
 * "Swap, not stack": only ONE tab's content is ever mounted at a time —
 * app/nugget/[id]/page.tsx itself conditionally renders its own Haupt content
 * vs. NearbyTabView vs. PeekTabView based on `activeTab` (not a separate
 * viewport component). The reading view's search/comment highlighting uses
 * the CSS Custom Highlight API, registered GLOBALLY per
 * document, not per component instance — two full readers mounted at once
 * would corrupt each other's highlight registrations.
 */

export type PeekSlotIndex = 0 | 1 | 2

export type Tab =
  | { kind: 'haupt' }
  | { kind: 'nearby' }
  | { kind: 'peek'; slot: PeekSlotIndex }

export interface NearbyTabState {
  loading: boolean
  error: string | null
  results: NearbyResult[]
  /** sel.toString() — the full multi-node selection, NOT buildRangeAnchor's clamped quote. */
  queryText: string
  /** Optional jump-back anchor for the "Ausgehend von" header. */
  sourceAnchor: AnchorToken | null
  sourceNuggetId: string
  sourceNuggetTitle: string
}

/** Deliberately smaller than the main page's Nugget interface — a peek tab only ever reads. */
export interface PeekNugget {
  id: string
  title: string
  contentHtml: string
  markScheme: string
}

/**
 * Where a Peek-Tab should land once its nugget loads, and (for a comment
 * result) what to show since a peek tab has no comment-viewing UI of its own.
 * `commentText` is the KnowledgeUnit's already-loaded `text` field ("quote —
 * body") — no extra fetch needed, it was already shipped with the search
 * result.
 */
export interface PeekTarget {
  anchor: AnchorToken
  commentText: string | null
}

export interface PeekTabState {
  nuggetId: string
  title: string
  /** null while loading (or on error) — the already-fetched payload, cached so switching back doesn't refetch. */
  nugget: PeekNugget | null
  loading: boolean
  error: string | null
  /** Bumped whenever this slot becomes the active tab — drives LRU auto-eviction when all 3 slots are full. */
  lastUsedAt: number
  /** Set when opened from a specific result/link — PeekTabView scrolls here once the nugget loads. */
  target: PeekTarget | null
}

interface TriggerNearbyArgs {
  sourceNuggetId: string
  sourceNuggetTitle: string
  queryText: string
  anchor: AnchorToken | null
}

interface TabsContextValue {
  activeTab: Tab
  nearby: NearbyTabState | null
  peeks: (PeekTabState | null)[]
  /** The nugget id currently routed as Haupt — registered by the page itself, used only for open-result dedup. */
  hauptId: string | null
  setHauptId: (id: string | null) => void
  hasExtraTabs: boolean
  setActiveTab: (t: Tab) => void
  triggerNearby: (src: TriggerNearbyArgs) => void
  /** Plain tap "Ganz öffnen" — auto slot choice (first empty, else LRU) with dedup against Haupt/existing peeks. */
  openResult: (result: NearbyResult) => void
  /** Same auto-slot-choice/dedup as openResult, but by plain id/title (+ optional target anchor) — for an in-content link tap inside a Peek-Tab (no search-result shape available there). */
  openNuggetId: (nuggetId: string, title: string, target?: PeekTarget | null) => void
  /** Long-press → explicit slot choice — always replaces that slot, no dedup (the owner picked deliberately). */
  openResultInSlot: (result: NearbyResult, slot: PeekSlotIndex) => void
  closePeek: (slot: PeekSlotIndex) => void
  /** "Zum Haupt-Tab machen": hands the scroll position off via the existing recent-list mechanism, navigates, then frees the slot. */
  promotePeekToHaupt: (slot: PeekSlotIndex) => void
  /** Dismisses the Naheliegendes tab entirely — clears its results AND the persistent source-passage highlight (see useNearbySourceHighlight), falls back to Haupt if it was active. */
  closeNearby: () => void
}

function noop() {}

const TabsContext = createContext<TabsContextValue>({
  activeTab: { kind: 'haupt' },
  nearby: null,
  peeks: [null, null, null],
  hauptId: null,
  setHauptId: noop,
  hasExtraTabs: false,
  setActiveTab: noop,
  triggerNearby: noop,
  openResult: noop,
  openNuggetId: noop,
  openResultInSlot: noop,
  closePeek: noop,
  promotePeekToHaupt: noop,
  closeNearby: noop,
})

export function useTabs(): TabsContextValue {
  return useContext(TabsContext)
}

export function TabsProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [activeTab, setActiveTabRaw] = useState<Tab>({ kind: 'haupt' })
  const [nearby, setNearby] = useState<NearbyTabState | null>(null)
  const [peeks, setPeeks] = useState<(PeekTabState | null)[]>([null, null, null])
  const [hauptId, setHauptId] = useState<string | null>(null)

  /**
   * The public setActiveTab: same as the raw React setter, except switching
   * TO a peek slot also bumps its lastUsedAt — otherwise a slot the owner
   * just revisited (but didn't re-open via a result) would look stale to the
   * LRU auto-eviction in openResult below.
   */
  const setActiveTab = useCallback((t: Tab) => {
    setActiveTabRaw(t)
    if (t.kind === 'peek') {
      setPeeks(prev => {
        const current = prev[t.slot]
        if (!current) return prev
        const next = [...prev] as (PeekTabState | null)[]
        next[t.slot] = { ...current, lastUsedAt: Date.now() }
        return next
      })
    }
  }, [])

  const loadPeekNugget = useCallback((slot: PeekSlotIndex, nuggetId: string, title: string, target: PeekTarget | null) => {
    setPeeks(prev => {
      const next = [...prev] as (PeekTabState | null)[]
      next[slot] = { nuggetId, title, nugget: null, loading: true, error: null, lastUsedAt: Date.now(), target }
      return next
    })
    fetch(`/api/nuggets/${nuggetId}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data: { id: string; title: string; contentHtml: string; markScheme: string }) => {
        setPeeks(prev => {
          const next = [...prev] as (PeekTabState | null)[]
          const current = next[slot]
          // The slot may have been reassigned to a different nugget while this fetch was in flight — don't clobber it.
          if (!current || current.nuggetId !== nuggetId) return prev
          next[slot] = {
            ...current,
            title: data.title || title,
            nugget: { id: data.id, title: data.title, contentHtml: data.contentHtml, markScheme: data.markScheme },
            loading: false,
          }
          return next
        })
      })
      .catch(() => {
        setPeeks(prev => {
          const next = [...prev] as (PeekTabState | null)[]
          const current = next[slot]
          if (!current || current.nuggetId !== nuggetId) return prev
          next[slot] = { ...current, loading: false, error: 'Laden fehlgeschlagen.' }
          return next
        })
      })
  }, [])

  const openInSlot = useCallback((slot: PeekSlotIndex, nuggetId: string, title: string, target: PeekTarget | null = null) => {
    loadPeekNugget(slot, nuggetId, title, target)
    setActiveTab({ kind: 'peek', slot })
  }, [loadPeekNugget, setActiveTab])

  /** Builds the {anchor, commentText} PeekTarget from a search result — shared by openResult and openResultInSlot. */
  const targetFromResult = (result: NearbyResult): PeekTarget => ({
    anchor: { quote: result.quote, prefix: result.prefix, suffix: result.suffix },
    commentText: result.kind === 'comment' ? result.text : null,
  })

  const openResultInSlot = useCallback((result: NearbyResult, slot: PeekSlotIndex) => {
    openInSlot(slot, result.nuggetId, result.nuggetTitle, targetFromResult(result))
  }, [openInSlot])

  /**
   * Core auto-slot-choice logic, by plain id/title rather than a full
   * NearbyResult — shared by openResult (Naheliegendes "Ganz öffnen") and
   * openNuggetId (a plain in-content link tap inside a Peek-Tab, which only
   * ever has an id/title, not a search-result's text/gloss/score).
   */
  const openNuggetId = useCallback((nuggetId: string, title: string, target: PeekTarget | null = null) => {
    if (nuggetId === hauptId) {
      // No jump-in-place for the Haupt-dedup case (yet) — Haupt has no
      // "pending target" plumbing today. Switching there is still correct
      // and avoids a redundant peek; landing on the exact passage is a
      // reasonable future refinement, not a reported bug.
      setActiveTab({ kind: 'haupt' })
      return
    }
    const existingSlot = peeks.findIndex(p => p?.nuggetId === nuggetId)
    if (existingSlot !== -1) {
      // Reopening an ALREADY-open peek with a NEW target (e.g. a different
      // Naheliegendes result pointing at the same nugget) must still jump to
      // the new spot, not just switch to wherever it happened to be scrolled.
      if (target) {
        setPeeks(prev => {
          const next = [...prev] as (PeekTabState | null)[]
          const current = next[existingSlot]
          if (current) next[existingSlot] = { ...current, target }
          return next
        })
      }
      setActiveTab({ kind: 'peek', slot: existingSlot as PeekSlotIndex })
      return
    }
    const emptySlot = peeks.findIndex(p => p === null)
    if (emptySlot !== -1) {
      openInSlot(emptySlot as PeekSlotIndex, nuggetId, title, target)
      return
    }
    // All 3 occupied — evict the least-recently-used rather than always slot 0,
    // so opening a result never surprises the owner by silently overwriting
    // whatever they just looked at.
    let lruSlot: PeekSlotIndex = 0
    let lruTime = Infinity
    peeks.forEach((p, i) => {
      if (p && p.lastUsedAt < lruTime) { lruTime = p.lastUsedAt; lruSlot = i as PeekSlotIndex }
    })
    openInSlot(lruSlot, nuggetId, title, target)
  }, [hauptId, peeks, openInSlot, setActiveTab])

  const openResult = useCallback((result: NearbyResult) => {
    openNuggetId(result.nuggetId, result.nuggetTitle, targetFromResult(result))
  }, [openNuggetId])

  const closePeek = useCallback((slot: PeekSlotIndex) => {
    setPeeks(prev => {
      const next = [...prev] as (PeekTabState | null)[]
      next[slot] = null
      return next
    })
    // Falls back to Haupt only if the closed slot was the active one — closing
    // an inactive peek pill must not disturb whatever is currently showing.
    if (activeTab.kind === 'peek' && activeTab.slot === slot) {
      setActiveTabRaw({ kind: 'haupt' })
    }
  }, [activeTab])

  const promotePeekToHaupt = useCallback((slot: PeekSlotIndex) => {
    // Side effects happen HERE, not inside a setState updater (React may
    // invoke an updater more than once — sessionStorage/router.push must not).
    const peek = peeks[slot]
    if (peek) {
      sessionStorage.setItem(SCROLL_RESTORE_KEY, peek.nuggetId)
      router.push(`/nugget/${peek.nuggetId}`)
    }
    setPeeks(prev => {
      const next = [...prev] as (PeekTabState | null)[]
      next[slot] = null
      return next
    })
    setActiveTab({ kind: 'haupt' })
  }, [peeks, router, setActiveTab])

  const triggerNearby = useCallback((src: TriggerNearbyArgs) => {
    setNearby({
      loading: true,
      error: null,
      results: [],
      queryText: src.queryText,
      sourceAnchor: src.anchor,
      sourceNuggetId: src.sourceNuggetId,
      sourceNuggetTitle: src.sourceNuggetTitle,
    })
    setActiveTab({ kind: 'nearby' })

    fetch(`/api/nearby?${new URLSearchParams({ nuggetId: src.sourceNuggetId, text: src.queryText })}`)
      .then(async res => {
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          const message = typeof body?.error === 'string' ? body.error : 'Suche fehlgeschlagen.'
          setNearby(prev => (prev && prev.sourceNuggetId === src.sourceNuggetId && prev.queryText === src.queryText
            ? { ...prev, loading: false, error: message }
            : prev))
          return
        }
        const data = await res.json()
        setNearby(prev => (prev && prev.sourceNuggetId === src.sourceNuggetId && prev.queryText === src.queryText
          ? { ...prev, loading: false, results: Array.isArray(data.results) ? data.results : [] }
          : prev))
      })
      .catch(() => {
        setNearby(prev => (prev && prev.sourceNuggetId === src.sourceNuggetId && prev.queryText === src.queryText
          ? { ...prev, loading: false, error: 'Suche fehlgeschlagen — Verbindung geprüft?' }
          : prev))
      })
  }, [setActiveTab])

  /**
   * Dismisses the Naheliegendes tab entirely (its own header X, and the
   * TabBar pill's X) — the owner explicitly asked for a way to get rid of
   * it once done referencing. Setting `nearby` to null also clears the
   * persistent source-passage highlight, since useNearbySourceHighlight
   * only paints it while `tabs.nearby` still exists.
   */
  const closeNearby = useCallback(() => {
    setNearby(null)
    if (activeTab.kind === 'nearby') {
      setActiveTabRaw({ kind: 'haupt' })
    }
  }, [activeTab])

  const hasExtraTabs = nearby !== null || peeks.some(Boolean)

  return (
    <TabsContext.Provider
      value={{
        activeTab, nearby, peeks, hauptId, setHauptId, hasExtraTabs,
        setActiveTab, triggerNearby, openResult, openNuggetId, openResultInSlot, closePeek, promotePeekToHaupt, closeNearby,
      }}
    >
      {children}
    </TabsContext.Provider>
  )
}
