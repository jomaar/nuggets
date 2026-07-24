import { NextResponse } from 'next/server'
import { buildInsightPrompt } from '@/lib/insights'

/**
 * GET /api/insights/[id]/prompt — the insight as a self-contained Markdown block
 * (insight + involved concepts + underlying notes in full) for the card's copy
 * button, so the user can paste it into any LLM and keep working. Public read
 * like the other insight/nugget GETs; no model call (pure DB assembly).
 * Returns { markdown }.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const markdown = await buildInsightPrompt(id)
  if (markdown == null) {
    return NextResponse.json({ error: 'Insight nicht gefunden' }, { status: 404 })
  }
  return NextResponse.json({ markdown })
}
