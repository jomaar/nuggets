'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import DomainIcon, { resolveDomainColor } from '@/components/DomainIcon'
import type { EgoData, EgoNeighbor, EgoNode } from '@/lib/ego'

/**
 * The graph bottom sheet (PLAN.md Phase 8 Stufe B): shows the selected node in
 * detail without leaving the graph. iOS pattern — draggable between a peek and
 * an expanded snap point, deliberately WITHOUT a backdrop so the graph behind
 * stays visible, tappable and hoppable. While open it covers the BottomNav
 * (z-index above it), like native iOS sheets cover the tab bar; the nav is
 * back the moment the sheet closes.
 */

/**
 * What the sheet is showing. 'neighbor' covers both the long-press preview of
 * a ring node and a tapped edge — EgoNeighbor bundles exactly that pair, and
 * both gestures ask the same question: "what is this node, and why is it
 * linked to the centre?"
 */
export type SheetSelection =
  | { kind: 'center' }
  | { kind: 'neighbor'; neighbor: EgoNeighbor }

/** Sheet height as a fraction of the viewport when fully expanded. */
const EXPANDED_VH = 0.85
/** Visible fraction of the viewport in the peek state. */
const PEEK_VH = 0.4
/** Peek = the sheet pushed down so only PEEK_VH of the viewport stays visible. */
const PEEK_OFFSET_PCT = (1 - PEEK_VH / EXPANDED_VH) * 100
/** Finger travel that turns a touch into a drag instead of a tap. */
const DRAG_INTENT_PX = 8
/** Releasing this far below the peek position closes the sheet. */
const CLOSE_SLACK_PX = 80
/** Flick speed (px/ms) that overrides the positional snap decision. */
const FLICK_VELOCITY = 0.5
/** Snap / slide-out duration; mirrored by the .sheet-enter keyframe. */
const SLIDE_MS = 320
/** The iOS sheet curve. */
const SLIDE_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'

type Snap = 'peek' | 'expanded'

interface GraphSheetProps {
  /** The loaded ego data; centre + neighbours feed both content cases. */
  data: EgoData
  /** What to show; the parent owns this and unmounts the sheet on null. */
  selection: SheetSelection
  /** Called after the slide-out animation has finished (or X was tapped). */
  onClose: () => void
  /** "Öffnen": leave the graph for the node's regular detail page. */
  onOpenNode: (node: EgoNode) => void
  /** Hop from inside the sheet (neighbour rows in the centre case). */
  onFocusNode: (node: EgoNode) => void
}

