import { NextRequest, NextResponse } from 'next/server'
import { embedTexts, EmbeddingError } from '@/lib/embeddings'
import { getNearbyIndex, rankNearby } from '@/lib/nearbyIndex'

/**
 * GET /api/nearby?nuggetId=…&text=…&limit=… — "Naheliegendes" (Spinnennetz
 * Stufe 1): given the text currently in view in one nugget, find the closest
 * KnowledgeUnit chunks elsewhere in the corpus. A flat top-level route (like
 * /api/marks, /api/graph/ego) rather than nested under /api/nuggets/:id — the
 * query is inherently cross-nugget, not a resource under one nugget's own tree.
 *
 * GET, not POST, despite taking real input: `proxy.ts` blanket-blocks every
 * unauthenticated POST/PATCH/DELETE under /api/* (a write gate, not a
 * per-route one), so a POST here would silently 401 for every non-owner
 * reader — breaking the "Lesen ist bewusst öffentlich" intent this route is
 * supposed to follow. GET with query params sidesteps that without touching
 * the shared security middleware, and matches this codebase's own convention
 * for public reads (/api/nuggets/:id/related?limit=, /api/marks?domain=).
 * This costs local CPU only (an embedding-daemon call + in-memory cosine
 * ranking), never euros — unlike the owner-gated AI routes (/api/rework,
 * /api/insights/generate) that spend real API budget and are POST for real
 * write-adjacent reasons.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const nuggetId = params.get('nuggetId')
  const text = params.get('text')
  const limitParam = params.get('limit')

  if (!nuggetId) {
    return NextResponse.json({ error: 'nuggetId fehlt.' }, { status: 400 })
  }
  if (!text || !text.trim()) {
    return NextResponse.json({ error: 'text fehlt.' }, { status: 400 })
  }
  const parsedLimit = limitParam !== null && Number.isFinite(Number(limitParam))
    ? Math.max(1, Math.min(30, Math.trunc(Number(limitParam))))
    : undefined

  let queryVectors: Float32Array[]
  try {
    queryVectors = await embedTexts([text.trim()], 'query')
  } catch (error) {
    const detail = error instanceof EmbeddingError ? error.message : 'Embedding-Dienst nicht erreichbar.'
    return NextResponse.json({ error: detail }, { status: 503 })
  }
  const queryVector = queryVectors[0]
  if (!queryVector) {
    return NextResponse.json({ results: [] })
  }

  const units = await getNearbyIndex()
  const results = rankNearby(queryVector, units, nuggetId, parsedLimit)
  return NextResponse.json({ results })
}
