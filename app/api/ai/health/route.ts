import { NextRequest, NextResponse } from 'next/server'
import { anthropic, CLAUDE_MODEL, describeAiError } from '@/lib/anthropic'

/** Returns true if the request carries a valid owner session cookie. */
function isOwner(req: NextRequest): boolean {
  const secret = process.env.SESSION_SECRET
  return !!secret && req.cookies.get('session')?.value === secret
}

/**
 * GET /api/ai/health — owner-only heartbeat for the Anthropic connection.
 * Uses models.retrieve, a metadata-only call that still runs the same auth
 * check as a real request (401 on an invalid/spend-limit-disabled key) but
 * costs no tokens — the failure mode that previously went unnoticed until
 * a nugget save silently skipped concept extraction.
 */
export async function GET(req: NextRequest) {
  if (!isOwner(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, error: 'KI nicht konfiguriert (kein API-Key hinterlegt).' })
  }

  try {
    await anthropic.models.retrieve(CLAUDE_MODEL)
    return NextResponse.json({ ok: true, model: CLAUDE_MODEL })
  } catch (error) {
    console.error('[ai/health] check failed:', error)
    return NextResponse.json({ ok: false, error: describeAiError(error) })
  }
}
