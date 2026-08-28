'use client'

import { useEffect, useRef } from 'react'

/**
 * Long-press detection for the graph nodes (PLAN.md Phase 8 Stufe B): fires
 * `onLongPress` after `delayMs` of stationary contact, otherwise lets the tap
 * through as `onTap`. Touch-first (iPhone PWA) with a mouse fallback for
 * desktop dev testing. Returns a handler factory — call it per element with
 * the payload that identifies what was pressed, and spread the result.
 *
 * Click suppression: after a fired long-press, `preventDefault()` on touchend
 * stops the synthetic click (touchend is NOT in React's passive-listener set,
 * unlike touchstart/touchmove), and the `fired` ref catches any click that
 * slips through anyway.
 *
 * `onPressStart`/`onPressCancel` are optional and exist so a caller can render
 * the countdown (e.g. the filling ring on the hold-to-delete button) without
 * reimplementing any of the gesture handling above. A press that COMPLETES is
 * not a cancel — the visual should stay finished rather than snap back.
 */
export default function useLongPress<T>(
  onLongPress: (payload: T) => void,
  onTap: (payload: T) => void,
  {
    delayMs = 500,
    moveTolerance = 10,
    onPressStart,
    onPressCancel,
  }: {
    delayMs?: number
    moveTolerance?: number
    onPressStart?: () => void
    onPressCancel?: () => void
  } = {},
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fired = useRef(false)
  const start = useRef({ x: 0, y: 0 })
  /** Set while a touch interaction runs — mutes the synthesized mouse events. */
  const touchActive = useRef(false)

  // Never fire into an unmounted component.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  /** Starts the long-press countdown for one pressed element. */
  const arm = (payload: T) => {
    fired.current = false
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      // Cleared BEFORE firing so the touchend that follows sees nothing pending
      // and therefore reports no cancel.
      timer.current = null
      fired.current = true
      onLongPress(payload)
    }, delayMs)
    onPressStart?.()
  }

  /** Cancels a pending (not yet fired) long-press. */
  const disarm = () => {
    if (!timer.current) return
    clearTimeout(timer.current)
    timer.current = null
    onPressCancel?.()
  }

  return (payload: T) => ({
    onTouchStart: (e: React.TouchEvent) => {
      touchActive.current = true
      const touch = e.touches[0]
      start.current = { x: touch.clientX, y: touch.clientY }
      arm(payload)
    },
    onTouchMove: (e: React.TouchEvent) => {
      const touch = e.touches[0]
      const distance = Math.hypot(touch.clientX - start.current.x, touch.clientY - start.current.y)
      if (distance > moveTolerance) disarm()
    },
    onTouchEnd: (e: React.TouchEvent) => {
      disarm()
      if (fired.current) e.preventDefault()
      // Release the mouse-fallback mute after the synthesized events are done.
      setTimeout(() => { touchActive.current = false }, 400)
    },
    onTouchCancel: () => disarm(),
    onMouseDown: (e: React.MouseEvent) => {
      if (touchActive.current) return
      start.current = { x: e.clientX, y: e.clientY }
      arm(payload)
    },
    onMouseUp: () => { if (!touchActive.current) disarm() },
    onMouseLeave: () => { if (!touchActive.current) disarm() },
    onClick: (e: React.MouseEvent) => {
      if (fired.current) {
        e.stopPropagation()
        fired.current = false
        return
      }
      onTap(payload)
    },
    // Kills the iOS press-and-hold callout and the desktop context menu.
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  })
}
