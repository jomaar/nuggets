import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fallbackTitle } from '@/lib/content'
import { serializeInsight } from '../serialize'

/** Primary human label for a concept: German first, then English, then any. */
function primaryTerm(labels: { language: string; term: string }[]): string {
  return (
    labels.find(l => l.language === 'de')?.term ??
    labels.find(l => l.language === 'en')?.term ??
    labels[0]?.term ??
    '?'
  )
}

/**
 * GET /api/insights/feed — every cached insight across ALL concepts (the Stufe-4
 * "Denkanstöße"-Feed on /concepts). Public read like the other GETs; dismissed
 * rows hidden, newest first. The feed has no per-concept context to resolve jump
 * labels from, so this endpoint ships the display labels alongside the rows
 * (avoids an N+1 on the client): every anchor + referenced concept's term and
 * every referenced nugget's title. Returns { insights, conceptTerms, nuggetTitles }.
 */
export async function GET() {
  const rows = await prisma.insight.findMany({
    where: { status: { not: 'dismissed' } },
    orderBy: { createdAt: 'desc' },
  })
  const insights = rows.map(serializeInsight)

  // Collect the ids that need a display label: anchor + ref concepts, ref nuggets.
  const conceptIds = [...new Set(
    insights.flatMap(i => [i.anchorConceptId, ...i.refs.conceptIds]).filter((v): v is string => !!v),
  )]
  const nuggetIds = [...new Set(insights.flatMap(i => i.refs.nuggetIds))]

  const [concepts, nuggets] = await Promise.all([
    conceptIds.length
      ? prisma.concept.findMany({
          where: { id: { in: conceptIds } },
          select: { id: true, labels: { select: { language: true, term: true } } },
        })
      : Promise.resolve([]),
    nuggetIds.length
      ? prisma.nugget.findMany({
          where: { id: { in: nuggetIds } },
          select: { id: true, title: true, contentHtml: true },
        })
      : Promise.resolve([]),
  ])

  const conceptTerms: Record<string, string> = {}
  for (const c of concepts) conceptTerms[c.id] = primaryTerm(c.labels)
  const nuggetTitles: Record<string, string> = {}
  for (const n of nuggets) nuggetTitles[n.id] = n.title || fallbackTitle(n.contentHtml)

  return NextResponse.json({ insights, conceptTerms, nuggetTitles })
}
