import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isOwner } from '@/lib/auth'

// DELETE /api/nuggets/:id/concepts/:conceptId — remove one edge (owner-only).
// The concept node itself is left untouched even if this was its last edge;
// orphan sweeping happens explicitly elsewhere (nugget delete, maintenance script).
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string; conceptId: string }> }) {
  if (!(await isOwner())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id: nuggetId, conceptId } = await params
  await prisma.nuggetConcept.deleteMany({ where: { nuggetId, conceptId } })
  return new NextResponse(null, { status: 204 })
}