export default function GraphSheet({ data, selection, onClose, onOpenNode, onFocusNode }: GraphSheetProps) {
  const [snap, setSnap] = useState<Snap>('peek')
  /** px offset from fully-expanded while a drag is active; null = resting. */
  const [dragOffset, setDragOffset] = useState<number | null>(null)
  const [closing, setClosing] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  /** Gesture bookkeeping in a ref — no re-renders for untracked samples. */
  const gesture = useRef({
    down: false, active: false, moved: false, pointerId: 0,
    startY: 0, startOffset: 0, height: 1,
    lastY: 0, lastT: 0, prevY: 0, prevT: 0,
  })

  // A new selection while the slide-out is still running revives the sheet
  // (tap edge → close → quickly tap another edge).
  useEffect(() => { setClosing(false) }, [selection])

  /** Animates the sheet out, then tells the parent to unmount it. The timeout
   *  (not transitionend) keeps the close robust when the tab is backgrounded. */
  const requestClose = useCallback(() => {
    setClosing(true)
    setTimeout(onClose, SLIDE_MS)
  }, [onClose])

  /** The peek resting offset in px, valid for the measured sheet height. */
  const peekOffsetPx = () => (gesture.current.height * PEEK_OFFSET_PCT) / 100

  /** Pointer down records the touch and captures the pointer — the visual
   *  drag itself only starts on movement, so stationary taps stay taps.
   *  Mouse pointers have no implicit capture (touch does), so without this an
   *  upward mouse drag leaves the element and stalls. Buttons are exempt:
   *  capture would retarget their trailing click and swallow the tap. */
  const onDragDown = (e: React.PointerEvent) => {
    const g = gesture.current
    if (!(e.target instanceof Element && e.target.closest('button'))) {
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    g.down = true
    g.active = false
    g.moved = false
    g.pointerId = e.pointerId
    g.height = sheetRef.current?.getBoundingClientRect().height ?? 1
    g.startY = e.clientY
    g.startOffset = snap === 'expanded' ? 0 : peekOffsetPx()
    g.lastY = g.prevY = e.clientY
    g.lastT = g.prevT = e.timeStamp
  }

  const onDragMove = (e: React.PointerEvent) => {
    const g = gesture.current
    if (!g.down) return
    if (!g.active) {
      if (Math.abs(e.clientY - g.startY) < DRAG_INTENT_PX) return
      g.active = true
      g.moved = true
    }
    g.prevY = g.lastY
    g.prevT = g.lastT
    g.lastY = e.clientY
    g.lastT = e.timeStamp
    const offset = g.startOffset + (e.clientY - g.startY)
    setDragOffset(Math.min(Math.max(offset, 0), g.height))
  }

  /** Snap decision on release: a flick wins, otherwise the nearest rest. */
  const onDragUp = () => {
    const g = gesture.current
    g.down = false
    if (!g.active) return
    g.active = false
    const offset = g.startOffset + (g.lastY - g.startY)
    const velocity = (g.lastY - g.prevY) / Math.max(1, g.lastT - g.prevT)
    const peek = peekOffsetPx()
    setDragOffset(null)
    if (velocity > FLICK_VELOCITY) {
      // Downward flick: one step down from wherever the sheet currently is.
      if (offset < peek - CLOSE_SLACK_PX) setSnap('peek')
      else requestClose()
    } else if (velocity < -FLICK_VELOCITY) {
      setSnap('expanded')
    } else if (offset < peek / 2) {
      setSnap('expanded')
    } else if (offset > peek + CLOSE_SLACK_PX) {
      requestClose()
    } else {
      setSnap('peek')
    }
  }

  /** After a real drag, the trailing click must not hit a row or button. */
  const suppressClickAfterDrag = (e: React.MouseEvent) => {
    if (gesture.current.moved) {
      e.preventDefault()
      e.stopPropagation()
      gesture.current.moved = false
    }
  }

  const dragHandlers = {
    onPointerDown: onDragDown,
    onPointerMove: onDragMove,
    onPointerUp: onDragUp,
    onPointerCancel: onDragUp,
  }

  const node = selection.kind === 'center' ? data.center : selection.neighbor.node
  const isPeek = snap === 'peek' && !closing

  // Resting position is a percentage of the sheet's own height, so no
  // measurement is needed outside of drags; dragging switches to px.
  const restingPct = closing ? 100 : snap === 'peek' ? PEEK_OFFSET_PCT : 0
  const transform = dragOffset !== null ? `translateY(${dragOffset}px)` : `translateY(${restingPct}%)`
  const transition = dragOffset !== null ? 'none' : `transform ${SLIDE_MS}ms ${SLIDE_EASE}`

  return (
    <div
      ref={sheetRef}
      role="dialog"
      aria-modal={false}
      aria-label={node.label}
      className="fixed left-0 right-0 bottom-0 z-[60] flex flex-col sheet-enter"
      style={{
        height: `${EXPANDED_VH * 100}dvh`,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderBottom: 'none',
        borderRadius: '20px 20px 0 0',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        transform,
        transition,
      }}
      onClickCapture={suppressClickAfterDrag}
    >
      {/* Header = always a drag zone (touch-action none, see useLongPress note
          on React's passive listeners: blocking scroll must be declarative). */}
      <div className="touch-none" {...dragHandlers}>
        <div
          className="mx-auto mt-2.5 h-1.5 w-9 rounded-full"
          style={{ background: 'var(--border)' }}
        />
        <div className="flex items-center gap-4 px-5 pt-2 pb-3">
          <p className="flex-1 text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>
            {node.label}
          </p>
          <button
            onClick={() => onOpenNode(node)}
            className="text-xs font-medium shrink-0"
            style={{ color: 'var(--accent)' }}
          >
            Öffnen
          </button>
          <button onClick={requestClose} aria-label="Schließen" className="shrink-0" style={{ color: 'var(--muted)' }}>
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Content: scrolls natively when expanded; in peek it is one more drag
          zone instead, which sidesteps any scroll-vs-drag arbitration. */}
      <div
        className={
          isPeek
            ? 'flex-1 min-h-0 overflow-hidden touch-none px-5 pb-6'
            : 'flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-6'
        }
        {...(isPeek ? dragHandlers : {})}
      >
        {selection.kind === 'center'
          ? <CenterDetail data={data} onFocusNode={onFocusNode} />
          : <NeighborDetail center={data.center} neighbor={selection.neighbor} />}
      </div>
    </div>
  )
}

