import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isOwner } from '@/lib/auth'

/** Hard cap on a comment's length — mirrors the POST route. */
const BODY_MAX = 10_000

// PATCH /api/annotations/:id — update the comment text (owner-only).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isOwner())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const { body } = await req.json()
  if (typeof body !== 'string') {
    return NextResponse.json({ error: 'body must be a string' }, { status: 400 })
  }
  const annotation = await prisma.annotation.update({
    where: { id },
    data: { body: body.slice(0, BODY_MAX) },
  })
  return NextResponse.json(annotation)
}

// DELETE /api/annotations/:id (owner-only)
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isOwner())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  await prisma.annotation.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
