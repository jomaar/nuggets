'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronsDown, ChevronsUp } from 'lucide-react'

/** Distance (px) from the document end below which the jump-down button hides. */
const NEAR_END_PX = 600
/** Minimum scrollable height (px) before the button appears at all. */
const MIN_SCROLLABLE_PX = 1200

/**
 * Floating semi-transparent button (bottom-right, above the BottomNav) that
 * jumps to the end of the document. After the jump it turns into a return
 * button that restores the previous reading position (Gmail/GitHub pattern).
 * The return offer is dropped once the reader scrolls more than a viewport
 * away from the end on their own — they have taken over navigation.
 *
 * Jumps are instant (not smooth): on long nuggets a smooth scroll over tens of
 * thousands of px is slow, and an instant jump keeps the scroll handler simple
 * (no need to tell programmatic scrolling apart from user scrolling).
 */
export default function ScrollJumpButton() {
  // What the button currently offers: jump down, jump back up, or hidden.
  const [mode, setMode] = useState<'down' | 'up' | null>(null)
  // Reading position to restore after a jump to the end (null = no jump active).
  const returnTo = useRef<number | null>(null)

  useEffect(() => {
    /** Re-derive the button mode from the current scroll geometry. */
    const update = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight
      if (maxScroll < MIN_SCROLLABLE_PX) {
        returnTo.current = null
        setMode(null)
        return
      }
      const fromEnd = maxScroll - window.scrollY
      if (returnTo.current !== null) {
        // Keep offering the return jump while the reader stays near the end.
        if (fromEnd > window.innerHeight) {
          returnTo.current = null
          setMode(fromEnd > NEAR_END_PX ? 'down' : null)
        } else {
          setMode('up')
        }
      } else {
        setMode(fromEnd > NEAR_END_PX ? 'down' : null)
      }
    }

    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    // The Tiptap reader renders async and grows the page after mount — watch
    // the document size too, or the button would miss the content appearing.
    const observer = new ResizeObserver(update)
    observer.observe(document.documentElement)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      observer.disconnect()
    }
  }, [])

  /** Jump to the document end, remembering where the reader came from. */
  const jumpToEnd = () => {
    returnTo.current = window.scrollY
    window.scrollTo({ top: document.documentElement.scrollHeight })
    // Set the mode here rather than waiting for the scroll event: a jump that
    // doesn't move (already at the end) fires no event at all.
    setMode('up')
  }

  /** Jump back to the position remembered before the last jump to the end. */
  const jumpBack = () => {
    const top = returnTo.current ?? 0
    returnTo.current = null
    window.scrollTo({ top })
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight
    setMode(maxScroll - top > NEAR_END_PX ? 'down' : null)
  }

  if (mode === null) return null

  return (
    <button
      onClick={mode === 'down' ? jumpToEnd : jumpBack}
      aria-label={mode === 'down' ? 'Ans Ende springen' : 'Zurück zur Leseposition'}
      className="fixed right-4 z-40 flex items-center justify-center w-10 h-10 rounded-full opacity-60 transition-opacity active:opacity-100"
      style={{
        // Clear the fixed BottomNav (~56px) plus the iOS home-bar inset.
        bottom: 'calc(68px + env(safe-area-inset-bottom))',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
        color: 'var(--muted)',
      }}
    >
      {mode === 'down' ? <ChevronsDown size={20} /> : <ChevronsUp size={20} />}
    </button>
  )
}
