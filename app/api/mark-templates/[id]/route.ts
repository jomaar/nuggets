import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isOwner } from '@/lib/auth'
import { sanitizeMarkScheme } from '@/lib/marking'
import {
  toTemplateView,
  TEMPLATE_SELECT,
  TEMPLATE_NAME_MAX,
  TEMPLATE_DESCRIPTION_MAX,
} from '@/lib/markTemplates'

// PATCH /api/mark-templates/:id — rename / re-word a template (owner only).
// Built-ins ARE editable (the owner may want different wording); only deleting
// them is refused, so a redeploy's seed always finds them again.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isOwner()) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()

  const data: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, TEMPLATE_NAME_MAX) : ''
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
    const clash = await prisma.markTemplate.findUnique({ where: { name }, select: { id: true } })
    if (clash && clash.id !== id) return NextResponse.json({ error: 'name already exists' }, { status: 409 })
    data.name = name
  }
  if (body.description !== undefined) {
    data.description = typeof body.description === 'string'
      ? body.description.trim().slice(0, TEMPLATE_DESCRIPTION_MAX)
      : ''
  }
  if (body.scheme !== undefined) {
    const scheme = sanitizeMarkScheme(body.scheme)
    if (!scheme) return NextResponse.json({ error: 'invalid scheme' }, { status: 400 })
    data.scheme = JSON.stringify(scheme)
  }
  if (body.glossary !== undefined) {
    const glossary = sanitizeMarkScheme(body.glossary)
    if (!glossary) return NextResponse.json({ error: 'invalid glossary' }, { status: 400 })
    data.glossary = JSON.stringify(glossary)
  }

  const updated = await prisma.markTemplate.update({ where: { id }, data, select: TEMPLATE_SELECT })
  return NextResponse.json(toTemplateView(updated))
}

// DELETE /api/mark-templates/:id (owner only).
//
// Built-ins are refused: the seed would just recreate them on the next deploy,
// so allowing it would look like a bug. Nuggets referencing a deleted template
// are unaffected — the FK is ON DELETE SET NULL and marks render from the
// nugget's own `markScheme`, which the template only ever copied into.
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isOwner()) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params

  const template = await prisma.markTemplate.findUnique({ where: { id }, select: { builtIn: true } })
  if (!template) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (template.builtIn) {
    return NextResponse.json({ error: 'built-in templates cannot be deleted' }, { status: 400 })
  }

  await prisma.markTemplate.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
