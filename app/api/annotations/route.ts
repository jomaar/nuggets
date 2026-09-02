import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isOwner } from '@/lib/auth'
import { loadDomainAnnotations } from '@/lib/annotations'
import { syncCommentUnit } from '@/lib/knowledgeUnits'

/** Hard cap on a comment's length — a margin note, not a second nugget. */
const BODY_MAX = 10_000

// GET /api/annotations
//   ?nuggetId=… — all comments of one nugget, oldest first (document order is
//                 resolved client-side from the text-quote anchors).
//   ?domain=…   — the Denkspuren aggregation across a whole domain, newest
//                 first, enriched with nugget titles and jump anchors. An empty
//                 `domain` value means "every domain", matching /api/marks.
//
// Public read like /api/marks and /api/nuggets; writes below stay owner-only.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  if (params.has('domain')) {
    return NextResponse.json(await loadDomainAnnotations(params.get('domain')?.trim() || null))
  }

  const nuggetId = params.get('nuggetId')
  if (!nuggetId) {
    return NextResponse.json({ error: 'nuggetId or domain required' }, { status: 400 })
  }
  const annotations = await prisma.annotation.findMany({
    where: { nuggetId },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(annotations)
}

// POST /api/annotations — create a comment from a text-quote anchor.
// Owner-only: comments are the owner's margin notes.
export async function POST(req: NextRequest) {
  if (!(await isOwner())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { nuggetId, quote, prefix, suffix, body } = await req.json()
  if (!nuggetId || typeof quote !== 'string' || !quote.trim()) {
    return NextResponse.json({ error: 'nuggetId and quote required' }, { status: 400 })
  }

  const annotation = await prisma.annotation.create({
    data: {
      nuggetId,
      quote,
      prefix: typeof prefix === 'string' ? prefix : '',
      suffix: typeof suffix === 'string' ? suffix : '',
      body: typeof body === 'string' ? body.slice(0, BODY_MAX) : '',
    },
  })
  // Fire-and-forget, one local embedding call at most — no LLM step for
  // comments (see lib/knowledgeUnits.ts's syncCommentUnit).
  void syncCommentUnit(annotation.id)
  return NextResponse.json(annotation, { status: 201 })
}
