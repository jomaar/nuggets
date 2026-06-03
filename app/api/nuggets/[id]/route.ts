import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizeToHtml, htmlToPlain } from '@/lib/content'

// GET /api/nuggets/:id
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const nugget = await prisma.nugget.findUnique({
    where: { id },
    include: { reviews: { orderBy: { createdAt: 'desc' }, take: 1 } }
  })
  if (!nugget) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(nugget)
}

// PATCH /api/nuggets/:id
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const { content, sourceUrl, sourceLabel, aiChatUrl, tags } = body

  const data: Record<string, unknown> = {}
  if (content) {
    data.contentHtml  = normalizeToHtml(content)
    data.contentPlain = htmlToPlain(data.contentHtml as string)
  }
  if (sourceUrl   !== undefined) data.sourceUrl   = sourceUrl
  if (sourceLabel !== undefined) data.sourceLabel = sourceLabel
  if (aiChatUrl   !== undefined) data.aiChatUrl   = aiChatUrl
  if (tags        !== undefined) data.tags        = JSON.stringify(tags)

  const nugget = await prisma.nugget.update({ where: { id }, data })
  return NextResponse.json(nugget)
}

// DELETE /api/nuggets/:id
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.nugget.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
