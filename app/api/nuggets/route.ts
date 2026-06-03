import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizeToHtml, htmlToPlain } from '@/lib/content'

// GET /api/nuggets?search=...&tag=...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search')?.trim()
  const tag = searchParams.get('tag')?.trim()

  const nuggets = await prisma.nugget.findMany({
    where: {
      AND: [
        search ? { contentPlain: { contains: search } } : {},
        tag    ? { tags: { contains: tag } }           : {},
      ]
    },
    include: { reviews: { orderBy: { createdAt: 'desc' }, take: 1 } },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(nuggets)
}

// POST /api/nuggets
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { content, sourceUrl, sourceLabel, aiChatUrl, tags } = body

  if (!content?.trim()) {
    return NextResponse.json({ error: 'content required' }, { status: 400 })
  }

  const contentHtml  = normalizeToHtml(content)
  const contentPlain = htmlToPlain(contentHtml)

  const nugget = await prisma.nugget.create({
    data: {
      contentHtml,
      contentPlain,
      sourceUrl:  sourceUrl  || null,
      sourceLabel: sourceLabel || null,
      aiChatUrl:  aiChatUrl  || null,
      tags:       JSON.stringify(tags ?? []),
      reviews: {
        create: {} // creates one Review row with defaults → due today
      }
    },
    include: { reviews: true }
  })

  return NextResponse.json(nugget, { status: 201 })
}
