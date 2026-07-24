/**
 * Weighted community detection (Louvain, local-moving phase) on an undirected
 * weighted graph.
 *
 * Why this exists: the derived concept↔concept cosine graph (see
 * {@link ./graph.KnowledgeGraph.relatedConcepts}) is DENSE — in the real material
 * the whole Bible/theology shares Greek vocabulary, so naive connected-components
 * collapses everything into one blob (verified on the prod snapshot: a single
 * 45-concept component). Modularity-based detection instead asks "which groups are
 * more densely tied to each OTHER than to the rest?", which is what actually
 * separates themes. On the snapshot this yields Q = 0.632 with ~13 human-readable
 * communities (Hebrews/priesthood, Corinthian apology, being-in-Christ, …).
 *
 * Scope: a single hierarchical level (local moving repeated to convergence). For a
 * personal-scale graph (tens of concepts) that already reaches strong modularity,
 * so the graph-aggregation passes of full Louvain are intentionally omitted —
 * fewer moving parts, and the result is what the theme-engine gate was verified on.
 *
 * DETERMINISM is a hard requirement here, not a nicety: the theme engine hashes a
 * community's member set into its cache key (`inputHash`). If the partition jittered
 * between runs on identical input, every run would bust the cache and re-spend
 * tokens. So the algorithm is made order-stable — nodes are visited in sorted id
 * order and candidate communities are evaluated in sorted order, breaking gain ties
 * deterministically by community id. Same graph in ⇒ same partition out.
 *
 * Pure graph maths: no DB, no dependency on the app's graph classes. The caller
 * supplies nodes + weighted undirected edges; adapting the KnowledgeGraph into that
 * shape lives in `lib/conceptCommunities.ts`, keeping this file reusable and testable.
 */

/** One undirected weighted edge. `a`/`b` order is irrelevant; weight must be > 0. */
export interface WeightedEdge {
  a: string
  b: string
  weight: number
}

/** The detected partition plus the quality of the split. */
export interface CommunityResult {
  /** Communities as arrays of node ids, largest first; each id appears once. */
  communities: string[][]
  /** Modularity Q of the final partition (>0.3 = usable, >0.5 = strong structure). */
  modularity: number
  /** Local-moving sweeps performed until convergence (diagnostic). */
  rounds: number
}

/**
 * Runs weighted Louvain local moving on one graph instance. Encapsulates all
 * mutable state (community assignment, per-community degree sums) so there are no
 * shared globals; construct with the graph, call {@link run} once.
 */
export class Louvain {
  /** Node ids in the deterministic visiting order (sorted). */
  private readonly nodes: string[]
  /** Symmetric weighted adjacency: node → (neighbour → weight). No self-loops. */
  private readonly adjacency: Map<string, Map<string, number>>
  /** Weighted degree of each node (sum of incident edge weights). */
  private readonly degree: Map<string, number>
  /** Twice the total edge weight (2m), the modularity normaliser. */
  private readonly twoM: number
  /** Current community of each node (id of a representative node). */
  private readonly community: Map<string, string>
  /** Sum of node degrees currently in each community (Σtot). */
  private readonly communityDegree: Map<string, number>

  /**
   * Builds the symmetric adjacency and initialises every node in its own
   * singleton community. Parallel edges are summed; self-loops are ignored (the
   * cosine graph never produces them). Zero/negative weights are skipped.
   */
  constructor(nodes: string[], edges: WeightedEdge[]) {
    // Sorted, de-duplicated node order → the whole run is deterministic.
    this.nodes = [...new Set(nodes)].sort()

    this.adjacency = new Map()
    for (const id of this.nodes) this.adjacency.set(id, new Map())
    for (const { a, b, weight } of edges) {
      if (a === b || weight <= 0) continue
      const na = this.adjacency.get(a)
      const nb = this.adjacency.get(b)
      if (!na || !nb) continue // edge referencing an unknown node — ignore
      na.set(b, (na.get(b) ?? 0) + weight)
      nb.set(a, (nb.get(a) ?? 0) + weight)
    }

    this.degree = new Map()
    let total = 0
    for (const id of this.nodes) {
      let d = 0
      for (const w of this.adjacency.get(id)!.values()) d += w
      this.degree.set(id, d)
      total += d
    }
    this.twoM = total // Σ over all nodes of their weighted degree = 2m

    this.community = new Map()
    this.communityDegree = new Map()
    for (const id of this.nodes) {
      this.community.set(id, id)
      this.communityDegree.set(id, this.degree.get(id)!)
    }
  }

