import { prisma } from './prisma'

/**
 * One scored neighbour of a target nugget — another nugget that shares concepts
 * with it. `score` is the cosine similarity (0..1) of the two concept vectors.
 */
export interface RelatedNugget {
  id: string
  title: string
  score: number
  /** The abstract concept nodes both nuggets hang on (the reason they are close). */
  sharedConcepts: { id: string; term: string }[]
}

/**
 * One scored neighbour of a target concept — another concept that co-occurs with
 * it across shared nuggets. `score` is the cosine similarity (0..1).
 */
export interface RelatedConcept {
  id: string
  term: string
  score: number
  /** How many nuggets carry both concepts (the strength of the co-occurrence). */
  sharedNuggets: number
}

/** A single Nugget↔Concept edge, reduced to what the proximity maths needs. */
interface Edge {
  nuggetId: string
  conceptId: string
  relevance: number
}

/** A sparse weighted vector: maps the opposite-side id to its weight. */
type Vector = Map<string, number>

/**
 * In-memory projection of the bipartite Nugget↔Concept graph for proximity
 * queries. The stored graph only ever connects the two sides (an edge is always
 * nugget→concept, never nugget→nugget or concept→concept). "Closeness" between
 * two nuggets — or two concepts — is therefore not a stored edge but a value
 * DERIVED from their shared neighbours, exactly as decided in PLAN.md Phase 5g:
 * we read co-occurrence on the fly, we never write it back as a fake edge.
 *
 * Maths: each nugget becomes a vector over the concepts it links (and vice
 * versa). The weight of a component is the edge `relevance` scaled by an
 * inverse-frequency factor, so a concept that hangs on almost every nugget
 * barely signals closeness, while a rare shared concept signals a lot. Proximity
 * is the cosine similarity of these vectors.
 *
 * The whole graph is loaded once via {@link load} (cheap for a personal-scale
 * graph); all query methods are then synchronous and side-effect free.
 */
export class KnowledgeGraph {
  /** nuggetId → its weighted concept vector (component = relevance × concept-IDF). */
  private readonly nuggetVectors: Map<string, Vector>
  /** conceptId → its weighted nugget vector (component = relevance × nugget-IDF). */
  private readonly conceptVectors: Map<string, Vector>
  /** Euclidean norms, precomputed so cosine is a single division per candidate. */
  private readonly nuggetNorms: Map<string, number>
  private readonly conceptNorms: Map<string, number>
  /** Inverted indices (membership only) used to walk to candidates that share a
   *  neighbour. Weights are NOT stored here — they are always read back from the
   *  vector set under query, so dot product and norm use one consistent weighting. */
  private readonly conceptMembers: Map<string, string[]>
  private readonly nuggetMembers: Map<string, string[]>
  /** Display labels resolved once, so query results need no further DB hits. */
  private readonly nuggetTitles: Map<string, string>
  private readonly conceptTerms: Map<string, string>

