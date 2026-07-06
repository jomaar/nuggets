import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/** GET /api/concepts/:id — concept with all labels and linked nuggets */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const concept = await prisma.concept.findUnique({
    where: { id },
    include: {
      labels: true,
      nuggets: {
        include: {
          nugget: { include: { domain: true } },
        },
        orderBy: { relevance: 'desc' },
      },
    },
  })

  if (!concept) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(concept)
}
