import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isOwner } from '@/lib/auth'

/** Same clause-length spirit as the AI-extracted edge note. */
const NOTE_MAX = 500

// POST /api/nuggets/:id/concepts — manually link an EXISTING concept to this
// nugget (owner-only). Lets the owner force a connection the AI extraction
// missed, without waiting for a re-extraction. Mirrors the shape of an
// `existingConcepts` entry from lib/concepts.ts: relevance + a required,
// thesis-shaped note (the WHY of the link, not just that it exists).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isOwner())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id: nuggetId } = await params
  const { conceptId, note, relevance } = await req.json()

  if (typeof conceptId !== 'string' || !conceptId.trim()) {
    return NextResponse.json({ error: 'conceptId required' }, { status: 400 })
  }
  if (typeof note !== 'string' || !note.trim()) {
    return NextResponse.json({ error: 'note required' }, { status: 400 })
  }

  const concept = await prisma.concept.findUnique({ where: { id: conceptId } })
  if (!concept) return NextResponse.json({ error: 'concept not found' }, { status: 404 })

  const rel = typeof relevance === 'number' && relevance >= 0.3 && relevance <= 1.0 ? relevance : 0.6

  const link = await prisma.nuggetConcept.upsert({
    where: { nuggetId_conceptId: { nuggetId, conceptId } },
    update: { relevance: rel, note: note.trim().slice(0, NOTE_MAX) },
    create: { nuggetId, conceptId, relevance: rel, note: note.trim().slice(0, NOTE_MAX) },
  })
  return NextResponse.json(link, { status: 201 })
}