  /**
   * Builds the projection from the raw edges and the resolved display labels.
   * Private — callers use the async {@link load} factory, which fetches first.
   */
  private constructor(
    edges: Edge[],
    nuggetTitles: Map<string, string>,
    conceptTerms: Map<string, string>,
  ) {
    this.nuggetTitles = nuggetTitles
    this.conceptTerms = conceptTerms

    // First pass: group edges by each side so we know the degree / document
    // frequency of every node (needed for the inverse-frequency weighting).
    const conceptToNuggets = new Map<string, Edge[]>()
    const nuggetToConcepts = new Map<string, Edge[]>()
    for (const edge of edges) {
      if (!conceptToNuggets.has(edge.conceptId)) conceptToNuggets.set(edge.conceptId, [])
      if (!nuggetToConcepts.has(edge.nuggetId)) nuggetToConcepts.set(edge.nuggetId, [])
      conceptToNuggets.get(edge.conceptId)!.push(edge)
      nuggetToConcepts.get(edge.nuggetId)!.push(edge)
    }

    // Membership inverted indices: which nuggets carry a concept, and which
    // concepts a nugget carries. Pure id lists — weights stay in the vectors.
    this.conceptMembers = new Map()
    for (const [conceptId, group] of conceptToNuggets)
      this.conceptMembers.set(conceptId, group.map(e => e.nuggetId))
    this.nuggetMembers = new Map()
    for (const [nuggetId, group] of nuggetToConcepts)
      this.nuggetMembers.set(nuggetId, group.map(e => e.conceptId))

    const nuggetCount = nuggetToConcepts.size
    const conceptCount = conceptToNuggets.size

    // Inverse document frequency, smoothed to stay strictly positive even for a
    // concept present in every nugget: idf = ln(1 + N / df). Monotonically
    // shrinks as the node gets more common, so ubiquitous nodes are down-weighted
    // without ever collapsing to zero.
    const conceptIdf = new Map<string, number>()
    for (const [conceptId, group] of conceptToNuggets)
      conceptIdf.set(conceptId, Math.log(1 + nuggetCount / group.length))
    const nuggetIdf = new Map<string, number>()
    for (const [nuggetId, group] of nuggetToConcepts)
      nuggetIdf.set(nuggetId, Math.log(1 + conceptCount / group.length))

    // Second pass: materialise the two weighted vector sets.
    // - A nugget's components are its concepts, weighted by concept rarity.
    // - A concept's components are its nuggets, weighted by nugget rarity.
    this.nuggetVectors = new Map()
    this.conceptVectors = new Map()
    for (const edge of edges) {
      const conceptWeight = edge.relevance * conceptIdf.get(edge.conceptId)!
      const nuggetWeight = edge.relevance * nuggetIdf.get(edge.nuggetId)!

      if (!this.nuggetVectors.has(edge.nuggetId)) this.nuggetVectors.set(edge.nuggetId, new Map())
      this.nuggetVectors.get(edge.nuggetId)!.set(edge.conceptId, conceptWeight)

      if (!this.conceptVectors.has(edge.conceptId)) this.conceptVectors.set(edge.conceptId, new Map())
      this.conceptVectors.get(edge.conceptId)!.set(edge.nuggetId, nuggetWeight)
    }

    this.nuggetNorms = KnowledgeGraph.computeNorms(this.nuggetVectors)
    this.conceptNorms = KnowledgeGraph.computeNorms(this.conceptVectors)
  }

  /**
   * Loads the entire Nugget↔Concept graph and returns a ready-to-query instance.
   * Fetches the edges plus the labels needed to render results, so every later
   * query is a pure in-memory computation.
   */
  static async load(): Promise<KnowledgeGraph> {
    const [edges, nuggets, concepts] = await Promise.all([
      prisma.nuggetConcept.findMany({
        select: { nuggetId: true, conceptId: true, relevance: true },
      }),
      prisma.nugget.findMany({ select: { id: true, title: true, contentPlain: true } }),
      prisma.concept.findMany({
        select: { id: true, labels: { select: { language: true, term: true } } },
      }),
    ])

    const nuggetTitles = new Map<string, string>()
    for (const nugget of nuggets)
      nuggetTitles.set(nugget.id, nugget.title.trim() || KnowledgeGraph.fallbackTitle(nugget.contentPlain))

    const conceptTerms = new Map<string, string>()
    for (const concept of concepts)
      conceptTerms.set(concept.id, KnowledgeGraph.primaryTerm(concept.labels))

    return new KnowledgeGraph(edges, nuggetTitles, conceptTerms)
  }

  /**
   * Returns the nuggets closest to `nuggetId`, most similar first. Closeness =
   * cosine similarity of their concept vectors, i.e. how many high-relevance,
   * rare concepts the two share. Nuggets with no shared concept are omitted.
   */
  relatedNuggets(nuggetId: string, limit = 10): RelatedNugget[] {
    const scored = this.neighbours(
      nuggetId,
      this.nuggetVectors,
      this.conceptMembers,
      this.nuggetNorms,
    )

    return scored.slice(0, limit).map(({ id, score, shared }) => ({
      id,
      title: this.nuggetTitles.get(id) ?? '',
      score,
      sharedConcepts: shared.map(conceptId => ({
        id: conceptId,
        term: this.conceptTerms.get(conceptId) ?? '?',
      })),
    }))
  }

