'use client'

import MarkSwatch from './MarkSwatch'
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
 * `<button>` that opens the in-sheet preview rather than a `Link` that would
 * navigate straight away (see the Spinnennetz Stufe-1 plan's "Vorschau statt
 * Wegnavigieren" decision — a tap must never leave the nugget being read).
 * Generous `line-clamp`: showing enough text to judge relevance without
 * navigating is the entire point, unlike MarkBrowseRow's tighter 2-line clamp.
 */
export default function NearbyResultRow({ result, onClick }: { result: NearbyResult; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
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
