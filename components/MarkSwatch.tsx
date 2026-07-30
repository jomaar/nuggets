'use client'

import { markColorVar, type MarkKind } from '@/lib/marking'

/**
 * A single (kind, colour) swatch — a highlight circle or an underline bar with
 * an inset coloured line. Extracted from the legend swatch in the single-nugget
 * Markierungen popup (app/nugget/[id]/page.tsx) so Denkspuren's facet chips use
 * the exact same visual language instead of inventing a new one. No new CSS —
 * reuses the existing hl/ul colour vars via markColorVar.
 */
export default function MarkSwatch({
  kind,
  color,
  size = 20,
}: {
  kind: MarkKind
  color: string
  size?: number
}) {
  return (
    <span
      className="flex-shrink-0 inline-block"
      style={
        kind === 'hl'
          ? {
              width: size,
              height: size,
              borderRadius: '50%',
              background: markColorVar('hl', color),
              border: '1px solid rgba(0,0,0,0.18)',
            }
          : {
              width: size,
              height: size,
              borderRadius: 6,
              background: 'var(--surface)',
              border: '1px solid rgba(0,0,0,0.18)',
              boxShadow: `inset 0 -${Math.round(size * 0.25)}px 0 ${markColorVar('ul', color)}`,
            }
      }
    />
  )
}
