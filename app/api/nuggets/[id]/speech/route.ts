import { NextRequest, NextResponse } from 'next/server'
import { isOwner } from '@/lib/auth'
import { cachedSpeechSegments, generateSpeechSegments } from '@/lib/speech'

// GET /api/nuggets/:id/speech — public, cached segments only (no AI call, no
// cost). `segments: null` means never generated (or stale — the nugget was
// edited since), same shape either way; the caller decides what to do next.
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const segments = await cachedSpeechSegments(id)
  return NextResponse.json({ segments })
}

// POST /api/nuggets/:id/speech — owner-only: the one path that can spend
// tokens (cache miss). Idempotent — a cache hit returns instantly for free.
export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isOwner())) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await params
  const result = await generateSpeechSegments(id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 })
  return NextResponse.json({ segments: result.segments })
}
