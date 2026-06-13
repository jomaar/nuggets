'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import EgoGraph from '@/components/EgoGraph'
import GraphSheet, { type SheetSelection } from '@/components/GraphSheet'
import type { EgoData, EgoNeighbor, EgoNode, EgoNodeType } from '@/lib/ego'

/** The focused node, addressed by the URL: /graph?type=concept|nugget&id=… */
interface Focus {
  type: EgoNodeType
  id: string
}

/** One visited node in the breadcrumb trail (just what a chip needs). */
interface TrailNode {
  type: EgoNodeType
  id: string
  label: string
}

/** One concept row from GET /api/concepts, reduced to what the entry list shows. */
interface ConceptListEntry {
  id: string
  labels: { language: string; term: string }[]
  _count: { nuggets: number }
}

/** Label priority de → en → first, mirroring the concept pages. */
function primaryTerm(labels: { language: string; term: string }[]): string {
  return (
    labels.find(l => l.language === 'de')?.term ??
    labels.find(l => l.language === 'en')?.term ??
    labels[0]?.term ?? '?'
  )
}

/** Parses the focus from the current URL; null = show the entry list. */
function readFocusFromUrl(): Focus | null {
  const params = new URLSearchParams(window.location.search)
  const type = params.get('type')
  const id = params.get('id')
  if ((type === 'concept' || type === 'nugget') && id) return { type, id }
  return null
}

/**
 * /graph — the ego-network view (PLAN.md Phase 8 Stufe B, Kern-Slice).
 * Always ONE node in focus; tapping a ring node glides it into the centre and
 * fans out its neighbours. Navigation = hopping node to node.
 *
 * The focus lives in the URL (pushState on hop, popstate restores it), so the
 * iOS back swipe walks the visited path and a view can be shared/bookmarked.
 * Read via window.location, NOT useSearchParams (avoids the App-Router
 * Suspense requirement — same pattern as app/add).
 *
 * Interaction matrix:
 *   tap ring node        → hop (focus change, pushState); closes the sheet
 *   long-press ring node → sheet (peek) with that neighbour, focus unchanged
 *   tap centre node      → sheet (peek) with the centre's detail
 *   tap edge line        → sheet (peek) with the neighbour + edge note
 *   "Öffnen" in sheet    → the node's regular detail page
 *   neighbour row in sheet → hop + sheet closes
 *   tap breadcrumb chip  → jump back to that node, trail truncates
 *   popstate (back swipe) → sheet closes, focus + trail step back
 *
 * The breadcrumb trail snapshots into history.state on every hop, so popstate
 * restores the exact path; hopping onto a visited node cuts the trail back to
 * it (a path, never a loop).
 */
