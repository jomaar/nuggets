import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/** GET /api/concepts — all concepts with label and nugget count */
export async function GET() {
  const concepts = await prisma.concept.findMany({
    include: {
      labels: true,
      _count: { select: { nuggets: true } },
    },
    orderBy: { nuggets: { _count: 'desc' } },
  })
  return NextResponse.json(concepts)
}
