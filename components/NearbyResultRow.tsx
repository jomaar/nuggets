'use client'

import MarkSwatch from './MarkSwatch'
import useLongPress from './useLongPress'
import type { MarkKind } from '@/lib/marking'

/** Mirrors app/api/nearby/route.ts's response shape (lib/nearbyIndex.ts's NearbyResult). */
export interface NearbyResult {
  id: string
  nuggetId: string
  nuggetTitle: string
  kind: string
  color: string | null
  markStyle: string | null
  text: string
  gloss: string | null
  quote: string
  prefix: string
  suffix: string
  score: number
}

const KIND_LABEL: Record<string, string> = {
  paragraph: 'Absatz',
  comment: 'Kommentar',
}

/**
 * One "Naheliegendes" result row — sibling of MarkBrowseRow.tsx, but a
 * `<button>` that opens an in-tab preview rather than a `Link` that would
 * navigate straight away (a tap must never leave the nugget being read —
 * see the Spinnennetz plan's "Vorschau statt Wegnavigieren" decision).
 * Generous `line-clamp`: showing enough text to judge relevance without
 * navigating is the entire point, unlike MarkBrowseRow's tighter 2-line clamp.
 *
 * Tap → onTap (preview). Long-press (Spinnennetz Stufe 2, useLongPress —
 * same hook EgoGraph.tsx already uses for ring-node long-press) → onLongPress
 * (the explicit peek-slot picker), bypassing the preview for readers who
 * already know exactly where they want this to land.
 */
export default function NearbyResultRow({ result, onTap, onLongPress, openInSlot }: {
  result: NearbyResult
  onTap: () => void
  onLongPress: () => void
  /** 1-based Peek-Tab slot number (matching PeekSlotPicker's own "Tab 1/2/3" labelling) if this result's nugget is already open — a small numbered badge, so the owner can match results to already-open tabs at a glance. Null/undefined if not open anywhere. */
  openInSlot?: number | null
}) {
  const longPress = useLongPress<void>(onLongPress, onTap)
  return (
    <button
      {...longPress()}
      className="flex flex-col gap-1.5 rounded-2xl border px-3.5 py-3 text-left transition-transform active:scale-[0.99] w-full"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: '0 2px 12px rgba(26,23,20,0.06)' }}
    >
      <div className="flex items-center gap-2">
        {result.kind === 'mark' && result.color && result.markStyle ? (
          <MarkSwatch kind={result.markStyle as MarkKind} color={result.color} size={14} />
        ) : (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full tracking-wide uppercase flex-shrink-0"
            style={{ background: 'var(--warm)', color: 'var(--muted)' }}
          >
            {KIND_LABEL[result.kind] ?? result.kind}
          </span>
        )}
        <span className="text-xs truncate flex-1" style={{ color: 'var(--muted)' }}>
          {result.nuggetTitle}
        </span>
        {openInSlot != null && (
          <span
            title={`Bereits offen in Tab ${openInSlot}`}
            className="flex items-center justify-center flex-shrink-0 text-[10px] font-medium rounded-full"
            style={{ width: 18, height: 18, background: 'var(--accent)', color: 'white' }}
          >
            {openInSlot}
          </span>
        )}
      </div>
      <span className="text-sm line-clamp-5 break-words" style={{ color: 'var(--ink)', lineHeight: 1.6 }}>
        {result.gloss && (
          <span className="font-medium" style={{ color: 'var(--accent)' }}>
            {result.gloss}:{' '}
          </span>
        )}
        {result.text}
      </span>
    </button>
  )
}
