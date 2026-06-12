import { NextRequest, NextResponse } from 'next/server'
import { KnowledgeGraph } from '@/lib/graph'

/**
 * GET /api/concepts/:id/related — concepts closest to this one, most similar
 * first. Thin wrapper around KnowledgeGraph: closeness is derived from shared
 * nuggets (cosine similarity, never a stored concept↔concept edge), and each
 * result carries the shared-nugget count as the reason for the proximity.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const limit = Number(req.nextUrl.searchParams.get('limit')) || 8
  const graph = await KnowledgeGraph.load()
  return NextResponse.json(graph.relatedConcepts(id, limit))
}
