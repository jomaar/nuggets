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
  // Defensive: a delete past the app (sqlite3 CLI has foreign_keys OFF, so
  // ON DELETE CASCADE is inert there) can leave orphaned bookmarks whose
  // joined nugget is null at runtime despite the required relation — hide
  // them instead of listing dead entries. Cleanup: scripts/cleanup-orphan-anchors.ts.
  return NextResponse.json(bookmarks.filter(b => b.nugget !== null))
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
