import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/due  → nuggets whose latest review.nextReview <= now
export async function GET() {
  const now = new Date()

  // Get all nuggets with their latest review
  const nuggets = await prisma.nugget.findMany({
    include: {
      reviews: {
        orderBy: { createdAt: 'desc' },
        take: 1
      }
    }
  })

  const due = nuggets.filter(n => {
    const latest = n.reviews[0]
    if (!latest) return true  // never reviewed → always due
    return latest.nextReview <= now
  })

  return NextResponse.json(due)
}
