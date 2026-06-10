import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizeToHtml, htmlToMarkdown, htmlToPlain } from '@/lib/content'
import { extractAndLinkConcepts } from '@/lib/concepts'

// GET /api/nuggets?search=...&tag=...&domain=<slug>
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const search     = searchParams.get('search')?.trim()
  const tag        = searchParams.get('tag')?.trim()
  const domainSlug = searchParams.get('domain')?.trim()

  // The list view (app/all) renders title-only rows, so we only select the
  // fields it actually uses. This avoids shipping the heavy content blobs
  // (contentMarkdown/contentPlain) and the 3-level concepts→labels join for
  // every nugget. `take` caps the payload as a safety valve at scale; beyond
  // 500 ungefiltered nuggets the search is the intended tool. The `where`
  // filter runs in SQL first, so search/filter still cover the whole table —
  // `take` only limits how many matches are returned.
  const nuggets = await prisma.nugget.findMany({
    where: {
      AND: [
        search     ? { contentPlain: { contains: search } }  : {},
        tag        ? { tags: { contains: tag } }             : {},
        domainSlug ? { domain: { slug: domainSlug } }        : {},
      ],
    },
    select: {
      id:          true,
      title:       true,
      contentHtml: true, // needed for the client-side fallback title
      domain:      { select: { id: true, name: true, slug: true, icon: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })

  return NextResponse.json(nuggets)
}

// POST /api/nuggets
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { content, contentMarkdown, contentHtml: contentHtmlInput, sourceUrl, sourceLabel, aiChatUrl, tags, domainId, reviseContent } = body

  // Canonical content is HTML. Accept HTML (Tiptap) or Markdown/plain (legacy/quick-add);
  // normalizeToHtml passes HTML through and renders Markdown.
  const rawContent = contentHtmlInput ?? contentMarkdown ?? content
  if (!rawContent?.trim()) {
    return NextResponse.json({ error: 'content required' }, { status: 400 })
  }

  const contentHtml     = normalizeToHtml(rawContent)
  const derivedMarkdown = htmlToMarkdown(contentHtml)
  const contentPlain    = htmlToPlain(contentHtml)

  const nugget = await prisma.nugget.create({
    data: {
      contentMarkdown: derivedMarkdown,
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

  await extractAndLinkConcepts(nugget.id, nugget.contentMarkdown || nugget.contentPlain, {
    domainId: nugget.domainId,
    reviseContent: reviseContent !== false,
  })

  return NextResponse.json(nugget, { status: 201 })
}
