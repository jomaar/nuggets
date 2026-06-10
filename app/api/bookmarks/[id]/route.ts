import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// DELETE /api/bookmarks/:id
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.bookmark.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