/** Centre case: the focused node in detail plus all its links with notes. */
function CenterDetail({ data, onFocusNode }: {
  data: EgoData
  onFocusNode: (node: EgoNode) => void
}) {
  return (
    <>
      <NodeChip node={data.center} />
      {data.center.description && (
        <p className="text-sm mt-3" style={{ color: 'var(--ink)', lineHeight: 1.6 }}>
          {data.center.description}
        </p>
      )}
      <p className="text-xs font-medium mt-5 mb-1" style={{ color: 'var(--muted)' }}>
        Verbindungen ({data.neighbors.length})
      </p>
      <ul>
        {data.neighbors.map(neighbor => (
          <li key={`${neighbor.node.type}:${neighbor.node.id}`}>
            <button
              onClick={() => onFocusNode(neighbor.node)}
              className="w-full text-left py-2.5 flex flex-col gap-1"
              style={{ borderTop: '1px solid var(--border)' }}
            >
              <span className="flex items-center gap-2">
                <NodeGlyph node={neighbor.node} />
                <span className="text-sm flex-1 truncate" style={{ color: 'var(--ink)' }}>
                  {neighbor.node.label}
                </span>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  {neighbor.node.degree}
                </span>
              </span>
              {neighbor.edge.note && (
                <span
                  className="text-xs"
                  style={{
                    color: 'var(--muted)',
                    lineHeight: 1.5,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {neighbor.edge.note}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

/** Neighbour case (ring preview / edge tap): the node plus its edge note. */
function NeighborDetail({ center, neighbor }: {
  center: EgoNode
  neighbor: EgoNeighbor
}) {
  return (
    <>
      <NodeChip node={neighbor.node} />
      <p className="text-xs font-medium mt-4 mb-1" style={{ color: 'var(--muted)' }}>
        {center.label} <span style={{ opacity: 0.6 }}>↔</span> {neighbor.node.label}
      </p>
      <p
        className="text-sm"
        style={{ color: neighbor.edge.note ? 'var(--ink)' : 'var(--muted)', lineHeight: 1.6 }}
      >
        {neighbor.edge.note ?? 'Keine Notiz an dieser Kante.'}
      </p>
      {neighbor.node.description && (
        <p className="text-sm mt-4" style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
          {neighbor.node.description}
        </p>
      )}
    </>
  )
}

/** Type chip: concept = accent pill, nugget = its domain icon and colour. */
function NodeChip({ node }: { node: EgoNode }) {
  if (node.type === 'concept') {
    return (
      <span
        className="inline-flex items-center text-xs px-2.5 py-1 rounded-full"
        style={{ background: 'var(--accent-tint)', color: 'var(--accent)' }}
      >
        Konzept · {node.degree} {node.degree === 1 ? 'Nugget' : 'Nuggets'}
      </span>
    )
  }
  const color = node.domain ? resolveDomainColor(node.domain.slug, node.domain.color) : 'var(--muted)'
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
      style={{ border: `1px solid ${color}`, color }}
    >
      <DomainIcon
        slug={node.domain?.slug ?? ''}
        icon={node.domain?.icon}
        color={node.domain?.color}
        size={13}
        colored
      />
      Nugget · {node.degree} {node.degree === 1 ? 'Konzept' : 'Konzepte'}
    </span>
  )
}

/** Tiny row glyph mirroring the graph shapes: concept = circle, nugget = icon. */
function NodeGlyph({ node }: { node: EgoNode }) {
  if (node.type === 'concept') {
    return (
      <span
        className="inline-block w-3.5 h-3.5 rounded-full shrink-0"
        style={{ border: '1.5px solid var(--accent)', background: 'var(--accent-tint)' }}
      />
    )
  }
  return (
    <DomainIcon
      slug={node.domain?.slug ?? ''}
      icon={node.domain?.icon}
      color={node.domain?.color}
      size={14}
      colored
      className="shrink-0"
    />
  )
}