  /**
   * Returns the concepts closest to `conceptId`, most similar first. Closeness =
   * cosine similarity of their nugget vectors, i.e. how often the two concepts
   * co-occur in the same nuggets (weighted by relevance and nugget rarity).
   */
  relatedConcepts(conceptId: string, limit = 10): RelatedConcept[] {
    const scored = this.neighbours(
      conceptId,
      this.conceptVectors,
      this.nuggetMembers,
      this.conceptNorms,
    )

    return scored.slice(0, limit).map(({ id, score, shared }) => ({
      id,
      term: this.conceptTerms.get(id) ?? '?',
      score,
      sharedNuggets: shared.length,
    }))
  }

  /**
   * Shared cosine-neighbour search for both directions of the bipartite graph.
   * Given a target on one side, walks its vector components to the other side
   * and back to gather every node that shares at least one neighbour, then scores
   * each by cosine similarity. Returns all candidates sorted by score desc.
   *
   * @param targetId      the node to find neighbours of
   * @param vectors       weighted vectors of the target's own side
   * @param invertedIndex membership index neighbour→candidate ids (no weights:
   *                      candidate weights are read back from `vectors`, so the
   *                      dot product and the norm share one weighting → cosine ≤ 1)
   * @param norms         precomputed norms of the target's own side
   */
  private neighbours(
    targetId: string,
    vectors: Map<string, Vector>,
    invertedIndex: Map<string, string[]>,
    norms: Map<string, number>,
  ): { id: string; score: number; shared: string[] }[] {
    const targetVector = vectors.get(targetId)
    const targetNorm = norms.get(targetId)
    if (!targetVector || !targetNorm) return []

    // Accumulate the dot product against every reachable candidate, and remember
    // which intermediate nodes (the shared neighbours) drove each match.
    const dot = new Map<string, number>()
    const shared = new Map<string, string[]>()
    for (const [crossId, targetWeight] of targetVector) {
      const members = invertedIndex.get(crossId)
      if (!members) continue
      for (const candidateId of members) {
        if (candidateId === targetId) continue
        const candidateWeight = vectors.get(candidateId)!.get(crossId)!
        dot.set(candidateId, (dot.get(candidateId) ?? 0) + targetWeight * candidateWeight)
        if (!shared.has(candidateId)) shared.set(candidateId, [])
        shared.get(candidateId)!.push(crossId)
      }
    }

    const results: { id: string; score: number; shared: string[] }[] = []
    for (const [candidateId, dotProduct] of dot) {
      const candidateNorm = norms.get(candidateId)
      if (!candidateNorm) continue
      results.push({
        id: candidateId,
        score: dotProduct / (targetNorm * candidateNorm),
        shared: shared.get(candidateId)!,
      })
    }
    results.sort((a, b) => b.score - a.score)
    return results
  }

  /** Precomputes the Euclidean norm of every vector in the given set. */
  private static computeNorms(vectors: Map<string, Vector>): Map<string, number> {
    const norms = new Map<string, number>()
    for (const [id, vector] of vectors) {
      let sumOfSquares = 0
      for (const weight of vector.values()) sumOfSquares += weight * weight
      norms.set(id, Math.sqrt(sumOfSquares))
    }
    return norms
  }

  /**
   * Picks a human-readable label for a concept, preferring German, then English,
   * then whatever exists (mirrors the convention used on the concept pages).
   */
  private static primaryTerm(labels: { language: string; term: string }[]): string {
    return (
      labels.find(l => l.language === 'de')?.term ??
      labels.find(l => l.language === 'en')?.term ??
      labels[0]?.term ??
      '?'
    )
  }

  /** Derives a short fallback title from plain text when a nugget has none. */
  private static fallbackTitle(contentPlain: string): string {
    const sentence = contentPlain.replace(/\s+/g, ' ').trim().split(/[.!?]/)[0].trim()
    return sentence.length > 80 ? sentence.substring(0, 77) + '…' : sentence
  }
}
