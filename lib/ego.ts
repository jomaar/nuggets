/**
 * Shared shapes for the ego-network view (/graph, PLAN.md Phase 8 Stufe B).
 * One node sits in the centre, its direct bipartite neighbours form the ring.
 * These types are the contract between the API route (app/api/graph/ego) and
 * the SVG component (components/EgoGraph.tsx).
 */

export type EgoNodeType = 'concept' | 'nugget'

/** Domain styling needed to render a nugget node (DB-driven icon + colour). */
export interface EgoDomainStyle {
  slug: string
  icon: string | null
  color: string | null
}

/** One node of the ego network — either an abstract concept or a nugget. */
export interface EgoNode {
  type: EgoNodeType
  id: string
  label: string
  /** How many bipartite edges the node has in total (its full degree). */
  degree: number
  /** Body text for detail contexts: a concept's abstract description, or a
   *  short contentPlain excerpt when the node is a nugget centre. */
  description?: string
  /** Nugget nodes only: domain styling; null when the nugget has no domain. */
  domain?: EgoDomainStyle | null
}

/** The real stored edge (NuggetConcept) between the centre and a neighbour. */
export interface EgoEdge {
  relevance: number
  /** The edge reading: what THIS nugget says about the concept (the WHY). */
  note: string | null
}

/** A ring node together with the edge that ties it to the centre. */
export interface EgoNeighbor {
  node: EgoNode
  edge: EgoEdge
}

/** Everything the ego view needs for one focused node. */
export interface EgoData {
  center: EgoNode
  /** Sorted by edge relevance (desc), so the layout is deterministic. */
  neighbors: EgoNeighbor[]
  /** Second ring: nodes of the SAME type as the centre, reached by DERIVED
   *  proximity (lib/graph.ts) — "what lies behind". No stored edge ties them to
   *  the centre; tapping one is a 2-hop shortcut. Sorted by closeness (desc).
   *  Absent/empty when the centre has no proximity neighbours. */
  outer?: EgoNode[]
}
