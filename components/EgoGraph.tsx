'use client'

import type { EgoData, EgoNeighbor, EgoNode } from '@/lib/ego'
import DomainIcon, { resolveDomainColor } from '@/components/DomainIcon'
import useLongPress from '@/components/useLongPress'

/**
 * The ego-network view (PLAN.md Phase 8 Stufe B): one node in the centre, its
 * direct neighbours on a radial ring. Deterministic layout — no physics, no
 * graph library — so the picture is calm and always readable on a phone.
 *
 * Two rings:
 *  - Inner ring  = the direct bipartite neighbours (real stored NuggetConcept
 *    edges, drawn as lines whose thickness is the edge relevance).
 *  - Outer ring  = DERIVED proximity (lib/graph.ts): nodes of the SAME type as
 *    the centre, dimmed, no lines (they are not real edges). Tapping one is a
 *    2-hop shortcut. Present only when data.outer is non-empty.
 *
 * Animation: centre + both rings are rendered as ONE keyed list, so when the
 * focus changes a node that survives (the tapped neighbour, an outer node that
 * becomes the centre, the old centre) keeps its DOM element and glides to its
 * new place via a CSS transform transition. Fresh nodes fade in (.ego-enter);
 * edges always remount per focus (key includes the centre) and fade in late.
 */

const RING_RADIUS = 140
const OUTER_RADIUS = 200

type NodeRole = 'center' | 'ring' | 'outer'

/** One node placed on the canvas, with the role deciding size and tap action. */
interface PlacedNode {
  node: EgoNode
  x: number
  y: number
  role: NodeRole
  /** Above the centre line? Decides whether the label sits above or below. */
  above: boolean
  /** Ring nodes only: the edge to the centre (for the connecting line). */
  neighbor?: EgoNeighbor
}

interface EgoGraphProps {
  data: EgoData
  /** Tap on a ring or outer node — the page re-focuses the graph on it. */
  onFocusNode: (node: EgoNode) => void
  /** Tap on the centre node — the page opens its detail sheet. */
  onOpenCenter: (node: EgoNode) => void
  /** Tap on a connecting line — the page shows the edge note. */
  onEdgeTap: (neighbor: EgoNeighbor) => void
  /** Long-press on a ring node — preview sheet without changing focus. */
  onPreviewNode: (neighbor: EgoNeighbor) => void
}

/** Truncates a label to fit the ring; tighter the fuller the ring gets. */
function fitLabel(label: string, ringSize: number): string {
  const max = ringSize <= 8 ? 18 : ringSize <= 12 ? 14 : 10
  return label.length > max ? label.slice(0, max - 1) + '…' : label
}

/** The outline colour of a nugget node: its domain colour, muted when none. */
function nuggetStroke(node: EgoNode): string {
  return node.domain
    ? resolveDomainColor(node.domain.slug, node.domain.color)
    : 'var(--muted)'
}

export default function EgoGraph({ data, onFocusNode, onOpenCenter, onEdgeTap, onPreviewNode }: EgoGraphProps) {
  const ringSize = data.neighbors.length
  const outer = data.outer ?? []
  const hasOuter = outer.length > 0

  // The viewBox grows only when a second ring is present, so the verified
  // single-ring layout stays pixel-identical; with an outer ring we zoom out.
  const VIEW_W = hasOuter ? 460 : 400
  const VIEW_H = hasOuter ? 470 : 420
  const CX = VIEW_W / 2
  const CY = VIEW_H / 2 + 10 // small downward bias: leaves room for top labels

  // Ring nodes: short tap = hop, long-press = preview without focus change.
  const ringPressHandlers = useLongPress<EgoNeighbor>(
    onPreviewNode,
    neighbor => onFocusNode(neighbor.node),
  )

  // Deterministic radial placement: strongest edge starts at 12 o'clock, the
  // rest follow clockwise (the API sorts by relevance, so the order is stable).
  // Outer nodes are offset by a half-step so they fall in the ring's gaps.
  const placed: PlacedNode[] = [
    { node: data.center, x: CX, y: CY, role: 'center', above: false },
    ...data.neighbors.map((neighbor, i) => {
      const angle = ((-90 + (i * 360) / ringSize) * Math.PI) / 180
      const y = CY + RING_RADIUS * Math.sin(angle)
      return {
        node: neighbor.node,
        x: CX + RING_RADIUS * Math.cos(angle),
        y,
        role: 'ring' as const,
        above: y < CY - 1,
        neighbor,
      }
    }),
    ...outer.map((node, i) => {
      const angle = ((-90 + ((i + 0.5) * 360) / outer.length) * Math.PI) / 180
      const y = CY + OUTER_RADIUS * Math.sin(angle)
      return {
        node,
        x: CX + OUTER_RADIUS * Math.cos(angle),
        y,
        role: 'outer' as const,
        above: y < CY - 1,
      }
    }),
  ]

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="w-full select-none"
      role="img"
      aria-label={`Netz um ${data.center.label}`}
      style={{ WebkitTouchCallout: 'none' }}
    >
      {/* Edge layer — always below the nodes. Inner ring only (outer nodes are
          derived proximity, not real edges → no lines). Keyed per centre so a
          focus change remounts them at the new geometry and replays the fade-in. */}
      {placed
        .filter(p => p.role === 'ring')
        .map(p => {
          const edge = p.neighbor!.edge
          // The note dot sits slightly past the midpoint, clear of the centre shape.
          const dotX = CX + (p.x - CX) * 0.55
          const dotY = CY + (p.y - CY) * 0.55
          return (
            <g key={`edge:${data.center.id}:${p.node.id}`} className="ego-enter-late">
              <line
                x1={CX} y1={CY} x2={p.x} y2={p.y}
                stroke="var(--accent)"
                strokeOpacity={0.28}
                strokeWidth={1 + edge.relevance * 2.5}
              />
              {/* Invisible wide twin = comfortable touch target for the edge tap. */}
              <line
                x1={CX} y1={CY} x2={p.x} y2={p.y}
                stroke="transparent"
                strokeWidth={26}
                style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                onClick={() => onEdgeTap(p.neighbor!)}
              />
              {/* A note on the edge is the graph's USP — flag it with a dot. */}
              {edge.note && (
                <circle
                  cx={dotX} cy={dotY} r={4}
                  fill="var(--accent)"
                  stroke="var(--surface)"
                  strokeWidth={1.5}
                  pointerEvents="none"
                />
              )}
            </g>
          )
        })}

      {/* Node layer — one keyed list across roles, so role changes glide (an
          outer node tapped into the centre brightens as it slides inward). */}
      {placed.map(p => {
        const handlers =
          p.role === 'center' ? { onClick: () => onOpenCenter(p.node) }
          : p.role === 'ring' ? ringPressHandlers(p.neighbor!)
          : { onClick: () => onFocusNode(p.node) }
        return (
          <g
            key={`${p.node.type}:${p.node.id}`}
            className="ego-enter"
            style={{
              transform: `translate(${p.x}px, ${p.y}px)`,
              transition: 'transform 480ms cubic-bezier(0.22, 0.9, 0.3, 1), opacity 480ms ease',
              cursor: 'pointer',
              opacity: p.role === 'outer' ? 0.45 : 1,
            }}
            {...handlers}
          >
            {p.node.type === 'concept'
              ? <ConceptShape node={p.node} role={p.role} above={p.above} ringSize={ringSize} />
              : <NuggetShape node={p.node} role={p.role} above={p.above} ringSize={ringSize} />}
          </g>
        )
      })}
    </svg>
  )
}

