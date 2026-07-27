import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateShortCode } from '@/lib/shortLink'

const MAX_ATTEMPTS = 5

// POST /api/shortlinks — mint (or reuse) a short /s/<code> redirect for an
// external share link. Open to any reader: the Share2 button that triggers
// this isn't owner-gated, and a short code exposes nothing the long `path`
// didn't already expose. Dedupes on `path` so re-sharing the same passage
// returns the existing code instead of growing rows unboundedly.
export async function POST(req: NextRequest) {
  const { nuggetId, path } = await req.json()
  if (!nuggetId || typeof path !== 'string' || !path.startsWith('/nugget/')) {
    return NextResponse.json({ error: 'nuggetId and a /nugget/… path required' }, { status: 400 })
  }

  const existing = await prisma.shortLink.findUnique({ where: { path } })
  if (existing) {
    return NextResponse.json({ code: existing.code })
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = generateShortCode()
    try {
      const link = await prisma.shortLink.create({ data: { code, path, nuggetId } })
      return NextResponse.json({ code: link.code }, { status: 201 })
    } catch (err: unknown) {
      const target = (err as { meta?: { target?: string[] } })?.meta?.target
      if ((err as { code?: string })?.code === 'P2002' && target?.includes('path')) {
        // Lost a race to a concurrent request sharing the same passage.
        const race = await prisma.shortLink.findUnique({ where: { path } })
        if (race) return NextResponse.json({ code: race.code })
      }
      // Otherwise a code collision — retry with a fresh one.
    }
  }
  return NextResponse.json({ error: 'Could not mint a short code' }, { status: 500 })
}
