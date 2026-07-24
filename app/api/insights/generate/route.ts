import { NextRequest, NextResponse } from 'next/server'
import { generateTensions, generateQuestions, generateBridges, generateThemes } from '@/lib/insights'
import { serializeInsight } from '../serialize'

/** Returns true if the request carries a valid owner session cookie. */
function isOwner(req: NextRequest): boolean {
  const secret = process.env.SESSION_SECRET
  return !!secret && req.cookies.get('session')?.value === secret
}

/**
 * POST /api/insights/generate — run one insight engine.
 * Owner-only (it spends AI budget). Body: { kind, conceptId }. Returns
 * { insights } (fresh or cached). Supports kind="tension" | "question" | "bridge"
 * (all per-concept, conceptId required) and "theme" (GLOBAL — conceptId ignored).
 */
export async function POST(req: NextRequest) {
  if (!isOwner(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'KI nicht konfiguriert' }, { status: 503 })
  }

  let body: { kind?: unknown; conceptId?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 })
  }

  const kind = typeof body.kind === 'string' ? body.kind : ''
  const conceptId = typeof body.conceptId === 'string' ? body.conceptId.trim() : ''
  if (kind !== 'tension' && kind !== 'question' && kind !== 'bridge' && kind !== 'theme') {
    return NextResponse.json({ error: `Unbekannte Insight-Art: ${kind}` }, { status: 400 })
  }
  // theme is global (whole-graph community detection); the rest are per-concept.
  if (kind !== 'theme' && !conceptId) {
    return NextResponse.json({ error: 'conceptId fehlt' }, { status: 400 })
  }

  const result =
    kind === 'theme' ? await generateThemes()
    : kind === 'question' ? await generateQuestions(conceptId)
    : kind === 'bridge' ? await generateBridges(conceptId)
    : await generateTensions(conceptId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 })
  return NextResponse.json({ insights: result.insights.map(serializeInsight) })
}
