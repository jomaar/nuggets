import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isOwner } from '@/lib/auth'
import { sanitizeMarkScheme } from '@/lib/marking'
import {
  listMarkTemplates,
  toTemplateView,
  TEMPLATE_SELECT,
  TEMPLATE_NAME_MAX,
  TEMPLATE_DESCRIPTION_MAX,
} from '@/lib/markTemplates'

// GET /api/mark-templates
//
// Public read, consistent with /api/nuggets, /api/concepts, /api/marks — a
// template is just a naming scheme, nothing private. Writes below are owner-only.
export async function GET() {
  return NextResponse.json(await listMarkTemplates())
}

// POST /api/mark-templates — "Als Vorlage speichern" from a nugget's legend.
export async function POST(req: NextRequest) {
  if (!await isOwner()) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, TEMPLATE_NAME_MAX) : ''
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const scheme = sanitizeMarkScheme(body.scheme)
  if (!scheme) return NextResponse.json({ error: 'invalid scheme' }, { status: 400 })
  if (Object.keys(scheme).length === 0) {
    return NextResponse.json({ error: 'scheme is empty' }, { status: 400 })
  }
  // A glossary is optional — a scheme saved from a nugget usually has none.
  const glossary = sanitizeMarkScheme(body.glossary ?? {}) ?? {}

  const description = typeof body.description === 'string'
    ? body.description.trim().slice(0, TEMPLATE_DESCRIPTION_MAX)
    : ''

  // `name` is unique — surfacing the clash as 409 lets the client ask for
  // another name instead of silently overwriting a template in use.
  const clash = await prisma.markTemplate.findUnique({ where: { name }, select: { id: true } })
  if (clash) return NextResponse.json({ error: 'name already exists' }, { status: 409 })

  const created = await prisma.markTemplate.create({
    data: { name, description, scheme: JSON.stringify(scheme), glossary: JSON.stringify(glossary) },
    select: TEMPLATE_SELECT,
  })
  return NextResponse.json(toTemplateView(created), { status: 201 })
}
