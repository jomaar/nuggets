import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { KnowledgeGraph } from '@/lib/graph'
import type { EgoData, EgoNeighbor, EgoNode } from '@/lib/ego'

/** Inner ring size cap — keeps the radial layout readable on a 390px viewport. */
const MAX_NEIGHBORS = 16
/** Outer (proximity) ring cap — deliberately small; it is secondary context. */
const MAX_OUTER = 6

/**
 * GET /api/graph/ego?type=concept|nugget&id=… — the ego network of one node:
 * the node itself plus its direct bipartite neighbours, each carrying the real
 * stored edge (NuggetConcept `relevance` + `note`). This is the raw-structure
 * data source of Phase 8 (topology straight from the DB); the derived proximity
 * ring (lib/graph.ts) is a later stage.
 */
export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type')
  const id = req.nextUrl.searchParams.get('id')
  if (!id || (type !== 'concept' && type !== 'nugget')) {
    return NextResponse.json({ error: 'type (concept|nugget) and id required' }, { status: 400 })
  }

  const data = type === 'concept' ? await conceptEgo(id) : await nuggetEgo(id)
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(data)
}

/** Builds the ego data for a concept centre: its linked nuggets form the ring. */
async function conceptEgo(id: string): Promise<EgoData | null> {
  const concept = await prisma.concept.findUnique({
    where: { id },
    include: {
      labels: true,
      nuggets: {
        include: {
          nugget: {
            select: {
              id: true,
              title: true,
              contentPlain: true,
              domain: { select: { slug: true, icon: true, color: true } },
              _count: { select: { concepts: true } },
            },
          },
        },
      },
    },
  })
  if (!concept) return null

  const neighbors: EgoNeighbor[] = concept.nuggets.map(nc => ({
    node: {
      type: 'nugget' as const,
      id: nc.nugget.id,
      label: nc.nugget.title.trim() || fallbackTitle(nc.nugget.contentPlain),
      degree: nc.nugget._count.concepts,
      domain: nc.nugget.domain,
    },
    edge: { relevance: nc.relevance, note: nc.note },
  }))

  return {
    center: {
      type: 'concept',
      id: concept.id,
      label: primaryTerm(concept.labels),
      degree: concept.nuggets.length,
      description: concept.description,
    },
    neighbors: sortAndCap(neighbors),
    outer: await conceptOuterRing(id),
  }
}

/**
 * Second ring for a concept centre: the concepts closest to it by DERIVED
 * proximity (co-occurrence across shared nuggets, lib/graph.ts). Same type as
 * the centre, so it never collides with the opposite-type inner ring. Enriched
 * with each concept's full degree (the count rendered inside its circle).
 */
async function conceptOuterRing(id: string): Promise<EgoNode[]> {
  const graph = await KnowledgeGraph.load()
  const related = graph.relatedConcepts(id, MAX_OUTER)
  if (related.length === 0) return []

  const concepts = await prisma.concept.findMany({
    where: { id: { in: related.map(r => r.id) } },
    select: { id: true, _count: { select: { nuggets: true } } },
  })
  const degreeById = new Map(concepts.map(c => [c.id, c._count.nuggets]))

  return related.map(r => ({
    type: 'concept' as const,
    id: r.id,
    label: r.term,
    degree: degreeById.get(r.id) ?? 0,
  }))
}

/** Builds the ego data for a nugget centre: its concepts form the ring. */
async function nuggetEgo(id: string): Promise<EgoData | null> {
  const nugget = await prisma.nugget.findUnique({
    where: { id },
    include: {
      domain: { select: { slug: true, icon: true, color: true } },
      concepts: {
        include: {
          concept: {
            include: { labels: true, _count: { select: { nuggets: true } } },
          },
        },
      },
    },
  })
  if (!nugget) return null

  const neighbors: EgoNeighbor[] = nugget.concepts.map(nc => ({
    node: {
      type: 'concept' as const,
      id: nc.concept.id,
      label: primaryTerm(nc.concept.labels),
      degree: nc.concept._count.nuggets,
      description: nc.concept.description,
    },
    edge: { relevance: nc.relevance, note: nc.note },
  }))

  return {
    center: {
      type: 'nugget',
      id: nugget.id,
      label: nugget.title.trim() || fallbackTitle(nugget.contentPlain),
      degree: nugget.concepts.length,
      // Short excerpt so the detail sheet has body text for a nugget centre.
      description: nugget.contentPlain.replace(/\s+/g, ' ').trim().slice(0, 280),
      domain: nugget.domain,
    },
    neighbors: sortAndCap(neighbors),
    outer: await nuggetOuterRing(id),
  }
}

/**
 * Second ring for a nugget centre: the nuggets closest to it by DERIVED
 * proximity (shared concepts, lib/graph.ts). Same type as the centre. Enriched
 * with domain styling (the node's colour/icon) and its full concept degree.
 */
async function nuggetOuterRing(id: string): Promise<EgoNode[]> {
  const graph = await KnowledgeGraph.load()
  const related = graph.relatedNuggets(id, MAX_OUTER)
  if (related.length === 0) return []

  const nuggets = await prisma.nugget.findMany({
    where: { id: { in: related.map(r => r.id) } },
    select: {
      id: true,
      domain: { select: { slug: true, icon: true, color: true } },
      _count: { select: { concepts: true } },
    },
  })
  const byId = new Map(nuggets.map(n => [n.id, n]))

  return related.map(r => {
    const enriched = byId.get(r.id)
    return {
      type: 'nugget' as const,
      id: r.id,
      label: r.title,
      degree: enriched?._count.concepts ?? 0,
      domain: enriched?.domain ?? null,
    }
  })
}

/** Strongest edges first (then label, for a stable layout), capped for the ring. */
function sortAndCap(neighbors: EgoNeighbor[]): EgoNeighbor[] {
  return neighbors
    .sort((a, b) => b.edge.relevance - a.edge.relevance || a.node.label.localeCompare(b.node.label))
    .slice(0, MAX_NEIGHBORS)
}

/** Label priority de → en → first, mirroring the concept pages. */
function primaryTerm(labels: { language: string; term: string }[]): string {
  return (
    labels.find(l => l.language === 'de')?.term ??
    labels.find(l => l.language === 'en')?.term ??
    labels[0]?.term ??
    '?'
  )
}

/** Derives a short fallback title from plain text when a nugget has none. */
function fallbackTitle(contentPlain: string): string {
  const sentence = contentPlain.replace(/\s+/g, ' ').trim().split(/[.!?]/)[0].trim()
  return sentence.length > 80 ? sentence.substring(0, 77) + '…' : sentence
}
