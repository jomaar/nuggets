'use client'

import { useEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import useLongPress from './useLongPress'

/** Radius of the countdown ring inside its 24×24 viewBox (leaves room for the stroke). */
const RING_RADIUS = 10.5
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

/**
 * Destructive action behind a deliberate GESTURE instead of a second tap: the
 * ring around the icon fills while the button is held and only then does the
 * action fire. A stray tap can't delete anything, and there is no armed state
 * left hanging around afterwards (the old two-tap flow needed a cancel button
 * next to it and changed the toolbar's button count mid-interaction).
 *
 * A short tap is not silently ignored — it swaps the label to the instruction
 * for a moment, so the gesture is discovered on the first mistake.
 *
 * The ring is driven purely by a CSS transition whose duration IS `holdMs`;
 * only the firing itself is timed in JS (by `useLongPress`, which also brings
 * the move tolerance, the synthetic-click suppression and the iOS
 * press-and-hold callout fix).
 */
export default function HoldToDeleteButton({
  onConfirm,
  label = 'Löschen',
  hint = 'Halten zum Löschen',
  holdMs = 650,
  color = 'var(--act-delete)',
  className = '',
}: {
  onConfirm: () => void
  label?: string
  hint?: string
  holdMs?: number
  color?: string
  className?: string
}) {
  const [pressing, setPressing] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (hintTimer.current) clearTimeout(hintTimer.current) }, [])

  const press = useLongPress<void>(
    () => onConfirm(),
    () => {
      setShowHint(true)
      if (hintTimer.current) clearTimeout(hintTimer.current)
      hintTimer.current = setTimeout(() => setShowHint(false), 1600)
    },
    {
      delayMs: holdMs,
      onPressStart: () => setPressing(true),
      onPressCancel: () => setPressing(false),
    },
  )

  return (
    <button
      type="button"
      {...press()}
      aria-label={hint}
      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg select-none transition-colors ${className}`}
      style={{
        color,
        background: pressing ? `color-mix(in srgb, ${color} 14%, transparent)` : 'transparent',
        border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
      }}
    >
      <span className="relative inline-flex items-center justify-center w-[22px] h-[22px] shrink-0">
        <svg viewBox="0 0 24 24" className="absolute inset-0 w-full h-full" aria-hidden>
          <circle
            cx="12"
            cy="12"
            r={RING_RADIUS}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            // Full offset = empty ring; 0 = closed ring. Filling takes the whole
            // hold, releasing snaps back quickly so an aborted press reads as one.
            strokeDashoffset={pressing ? 0 : RING_CIRCUMFERENCE}
            style={{ transition: `stroke-dashoffset ${pressing ? holdMs : 150}ms linear` }}
            transform="rotate(-90 12 12)"
          />
        </svg>
        <Trash2 size={12} />
      </span>
      {showHint ? hint : label}
    </button>
  )
}
