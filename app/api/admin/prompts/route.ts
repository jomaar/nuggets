import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/** Returns true if the request carries a valid owner session cookie. */
function isOwner(req: NextRequest): boolean {
  const secret = process.env.SESSION_SECRET
  return !!secret && req.cookies.get('session')?.value === secret
}

// GET /api/admin/prompts — global prompt addition + per-domain prompts (owner only)
export async function GET(req: NextRequest) {
  if (!isOwner(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [settings, domains] = await Promise.all([
    prisma.appSettings.findUnique({ where: { id: 'global' }, select: { globalPromptAddition: true } }),
    prisma.domain.findMany({
      select: { id: true, name: true, slug: true, icon: true, color: true, domainPrompt: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return NextResponse.json({
    globalPromptAddition: settings?.globalPromptAddition ?? '',
    domains,
  })
}

// PATCH /api/admin/prompts — update global addition and/or domain prompts (owner only)
export async function PATCH(req: NextRequest) {
  if (!isOwner(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { globalPromptAddition, domainPrompts } = await req.json()

  if (typeof globalPromptAddition === 'string') {
    await prisma.appSettings.upsert({
      where:  { id: 'global' },
      update: { globalPromptAddition: globalPromptAddition || null },
      create: { id: 'global', globalPromptAddition: globalPromptAddition || null },
    })
  }

  if (domainPrompts && typeof domainPrompts === 'object') {
    for (const [domainId, prompt] of Object.entries(domainPrompts)) {
      if (typeof prompt !== 'string') continue
      await prisma.domain.update({
        where: { id: domainId },
        data:  { domainPrompt: prompt || null },
      })
    }
  }

  return NextResponse.json({ ok: true })
}
