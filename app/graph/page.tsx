'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import EgoGraph from '@/components/EgoGraph'
import type { EgoData, EgoNeighbor, EgoNode, EgoNodeType } from '@/lib/ego'

/** The focused node, addressed by the URL: /graph?type=concept|nugget&id=… */
interface Focus {
  type: EgoNodeType
  id: string
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
 */
export default function GraphPage() {
  const router = useRouter()
  // null = unresolved (first client render); the URL is read on mount.
  const [focus, setFocus] = useState<Focus | null>(null)
  const [booted, setBooted] = useState(false)
  const [data, setData] = useState<EgoData | null>(null)
  const [loading, setLoading] = useState(false)
  const [entryConcepts, setEntryConcepts] = useState<ConceptListEntry[]>([])
  /** The tapped edge whose note is shown in the bottom card; null = closed. */
  const [edgeSheet, setEdgeSheet] = useState<EgoNeighbor | null>(null)

  // Resolve the focus from the URL on mount and on every history move, so the
  // back swipe steps back through the hop trail.
  useEffect(() => {
    setFocus(readFocusFromUrl())
    setBooted(true)
    const onPopState = () => {
      setFocus(readFocusFromUrl())
      setEdgeSheet(null)
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

  /** Hop: a ring node becomes the new centre; the URL records the step. */
  const focusNode = useCallback((node: EgoNode) => {
    window.history.pushState(null, '', `/graph?type=${node.type}&id=${node.id}`)
    setFocus({ type: node.type, id: node.id })
    setEdgeSheet(null)
  }, [])

  /** Tap on the centre opens the node's regular detail page. */
  const openCenter = useCallback((node: EgoNode) => {
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
            ? 'Tipp auf einen Nachbarn, um weiterzuhüpfen — auf eine Linie für die Notiz.'
            : 'Wähle ein Konzept als Einstieg.'}
        </p>
      </header>

      {/* Entry: concept chips (most connected first), no giant overview graph. */}
      {booted && !focus && (
        <div className="flex flex-wrap gap-2">
          {entryConcepts.map(c => (
            <button
              key={c.id}
              onClick={() => focusNode({ type: 'concept', id: c.id, label: '', degree: 0 })}
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
              onEdgeTap={setEdgeSheet}
            />
          ) : (
            <p className="text-sm pt-6" style={{ color: 'var(--muted)' }}>
              „{data.center.label}“ hat noch keine Verbindungen.
            </p>
          )}
        </div>
      )}

      {/* Edge card — the WHY of the tapped link (NuggetConcept.note). Fixed
          above the BottomNav; the graph stays visible and navigable behind it. */}
      {edgeSheet && data && (
        <div
          className="fixed left-0 right-0 z-40 px-4"
          style={{ bottom: 'calc(72px + env(safe-area-inset-bottom))' }}
        >
          <div
            className="max-w-2xl mx-auto rounded-2xl px-5 py-4"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
            }}
          >
            <div className="flex items-start justify-between gap-3 mb-1">
              <p className="text-xs font-medium" style={{ color: 'var(--ink)' }}>
                {data.center.label}
                <span style={{ color: 'var(--muted)' }}> ↔ </span>
                {edgeSheet.node.label}
              </p>
              <button
                onClick={() => setEdgeSheet(null)}
                aria-label="Schließen"
                style={{ color: 'var(--muted)' }}
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-xs" style={{ color: 'var(--muted)', lineHeight: '1.5' }}>
              {edgeSheet.edge.note ?? 'Keine Notiz an dieser Kante.'}
            </p>
          </div>
        </div>
      )}
    </>
  )
}
