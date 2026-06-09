import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizeToHtml, htmlToMarkdown, htmlToPlain } from '@/lib/content'

// GET /api/nuggets/:id
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const nugget = await prisma.nugget.findUnique({
    where: { id },
    include: {
      reviews: { orderBy: { createdAt: 'desc' }, take: 1 },
      domain: true,
      concepts: {
        include: {
          // _count.nuggets = how many other nuggets share this concept; the
          // single view sorts concepts by it (most-connected first).
          concept: { include: { labels: true, _count: { select: { nuggets: true } } } },
        },
        orderBy: { relevance: 'desc' },
      },
    },
  })
  if (!nugget) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(nugget)
}

// PATCH /api/nuggets/:id
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const { content, contentMarkdown, contentHtml: contentHtmlInput, title, sourceUrl, sourceLabel, aiChatUrl, tags, domainId } = body

  const data: Record<string, unknown> = {}
  // Canonical content is HTML (includes highlight <mark>s); Markdown is derived for the AI.
  const rawContent = contentHtmlInput ?? contentMarkdown ?? content
  if (rawContent) {
    const html           = normalizeToHtml(rawContent)
    data.contentHtml     = html
    data.contentMarkdown = htmlToMarkdown(html)
    data.contentPlain    = htmlToPlain(html)
  }
  if (title       !== undefined) data.title       = title
  if (sourceUrl   !== undefined) data.sourceUrl   = sourceUrl
  if (sourceLabel !== undefined) data.sourceLabel = sourceLabel
  if (aiChatUrl   !== undefined) data.aiChatUrl   = aiChatUrl
  if (tags        !== undefined) data.tags        = JSON.stringify(tags)
  if (domainId    !== undefined) data.domainId    = domainId || null

  const nugget = await prisma.nugget.update({
    where: { id },
    data,
    include: { domain: true },
  })
  return NextResponse.json(nugget)
}

// DELETE /api/nuggets/:id
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.nugget.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
