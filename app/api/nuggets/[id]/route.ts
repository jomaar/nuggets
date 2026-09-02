import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizeToHtml, htmlToMarkdown, htmlToPlain } from '@/lib/content'
import { sanitizeMarkScheme } from '@/lib/marking'
import { reindexNugget } from '@/lib/knowledgeUnits'
import { bumpNearbyIndexVersion } from '@/lib/nearbyIndex'

// GET /api/nuggets/:id  (?edit=1 to also return the Markdown/plain projections)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // The read view renders only contentHtml; the heavy contentMarkdown/contentPlain
  // blobs are needed solely by the edit view (legacy-content fallback + AI rework).
  // Ship them only when explicitly asked, so the common read path stays lean.
  const wantsEditFields = new URL(req.url).searchParams.get('edit') === '1'
  const nugget = await prisma.nugget.findUnique({
    where: { id },
    select: {
      id:          true,
      title:       true,
      contentHtml: true,
      ...(wantsEditFields ? { contentMarkdown: true, contentPlain: true } : {}),
      sourceUrl:   true,
      sourceLabel: true,
      aiChatUrl:   true,
      tags:        true,
      markScheme:  true,
      markTemplateId: true,
      domainId:    true,
      createdAt:   true,
      domain: true,
      concepts: {
        // _count.nuggets = how many other nuggets share this concept; the
        // single view sorts concepts by it (most-connected first).
        include: {
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
  const { content, contentMarkdown, contentHtml: contentHtmlInput, title, sourceUrl, sourceLabel, aiChatUrl, tags, domainId, markScheme, markTemplateId } = body

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
  // Per-nugget colour meanings: only known keys / non-empty string labels survive.
  if (markScheme  !== undefined) {
    const scheme = sanitizeMarkScheme(markScheme)
    if (!scheme) return NextResponse.json({ error: 'invalid markScheme' }, { status: 400 })
    data.markScheme = JSON.stringify(scheme)
  }
  // Which template the scheme came from — labels the popup header and supplies
  // its long-form glossary. Empty string / null clears the reference; marks keep
  // rendering from `markScheme` either way, so this is purely descriptive.
  if (markTemplateId !== undefined) data.markTemplateId = markTemplateId || null

  const nugget = await prisma.nugget.update({
    where: { id },
    data,
    include: { domain: true },
  })

  // Only reindex when the text actually changed — a mark add/remove lives
  // inside contentHtml too, so this also covers those; a title/tag/domain-only
  // PATCH doesn't touch the knowledge units. Fire-and-forget, same as POST.
  if (rawContent) void reindexNugget(id)

  return NextResponse.json(nugget)
}

// DELETE /api/nuggets/:id
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.nugget.delete({ where: { id } })
  // The delete cascades only this nugget's edges; concepts left without any
  // edge would linger as orphans and pollute every extraction prompt — sweep them.
  await prisma.concept.deleteMany({ where: { nuggets: { none: {} } } })
  // The FK cascade already removed this nugget's KnowledgeUnit rows; the
  // in-memory /api/nearby cache just doesn't know that yet.
  bumpNearbyIndexVersion()
  return new NextResponse(null, { status: 204 })
}
