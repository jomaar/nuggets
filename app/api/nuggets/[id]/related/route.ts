import { NextRequest, NextResponse } from 'next/server'
import { KnowledgeGraph } from '@/lib/graph'

/**
 * GET /api/nuggets/:id/related — nuggets closest to this one, most similar
 * first. Thin wrapper around KnowledgeGraph: closeness is derived from shared
 * abstract concept nodes (cosine similarity), and each result carries the
 * shared concepts as the human-readable reason for the proximity.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const limit = Number(req.nextUrl.searchParams.get('limit')) || 8
  const graph = await KnowledgeGraph.load()
  return NextResponse.json(graph.relatedNuggets(id, limit))
}
