import { NextRequest, NextResponse } from 'next/server'
import { locateInsightPassage } from '@/lib/insights'

/** Returns true if the request carries a valid owner session cookie. */
function isOwner(req: NextRequest): boolean {
  const secret = process.env.SESSION_SECRET
  return !!secret && req.cookies.get('session')?.value === secret
}

/**
 * POST /api/insights/[id]/locate — find the exact spot in a referenced nugget
 * that this insight is about, so the client can deep-link straight to it.
 * Owner-only (it spends AI budget, lazily, for one nugget). Body: { nuggetId }.
 * Returns { anchor: {quote,prefix,suffix} | null } — null means "no confident
 * spot", and the client falls back to opening the nugget at the top.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isOwner(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'KI nicht konfiguriert' }, { status: 503 })
  }
  const { id } = await params

  let body: { nuggetId?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 })
  }

  const nuggetId = typeof body.nuggetId === 'string' ? body.nuggetId.trim() : ''
  if (!nuggetId) return NextResponse.json({ error: 'nuggetId fehlt' }, { status: 400 })

  const result = await locateInsightPassage(id, nuggetId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 })
  return NextResponse.json({ anchor: result.anchor })
}
