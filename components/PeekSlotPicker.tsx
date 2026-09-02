'use client'

import { X } from 'lucide-react'
import { useTabs, type PeekSlotIndex } from './TabsContext'
import type { NearbyResult } from './NearbyResultRow'

const SLOTS: PeekSlotIndex[] = [0, 1, 2]

/**
 * Spinnennetz Stufe 2 — long-press on a "Naheliegendes" result opens this:
 * an explicit choice of which Peek-Tab slot receives it, mirroring iOS
 * Safari's long-press "open link in tab" pattern. Centered modal (the
 * established pattern for a short, decisive choice — AiReworkPopup.tsx,
 * GoogleDocPicker.tsx — not a bottom sheet, which this app reserves for
 * browsing/detail views). Tapping any row, including an occupied one,
 * replaces it and switches there immediately — the long-press itself was
 * already the deliberate gesture, no secondary confirm needed.
 */
export default function PeekSlotPicker({ result, onClose }: { result: NearbyResult; onClose: () => void }) {
  const tabs = useTabs()

  const pick = (slot: PeekSlotIndex) => {
    tabs.openResultInSlot(result, slot)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(28,28,30,0.4)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden flex flex-col"
        style={{ background: 'var(--surface)', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <h2 className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            In welchen Tab?
          </h2>
          <button onClick={onClose} aria-label="Schließen" style={{ color: 'var(--muted)' }}>
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-1 p-2">
          {SLOTS.map(slot => {
            const occupant = tabs.peeks[slot]
            return (
              <button
                key={slot}
                type="button"
                onClick={() => pick(slot)}
                className="flex items-center gap-2 text-left text-sm px-3 py-2.5 rounded-lg"
                style={{ color: 'var(--ink)' }}
              >
                <span className="flex-shrink-0" style={{ color: 'var(--muted)' }}>Tab {slot + 1}</span>
                <span className="truncate" style={{ color: occupant ? 'var(--ink)' : 'var(--muted)' }}>
                  {occupant ? occupant.title || 'Lädt…' : 'leer'}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
