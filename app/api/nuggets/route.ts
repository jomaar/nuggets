import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizeToHtml, htmlToPlain } from '@/lib/content'
import { extractAndLinkConcepts } from '@/lib/concepts'

// GET /api/nuggets?search=...&tag=...&domain=<slug>
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const search     = searchParams.get('search')?.trim()
  const tag        = searchParams.get('tag')?.trim()
  const domainSlug = searchParams.get('domain')?.trim()

  const nuggets = await prisma.nugget.findMany({
    where: {
      AND: [
        search     ? { contentPlain: { contains: search } }  : {},
        tag        ? { tags: { contains: tag } }             : {},
        domainSlug ? { domain: { slug: domainSlug } }        : {},
      ],
    },
    include: {
      reviews: { orderBy: { createdAt: 'desc' }, take: 1 },
      domain: true,
      concepts: { include: { concept: { include: { labels: true } } }, orderBy: { relevance: 'desc' } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(nuggets)
}

// POST /api/nuggets
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { content, contentMarkdown, sourceUrl, sourceLabel, aiChatUrl, tags, domainId } = body

  const rawContent = contentMarkdown ?? content
  if (!rawContent?.trim()) {
    return NextResponse.json({ error: 'content required' }, { status: 400 })
  }

  const contentHtml  = normalizeToHtml(rawContent)
  const contentPlain = htmlToPlain(contentHtml)

  const nugget = await prisma.nugget.create({
    data: {
      contentMarkdown: contentMarkdown ?? '',
      contentHtml,
      contentPlain,
      sourceUrl:   sourceUrl   || null,
      sourceLabel: sourceLabel || null,
      aiChatUrl:   aiChatUrl   || null,
      tags:        JSON.stringify(tags ?? []),
      domainId:    domainId    || null,
      reviews: { create: {} },
    },
    include: { reviews: true, domain: true },
  })

  await extractAndLinkConcepts(nugget.id, nugget.contentMarkdown || nugget.contentPlain)

  return NextResponse.json(nugget, { status: 201 })
}
