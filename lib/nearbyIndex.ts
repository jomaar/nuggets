/**
 * Cached in-memory nearest-neighbour search over every `KnowledgeUnit` —
 * the retrieval half of "Naheliegendes" (Spinnennetz Stufe 1). Built WITH
 * caching from the start, deliberately not repeating `lib/graph.ts`'s
 * `KnowledgeGraph.load()` gap (that one re-runs three unbounded queries,
 * including every nugget's full `contentPlain`, on every single request).
 *
 * A single Node process (no cluster mode in the current deploy — see
 * .github/workflows/deploy.yml) makes a plain module-level counter enough
 * to invalidate the cache: `bumpNearbyIndexVersion()` is called by
 * lib/knowledgeUnits.ts after any write, and by the nugget/annotation
 * DELETE routes (an FK cascade removes rows without this module knowing).
 */
import { prisma } from '@/lib/prisma'
import { fallbackTitle } from '@/lib/content'
import { unpackVector, EMBED_MODEL } from '@/lib/embeddings'

export interface LoadedUnit {
  id: string
  nuggetId: string
  nuggetTitle: string
  kind: string
  color: string | null
  markStyle: string | null
  text: string
  gloss: string | null
  quote: string
  prefix: string
  suffix: string
  vector: Float32Array
}

export interface NearbyResult {
  id: string
  nuggetId: string
  nuggetTitle: string
  kind: string
  color: string | null
  markStyle: string | null
  text: string
  gloss: string | null
  quote: string
  prefix: string
  suffix: string
  score: number
}

let cache: { version: number; units: LoadedUnit[] } | null = null
let currentVersion = 0

/** Invalidates the cache — see the module doc for who calls this and why. */
export function bumpNearbyIndexVersion(): void {
  currentVersion += 1
}

async function loadUnits(): Promise<LoadedUnit[]> {
  const rows = await prisma.knowledgeUnit.findMany({
    // Old-model rows (after a model swap) are excluded here rather than
    // deleted, so a backfill re-run can still diff against them if needed —
    // they simply never surface until re-embedded.
    where: { model: EMBED_MODEL },
    select: {
      id: true, nuggetId: true, kind: true, color: true, markStyle: true, text: true, gloss: true,
      quote: true, prefix: true, suffix: true, embedding: true,
      nugget: { select: { title: true, contentHtml: true } },
    },
  })
  return rows.map(r => ({
    id: r.id,
    nuggetId: r.nuggetId,
    nuggetTitle: r.nugget.title || fallbackTitle(r.nugget.contentHtml),
    kind: r.kind,
    color: r.color,
    markStyle: r.markStyle,
    text: r.text,
    gloss: r.gloss,
    quote: r.quote,
    prefix: r.prefix,
    suffix: r.suffix,
    vector: unpackVector(r.embedding),
  }))
}

/** Returns the cached unit set, reloading only when a write has bumped the version since the last load. */
export async function getNearbyIndex(): Promise<LoadedUnit[]> {
  if (cache && cache.version === currentVersion) return cache.units
  const units = await loadUnits()
  cache = { version: currentVersion, units }
  return units
}

/** At most this many results may come from any single source nugget, so one large, topically-adjacent nugget can't fill every slot. */
const MAX_PER_NUGGET = 3
const DEFAULT_LIMIT = 24
/** Below this cosine score, the honest answer is an empty list ("Nichts Naheliegendes gefunden") rather than forcing K results — mirrors Insights' honest-empty philosophy. */
const MIN_SCORE = 0.35

/** Vectors from python/embed_server.py are L2-normalized at encode time, so cosine similarity reduces to a plain dot product. */
function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i]
  return sum
}

/**
 * Ranks every unit against a query vector, excluding the nugget the query
 * came from, capping per-source-nugget representation, and applying the
 * score floor. Trivial cost at this corpus's scale — even an order of
 * magnitude more units is sub-millisecond math.
 */
export function rankNearby(
  queryVector: Float32Array,
  units: LoadedUnit[],
  excludeNuggetId: string,
  limit: number = DEFAULT_LIMIT,
): NearbyResult[] {
  const scored = units
    .filter(u => u.nuggetId !== excludeNuggetId)
    .map(u => ({ u, score: dot(queryVector, u.vector) }))
    .filter(s => s.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)

  const perNugget = new Map<string, number>()
  const results: NearbyResult[] = []
  for (const { u, score } of scored) {
    const count = perNugget.get(u.nuggetId) ?? 0
    if (count >= MAX_PER_NUGGET) continue
    perNugget.set(u.nuggetId, count + 1)
    results.push({
      id: u.id, nuggetId: u.nuggetId, nuggetTitle: u.nuggetTitle, kind: u.kind, color: u.color, markStyle: u.markStyle,
      text: u.text, gloss: u.gloss, quote: u.quote, prefix: u.prefix, suffix: u.suffix, score,
    })
    if (results.length >= limit) break
  }
  return results
}
