import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { serializeInsight } from './serialize'

/**
 * GET /api/insights?conceptId=… — cached insights anchored to a concept, for the
 * "Denkanstöße" panel. Public read (like the other GETs); dismissed rows hidden,
 * newest first. Returns { insights }.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const conceptId = searchParams.get('conceptId')?.trim()
  if (!conceptId) return NextResponse.json({ error: 'conceptId fehlt' }, { status: 400 })

  const insights = await prisma.insight.findMany({
    where: { anchorConceptId: conceptId, status: { not: 'dismissed' } },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ insights: insights.map(serializeInsight) })
}
