'use client'

import Link from 'next/link'
import { markColorVar } from '@/lib/marking'
import { encodeAnchorToken } from '@/lib/bookmarkLink'
import type { DomainMark } from '@/lib/marks'

/**
 * One cross-nugget mark row in the Denkspuren browse view. Mirrors the
 * single-nugget Markierungen popup's row (app/nugget/[id]/page.tsx) so it
 * reads as a sibling rather than a foreign page: highlights carry their
 * colour as a background wash, underlines carry the thick coloured line on
 * the text itself, and a custom per-nugget label (when set) renders as a
 * small uppercase sub-label — the concrete answer to the "markScheme is
 * per-nugget and sparse" facet nuance.
 *
 * The whole row is a Link that reuses the app's existing `?bm=` deep-link
 * mechanism (lib/bookmarkLink.ts + the reading view's mount resolver) to jump
 * straight to the marked passage — the same mechanism InsightCard uses for
 * its nugget jump chips.
 */
export default function MarkBrowseRow({
  mark,
  showNugget = false,
}: {
  mark: DomainMark
  showNugget?: boolean
}) {
  const href = `/nugget/${mark.nuggetId}?bm=${encodeAnchorToken(mark.anchor)}`

  return (
    <Link
      href={href}
      className="flex flex-col rounded-2xl border overflow-hidden transition-transform active:scale-[0.99]"
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--border)',
        boxShadow: '0 2px 12px rgba(26,23,20,0.06)',
      }}
    >
      <div
        className="px-3 py-2.5"
        style={{ background: mark.kind === 'hl' ? markColorVar('hl', mark.color) : 'var(--warm)' }}
      >
        {mark.hasCustomLabel && (
          <span
            className="block text-[10px] tracking-wide uppercase mb-0.5"
            style={{ color: 'var(--muted)' }}
          >
            {mark.label}
          </span>
        )}
        <span
          className="block text-sm break-words"
          style={{
            color: 'var(--ink)',
            ...(mark.kind === 'ul'
              ? {
                  textDecoration: 'underline',
                  textDecorationThickness: '0.18em',
                  textDecorationColor: markColorVar('ul', mark.color),
                  textUnderlineOffset: '0.14em',
                  textDecorationSkipInk: 'none',
                }
              : {}),
          }}
        >
          {mark.text || '—'}
        </span>
      </div>
      {showNugget && (
        <div className="px-3 py-1.5" style={{ borderTop: '1px solid var(--border)' }}>
          <span className="text-xs truncate block" style={{ color: 'var(--muted)' }}>
            {mark.nuggetTitle}
          </span>
        </div>
      )}
    </Link>
  )
}
