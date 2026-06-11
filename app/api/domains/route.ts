import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/** GET /api/domains — all domains in display order */
export async function GET() {
  const domains = await prisma.domain.findMany({
    select: { id: true, name: true, slug: true, icon: true, color: true },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(domains)
}