/** Shared label under (lower half) or above (upper half) a node, so the text
 *  never lies across its own edge; the centre label always sits below. */
function NodeLabel({ node, role, above, extent, ringSize }: {
  node: EgoNode
  role: NodeRole
  above: boolean
  /** Half-height of the node shape the label must clear. */
  extent: number
  ringSize: number
}) {
  const gap = role === 'outer' ? 10 : 16
  return (
    <text
      y={above ? -(extent + 8) : extent + gap}
      textAnchor="middle"
      style={{
        fontSize: role === 'center' ? 12.5 : role === 'outer' ? 8.5 : 10,
        fontWeight: role === 'center' ? 600 : 400,
        fill: role === 'center' ? 'var(--ink)' : 'var(--muted)',
      }}
    >
      {role === 'center'
        ? (node.label.length > 26 ? node.label.slice(0, 25) + '…' : node.label)
        : role === 'outer'
        ? (node.label.length > 9 ? node.label.slice(0, 8) + '…' : node.label)
        : fitLabel(node.label, ringSize)}
    </text>
  )
}

/** Concept = circle (abstract node); the number inside is its nugget count. */
function ConceptShape({ node, role, above, ringSize }: {
  node: EgoNode; role: NodeRole; above: boolean; ringSize: number
}) {
  const r = role === 'center' ? 30 : role === 'outer' ? 11 : 18
  return (
    <>
      {/* Oversized invisible twin = touch target beyond the visible shape. */}
      <circle r={r + 8} fill="transparent" />
      <circle
        r={r}
        fill={role === 'center' ? 'var(--accent-tint)' : 'var(--surface)'}
        stroke="var(--accent)"
        strokeWidth={role === 'center' ? 2 : role === 'outer' ? 1 : 1.5}
      />
      <text
        textAnchor="middle"
        dy={role === 'center' ? 4.5 : role === 'outer' ? 3 : 3.5}
        style={{
          fontSize: role === 'center' ? 13 : role === 'outer' ? 8 : 10,
          fill: role === 'center' ? 'var(--accent)' : 'var(--muted)',
        }}
      >
        {node.degree}
      </text>
      <NodeLabel node={node} role={role} above={above} extent={r} ringSize={ringSize} />
    </>
  )
}

/** Nugget = card (concrete text); outline + icon carry the domain colour. */
function NuggetShape({ node, role, above, ringSize }: {
  node: EgoNode; role: NodeRole; above: boolean; ringSize: number
}) {
  const w = role === 'center' ? 88 : role === 'outer' ? 38 : 60
  const h = role === 'center' ? 52 : role === 'outer' ? 22 : 34
  const iconSize = role === 'center' ? 18 : role === 'outer' ? 10 : 14
  return (
    <>
      <rect x={-w / 2 - 6} y={-h / 2 - 6} width={w + 12} height={h + 12} fill="transparent" />
      <rect
        x={-w / 2} y={-h / 2} width={w} height={h}
        rx={role === 'center' ? 14 : role === 'outer' ? 7 : 10}
        fill="var(--surface)"
        stroke={nuggetStroke(node)}
        strokeWidth={role === 'center' ? 2 : role === 'outer' ? 1 : 1.5}
      />
      {/* Lucide renders an <svg>; nested svg-in-svg positions via the wrapper g. */}
      <g transform={`translate(${-iconSize / 2}, ${-iconSize / 2})`}>
        <DomainIcon
          slug={node.domain?.slug ?? ''}
          icon={node.domain?.icon}
          color={node.domain?.color}
          size={iconSize}
          colored
        />
      </g>
      <NodeLabel node={node} role={role} above={above} extent={h / 2} ringSize={ringSize} />
    </>
  )
}
