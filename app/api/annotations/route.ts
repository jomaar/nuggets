import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isOwner } from '@/lib/auth'

/** Hard cap on a comment's length — a margin note, not a second nugget. */
const BODY_MAX = 10_000

// GET /api/annotations?nuggetId=… — all comments of one nugget, oldest first
// (document order is resolved client-side from the text-quote anchors).
export async function GET(req: NextRequest) {
  const nuggetId = req.nextUrl.searchParams.get('nuggetId')
  if (!nuggetId) {
    return NextResponse.json({ error: 'nuggetId required' }, { status: 400 })
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
  return NextResponse.json(annotation, { status: 201 })
}
