'use client'

import { useState } from 'react'
import { X, Maximize2, Minimize2, ArrowLeft } from 'lucide-react'
import NearbyResultRow, { type NearbyResult } from './NearbyResultRow'

export type { NearbyResult }

interface NearbySheetProps {
  results: NearbyResult[]
  loading: boolean
  error: string | null
  /** The text sampled at the reader's current position — shown as "Ausgehend von: …" so the search is legible, not a black box. */
  queryText: string
  /** "Ganz öffnen" in the preview — navigates to the result's exact spot via the ?bm= deep link. */
  onOpenFull: (result: NearbyResult) => void
  onClose: () => void
}

/**
 * "Naheliegendes" — Spinnennetz Stufe 1's manual retrieval view. Closest
 * sibling is AnnotationSheet: a fixed bottom panel, no backdrop (the reading
 * text above stays scrollable — the established "keine Overlays" rule),
 * Maximize2/Minimize2 toggle. Two internal views in ONE sheet so a tap never
 * leaves the current nugget: a result LIST, and — on tapping a row — a larger
 * PREVIEW of just that one result (its `text` is already loaded, no extra
 * fetch needed) with an explicit "Ganz öffnen" that navigates only when the
 * reader actually wants to leave (see the plan's "Vorschau statt
 * Wegnavigieren" decision).
 */
export default function NearbySheet({ results, loading, error, queryText, onOpenFull, onClose }: NearbySheetProps) {
  // Taller default than AnnotationSheet's 42dvh: generous snippet text is the
  // whole point here, not a quick comment glance.
  const [expanded, setExpanded] = useState(false)
  const [selected, setSelected] = useState<NearbyResult | null>(null)

  const truncatedQuery = queryText.length > 90 ? queryText.slice(0, 90) + '…' : queryText

  return (
    <div
      role="dialog"
      aria-modal={false}
      aria-label="Naheliegendes"
      className="fixed left-0 right-0 bottom-0 z-[60] flex flex-col sheet-enter"
      style={{
        height: expanded ? '100dvh' : '55dvh',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderBottom: 'none',
        borderRadius: expanded ? 0 : '20px 20px 0 0',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
        paddingTop: expanded ? 'env(safe-area-inset-top)' : undefined,
        paddingBottom: 'env(safe-area-inset-bottom)',
        transition: 'height 0.2s ease, border-radius 0.2s ease',
      }}
    >
      <div
        className="flex items-center gap-2 px-5 pt-3 pb-2.5 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        {selected && (
          <button
            onClick={() => setSelected(null)}
            aria-label="Zurück zur Liste"
            className="flex items-center justify-center p-1.5 rounded-lg -ml-1.5 flex-shrink-0"
            style={{ color: 'var(--muted)' }}
          >
            <ArrowLeft size={16} />
          </button>
        )}
        <h2 className="text-sm font-medium flex-1 truncate" style={{ color: 'var(--ink)' }}>
          {selected ? selected.nuggetTitle : 'Naheliegendes'}
          {!selected && results.length > 0 && (
            <span className="ml-2 text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
              {results.length}
            </span>
          )}
        </h2>
        <button
          onClick={() => setExpanded(e => !e)}
          aria-pressed={expanded}
          aria-label={expanded ? 'Vollbild verlassen' : 'Vollbild'}
          className="flex items-center justify-center p-1.5 rounded-lg flex-shrink-0"
          style={expanded
            ? { color: 'white', background: 'var(--accent)', border: '1px solid var(--accent)' }
            : { color: 'var(--muted)', border: '1px solid var(--border)' }}
        >
          {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
        <button
          onClick={onClose}
          aria-label="Schließen"
          className="flex items-center justify-center p-1.5 rounded-lg ml-1 flex-shrink-0"
          style={{ color: 'var(--muted)' }}
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3.5">
        {selected ? (
          <div className="flex flex-col gap-4">
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Ausgehend von: „{truncatedQuery}“
            </p>
            <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--ink)', lineHeight: 1.7 }}>
              {selected.gloss && (
                <span className="block font-medium mb-1.5" style={{ color: 'var(--accent)' }}>
                  {selected.gloss}
                </span>
              )}
              {selected.text}
            </p>
            <button
              onClick={() => onOpenFull(selected)}
              className="self-start text-xs px-3.5 py-2 rounded-lg"
              style={{ color: 'white', background: 'var(--accent)' }}
            >
              Ganz öffnen
            </button>
          </div>
        ) : loading ? (
          <p className="text-sm text-center py-10" style={{ color: 'var(--muted)' }}>
            Suche läuft…
          </p>
        ) : error ? (
          <p className="text-sm text-center py-10" style={{ color: '#b45309' }}>
            {error}
          </p>
        ) : results.length === 0 ? (
          <p className="text-sm text-center py-10" style={{ color: 'var(--muted)' }}>
            Nichts Naheliegendes gefunden.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {results.map(r => (
              <NearbyResultRow key={r.id} result={r} onClick={() => setSelected(r)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