  /**
   * Local-moving to convergence: repeatedly try to move each node into the
   * neighbouring community that yields the largest positive modularity gain, until
   * a full sweep moves nothing (or a safety cap is hit). Returns the final
   * communities (largest first) and the partition's modularity.
   */
  run(maxRounds = 100): CommunityResult {
    let improved = true
    let rounds = 0
    while (improved && rounds < maxRounds) {
      improved = false
      rounds++
      for (const node of this.nodes) {
        if (this.moveNode(node)) improved = true
      }
    }
    return { communities: this.collectCommunities(), modularity: this.modularity(), rounds }
  }

  /**
   * Considers moving one node to its best neighbouring community. Isolates the
   * node first (so its own degree doesn't bias the gain), then picks the community
   * with the highest gain `kIn(c) − Σtot(c)·k(node)/2m`. Candidates are the node's
   * current community plus its neighbours' communities, evaluated in sorted order
   * so ties resolve deterministically. Returns true iff the node actually changed.
   */
  private moveNode(node: string): boolean {
    const current = this.community.get(node)!
    const k = this.degree.get(node)!

    // Remove the node from its community for the duration of the evaluation.
    this.communityDegree.set(current, this.communityDegree.get(current)! - k)

    const candidates = new Set<string>([current])
    for (const neighbour of this.adjacency.get(node)!.keys()) {
      candidates.add(this.community.get(neighbour)!)
    }

    let best = current
    let bestGain = -Infinity
    for (const c of [...candidates].sort()) {
      const gain = this.weightToCommunity(node, c) - (this.communityDegree.get(c)! * k) / this.twoM
      if (gain > bestGain) {
        bestGain = gain
        best = c
      }
    }

    // Re-insert the node into the chosen community.
    this.community.set(node, best)
    this.communityDegree.set(best, this.communityDegree.get(best)! + k)
    return best !== current
  }

  /** Sum of edge weights from `node` to nodes currently in `community` (no self). */
  private weightToCommunity(node: string, community: string): number {
    let sum = 0
    for (const [neighbour, weight] of this.adjacency.get(node)!) {
      if (neighbour !== node && this.community.get(neighbour) === community) sum += weight
    }
    return sum
  }

  /** Groups nodes by their final community, returning arrays largest-first. */
  private collectCommunities(): string[][] {
    const groups = new Map<string, string[]>()
    for (const id of this.nodes) {
      const c = this.community.get(id)!
      if (!groups.has(c)) groups.set(c, [])
      groups.get(c)!.push(id)
    }
    return [...groups.values()].sort((a, b) => b.length - a.length)
  }

  /**
   * Modularity of the current partition:
   * Q = (1/2m) · Σ_{i,j in same community} (A_ij − k_i·k_j / 2m).
   * >0.3 indicates usable community structure, >0.5 a strong one.
   */
  private modularity(): number {
    if (this.twoM === 0) return 0
    let q = 0
    for (const id of this.nodes) {
      const ki = this.degree.get(id)!
      for (const [neighbour, weight] of this.adjacency.get(id)!) {
        if (this.community.get(id) === this.community.get(neighbour)) {
          q += weight - (ki * this.degree.get(neighbour)!) / this.twoM
        }
      }
    }
    return q / this.twoM
  }
}