export default function GraphPage() {
  const router = useRouter()
  // null = unresolved (first client render); the URL is read on mount.
  const [focus, setFocus] = useState<Focus | null>(null)
  const [booted, setBooted] = useState(false)
  const [data, setData] = useState<EgoData | null>(null)
  const [loading, setLoading] = useState(false)
  const [entryConcepts, setEntryConcepts] = useState<ConceptListEntry[]>([])
  /** What the bottom sheet shows; null = closed. */
  const [sheet, setSheet] = useState<SheetSelection | null>(null)
  /** Breadcrumb of visited nodes; the last entry is the current focus. Each
   *  hop snapshots this into history.state, so the back swipe restores it. */
  const [trail, setTrail] = useState<TrailNode[]>([])

  // Resolve the focus from the URL on mount and on every history move, so the
  // back swipe steps back through the hop trail.
  useEffect(() => {
    const initialFocus = readFocusFromUrl()
    setFocus(initialFocus)
    // Restore a trail snapshot if we landed via history (shared link / reload
    // mid-trail won't have one — seed it from the focus, label filled on load).
    const stateTrail = window.history.state?.trail as TrailNode[] | undefined
    if (stateTrail?.length) setTrail(stateTrail)
    else if (initialFocus) setTrail([{ ...initialFocus, label: '' }])
    setBooted(true)
    const onPopState = () => {
      setFocus(readFocusFromUrl())
      setSheet(null)
      const restored = window.history.state?.trail as TrailNode[] | undefined
      setTrail(restored ?? [])
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // Load the ego data of the focused node — or the concept entry list when
  // nothing is focused yet. Stale responses of an outdated focus are dropped.
  useEffect(() => {
    if (!booted) return
    let cancelled = false

    if (!focus) {
      fetch('/api/concepts')
        .then(res => (res.ok ? res.json() : []))
        .then(list => { if (!cancelled) setEntryConcepts(list) })
      return () => { cancelled = true }
    }

    setLoading(true)
    fetch(`/api/graph/ego?type=${focus.type}&id=${focus.id}`)
      .then(res => (res.ok ? res.json() : null))
      .then((ego: EgoData | null) => {
        if (cancelled) return
        setData(ego)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [booted, focus])

  // Fill the current trail chip's label once the focused node's data arrives
  // (the seed-from-URL case starts label-less; hops already carry their label).
  useEffect(() => {
    if (!data || !focus) return
    setTrail(prev => {
      const last = prev[prev.length - 1]
      if (!last || last.label || last.type !== focus.type || last.id !== focus.id) return prev
      return [...prev.slice(0, -1), { ...last, label: data.center.label }]
    })
  }, [data, focus])

  /** Hop: a ring node becomes the new centre; the URL records the step and the
   *  growing trail is snapshotted into history.state. Hopping onto a node that
   *  is already in the trail cuts back to it (a path, not a visit log — no loops). */
  const focusNode = useCallback((node: EgoNode) => {
    const seen = trail.findIndex(n => n.type === node.type && n.id === node.id)
    const next: TrailNode[] = seen >= 0
      ? trail.slice(0, seen + 1)
      : [...trail, { type: node.type, id: node.id, label: node.label }]
    window.history.pushState({ trail: next }, '', `/graph?type=${node.type}&id=${node.id}`)
    setTrail(next)
    setFocus({ type: node.type, id: node.id })
    setSheet(null)
  }, [trail])

  /** Tap a breadcrumb chip: jump back to that node, truncating the trail. */
  const jumpToTrail = useCallback((index: number) => {
    const node = trail[index]
    if (!node || index === trail.length - 1) return
    const next = trail.slice(0, index + 1)
    window.history.pushState({ trail: next }, '', `/graph?type=${node.type}&id=${node.id}`)
    setTrail(next)
    setFocus({ type: node.type, id: node.id })
    setSheet(null)
  }, [trail])

  /** Tap on the centre opens its detail sheet (navigation moved to "Öffnen"). */
  const openCenter = useCallback(() => setSheet({ kind: 'center' }), [])

  /** Long-press on a ring node or tap on an edge: preview the neighbour. */
  const previewNeighbor = useCallback((neighbor: EgoNeighbor) => {
    setSheet({ kind: 'neighbor', neighbor })
  }, [])

  /** "Öffnen" in the sheet: leave the graph for the node's regular page. */
  const openNodePage = useCallback((node: EgoNode) => {
    router.push(node.type === 'concept' ? `/concepts/${node.id}` : `/nugget/${node.id}`)
  }, [router])

  return (
    <>
      <header className="pt-10 pb-4">
        <button
          onClick={() => router.back()}
          className="text-xs mb-4 flex items-center gap-1"
          style={{ color: 'var(--muted)' }}
        >
          ← Zurück
        </button>
        <h1 className="text-3xl mb-1">Netz</h1>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          {focus
            ? 'Tipp auf einen Nachbarn zum Weiterhüpfen — halte ihn gedrückt für eine Vorschau.'
            : 'Wähle ein Konzept als Einstieg.'}
        </p>
      </header>

      {/* Breadcrumb: the visited path. Tap an earlier chip to jump back; the
          last chip is the current node (highlighted, no-op). Hidden for a lone
          node — a single crumb is not a trail. */}
      {booted && focus && trail.length > 1 && (
        <div
          className="flex items-center gap-1 overflow-x-auto pb-3 -mx-1 px-1"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {trail.map((n, i) => {
            const current = i === trail.length - 1
            return (
              <Fragment key={`${n.type}:${n.id}:${i}`}>
                {i > 0 && (
                  <span className="text-xs shrink-0" style={{ color: 'var(--muted)', opacity: 0.5 }}>›</span>
                )}
                <button
                  onClick={() => jumpToTrail(i)}
                  disabled={current}
                  className="text-xs whitespace-nowrap px-2 py-0.5 rounded-full shrink-0"
                  style={current
                    ? { color: 'var(--accent)', fontWeight: 500 }
                    : { color: 'var(--muted)' }}
                >
                  {n.label || '…'}
                </button>
              </Fragment>
            )
          })}
        </div>
      )}

      {/* Entry: concept chips (most connected first), no giant overview graph. */}
      {booted && !focus && (
        <div className="flex flex-wrap gap-2">
          {entryConcepts.map(c => (
            <button
              key={c.id}
              onClick={() => focusNode({ type: 'concept', id: c.id, label: primaryTerm(c.labels), degree: 0 })}
              className="text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5"
              style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}
            >
              <span>{primaryTerm(c.labels)}</span>
              <span style={{ opacity: 0.6 }}>{c._count.nuggets}</span>
            </button>
          ))}
        </div>
      )}

      {focus && !data && (
        <p className="text-sm pt-6" style={{ color: 'var(--muted)' }}>
          {loading ? 'Lädt…' : 'Knoten nicht gefunden.'}
        </p>
      )}

      {/* The old data stays visible while the next hop loads — no flicker;
          the glide animation bridges straight into the fresh layout. */}
      {focus && data && (
        <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 200ms' }}>
          {data.neighbors.length > 0 ? (
            <EgoGraph
              data={data}
              onFocusNode={focusNode}
              onOpenCenter={openCenter}
              onEdgeTap={previewNeighbor}
              onPreviewNode={previewNeighbor}
            />
          ) : (
            <p className="text-sm pt-6" style={{ color: 'var(--muted)' }}>
              „{data.center.label}“ hat noch keine Verbindungen.
            </p>
          )}
        </div>
      )}

      {/* Bottom sheet — node detail / edge note. No backdrop on purpose: the
          graph stays visible and hoppable behind the peek state. */}
      {sheet && data && (
        <GraphSheet
          data={data}
          selection={sheet}
          onClose={() => setSheet(null)}
          onOpenNode={openNodePage}
          onFocusNode={focusNode}
        />
      )}
    </>
  )
}
