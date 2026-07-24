import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { serializeInsight } from '../serialize'

/** Returns true if the request carries a valid owner session cookie. */
function isOwner(req: NextRequest): boolean {
  const secret = process.env.SESSION_SECRET
  return !!secret && req.cookies.get('session')?.value === secret
}

const ALLOWED_STATUS = new Set(['new', 'kept', 'dismissed'])

/**
 * PATCH /api/insights/[id] — keep or dismiss an insight. Owner-only.
 * Body: { status: "kept" | "dismissed" | "new" }. Metadata-only; a dismissed
 * insight is never resurfaced or regenerated (lib/insights.ts preserves it).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isOwner(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  let body: { status?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 })
  }

  const status = typeof body.status === 'string' ? body.status : ''
  if (!ALLOWED_STATUS.has(status)) {
    return NextResponse.json({ error: 'Ungültiger Status' }, { status: 400 })
  }

  try {
    const updated = await prisma.insight.update({ where: { id }, data: { status } })
    return NextResponse.json(serializeInsight(updated))
  } catch {
    return NextResponse.json({ error: 'Insight nicht gefunden' }, { status: 404 })
  }
}
