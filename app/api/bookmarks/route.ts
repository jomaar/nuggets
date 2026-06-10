import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/bookmarks — newest first, with the parent nugget's title for the list.
export async function GET() {
  const bookmarks = await prisma.bookmark.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      quote: true,
      prefix: true,
      suffix: true,
      lineText: true,
      createdAt: true,
      nugget: { select: { id: true, title: true } },
    },
  })
  return NextResponse.json(bookmarks)
}

// POST /api/bookmarks — create a reading bookmark from a text-quote anchor.
export async function POST(req: NextRequest) {
  const { nuggetId, quote, prefix, suffix, lineText } = await req.json()
  if (!nuggetId || typeof quote !== 'string') {
    return NextResponse.json({ error: 'nuggetId and quote required' }, { status: 400 })
  }

  const bookmark = await prisma.bookmark.create({
    data: {
      nuggetId,
      quote,
      prefix:   prefix   ?? '',
      suffix:   suffix   ?? '',
      lineText: lineText ?? quote,
    },
  })
  return NextResponse.json(bookmark, { status: 201 })
}
