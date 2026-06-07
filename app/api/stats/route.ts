import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Opus 4.8 pricing (USD per token)
const PRICE_INPUT  = 5  / 1_000_000
const PRICE_OUTPUT = 25 / 1_000_000

export async function GET() {
  const agg = await prisma.nugget.aggregate({
    _count: { id: true },
    _sum:   { aiInputTokens: true, aiOutputTokens: true },
  })

  const totalNuggets = agg._count.id
  const inputTokens  = agg._sum.aiInputTokens  ?? 0
  const outputTokens = agg._sum.aiOutputTokens ?? 0
  const costUsd      = inputTokens * PRICE_INPUT + outputTokens * PRICE_OUTPUT

  return NextResponse.json({ totalNuggets, inputTokens, outputTokens, costUsd })
}
