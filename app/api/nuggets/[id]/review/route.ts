import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sm2, REVIEW_RATINGS, ReviewRating } from '@/lib/sm2'

// POST /api/nuggets/:id/review  { rating: 'again' | 'hard' | 'easy' }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { rating } = await req.json() as { rating: ReviewRating }

  if (!REVIEW_RATINGS[rating]) {
    return NextResponse.json({ error: 'rating must be again | hard | easy' }, { status: 400 })
  }

  // Get latest review state for this nugget
  const latest = await prisma.review.findFirst({
    where: { nuggetId: id },
    orderBy: { createdAt: 'desc' }
  })

  const currentState = {
    intervalDays: latest?.intervalDays ?? 1,
    easeFactor:   latest?.easeFactor   ?? 2.5,
    repetitions:  latest?.repetitions  ?? 0,
    nextReview:   latest?.nextReview   ?? new Date(),
  }

  const next = sm2(currentState, REVIEW_RATINGS[rating])

  const review = await prisma.review.create({
    data: {
      nuggetId:     id,
      nextReview:   next.nextReview,
      intervalDays: next.intervalDays,
      easeFactor:   next.easeFactor,
      repetitions:  next.repetitions,
    }
  })

  return NextResponse.json(review, { status: 201 })
}
