'use client'

import { useEffect, useRef, type RefObject } from 'react'

/**
 * Tracks the last non-collapsed DOM selection inside `containerRef` via
 * `selectionchange` — the raw material for any selection-triggered action
 * (comment, copy-link, "Naheliegendes"). Reading the selection directly in a
 * click handler is too late: by the time it runs, iOS may already have
 * collapsed it (tapping a button itself can clear the selection first).
 *
 * Extracted from app/nugget/[id]/page.tsx (Spinnennetz Stufe 2) so both the
 * main reading view and components/PeekTabView.tsx share one implementation
 * instead of two copies of the same effect.
 */
export function useSelectionRange(containerRef: RefObject<HTMLElement | null>) {
  const selectionRangeRef = useRef<Range | null>(null)

  useEffect(() => {
    const onSelectionChange = () => {
      const sel = document.getSelection()
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return
      const range = sel.getRangeAt(0)
      if (!containerRef.current?.contains(range.commonAncestorContainer)) return
      selectionRangeRef.current = range.cloneRange()
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [containerRef])

  return selectionRangeRef
}
