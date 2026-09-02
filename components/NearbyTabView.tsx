'use client'

import { useState } from 'react'
import { ArrowLeft, X } from 'lucide-react'
import NearbyResultRow, { type NearbyResult } from './NearbyResultRow'
import PeekSlotPicker from './PeekSlotPicker'
import { useTabs } from './TabsContext'

/**
 * Spinnennetz Stufe 2 — the persistent "Naheliegendes" tab (replaces the
 * Stufe-1 NearbySheet, deleted). No longer a dismissible overlay: it owns
 * the full content area between TabBar and BottomNav while active, so its
 * old fixed/z-60/no-backdrop/Maximize-Minimize chrome is gone — that existed
 * only because it used to float on TOP of Haupt. The list⇄preview toggle
 * stays (still makes sense as the tab's own internal navigation), but the
 * "Ausgehend von" header is now ALWAYS visible in both sub-views, not just
 * the preview — the core ask: know at a glance which passage this list
 * belongs to, every time you switch here.
 */
export default function NearbyTabView() {
  const tabs = useTabs()
  const nearby = tabs.nearby
  const [selected, setSelected] = useState<NearbyResult | null>(null)
  const [pickerFor, setPickerFor] = useState<NearbyResult | null>(null)

  if (!nearby) return null

  const sourceText = nearby.sourceAnchor?.quote || nearby.queryText
  const truncatedSource = sourceText.length > 90 ? sourceText.slice(0, 90) + '…' : sourceText

  /** 1-based Peek-Tab slot a nugget is already open in, or null — matches PeekSlotPicker's own "Tab 1/2/3" labelling. */
  const slotFor = (nuggetId: string): number | null => {
    const i = tabs.peeks.findIndex(p => p?.nuggetId === nuggetId)
    return i === -1 ? null : i + 1
  }

  return (
    <div>
      <div
        className="flex items-center gap-2 sticky z-30 -mx-4 px-4 pt-3 pb-2.5"
        style={{ top: 'var(--tabbar-h, 0px)', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}
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
        <h1 className="text-base font-medium flex-1 truncate" style={{ color: 'var(--ink)' }}>
          {selected ? selected.nuggetTitle : 'Naheliegendes'}
          {!selected && nearby.results.length > 0 && (
            <span className="ml-2 text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
              {nearby.results.length}
            </span>
          )}
        </h1>
        <button
          type="button"
          onClick={tabs.closeNearby}
          aria-label="Naheliegendes schließen"
          className="flex items-center justify-center p-1.5 rounded-lg flex-shrink-0"
          style={{ color: 'var(--muted)' }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Always visible, in both list and preview — the core "worauf bezieht
          sich das" requirement. */}
      <p className="text-xs pt-3" style={{ color: 'var(--muted)' }}>
        Ausgehend von „{truncatedSource}“ in {nearby.sourceNuggetTitle}
      </p>

      <div className="pt-3.5">
        {selected ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--ink)', lineHeight: 1.7 }}>
              {selected.gloss && (
                <span className="block font-medium mb-1.5" style={{ color: 'var(--accent)' }}>
                  {selected.gloss}
                </span>
              )}
              {selected.text}
            </p>
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => tabs.openResult(selected)}
                className="text-xs px-3.5 py-2 rounded-lg"
                style={{ color: 'white', background: 'var(--accent)' }}
              >
                Ganz öffnen
              </button>
              {slotFor(selected.nuggetId) != null && (
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  Bereits offen in Tab {slotFor(selected.nuggetId)}
                </span>
              )}
            </div>
          </div>
        ) : nearby.loading ? (
          <p className="text-sm text-center py-10" style={{ color: 'var(--muted)' }}>
            Suche läuft…
          </p>
        ) : nearby.error ? (
          <p className="text-sm text-center py-10" style={{ color: '#b45309' }}>
            {nearby.error}
          </p>
        ) : nearby.results.length === 0 ? (
          <p className="text-sm text-center py-10" style={{ color: 'var(--muted)' }}>
            Nichts Naheliegendes gefunden.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {nearby.results.map(r => (
              <NearbyResultRow
                key={r.id}
                result={r}
                onTap={() => setSelected(r)}
                onLongPress={() => setPickerFor(r)}
                openInSlot={slotFor(r.nuggetId)}
              />
            ))}
          </div>
        )}
      </div>

      {pickerFor && (
        <PeekSlotPicker result={pickerFor} onClose={() => setPickerFor(null)} />
      )}
    </div>
  )
}
