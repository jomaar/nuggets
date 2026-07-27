import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /s/<code> — resolve an external share short link and redirect to the
// long /nugget/<id>?bm=<token> path. Unknown/expired code redirects home
// (no custom 404 page in this project) rather than showing the stock 404.
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const link = await prisma.shortLink.findUnique({ where: { code }, select: { path: true } })
  if (!link) {
    return NextResponse.redirect(new URL('/', req.nextUrl.origin))
  }
  return NextResponse.redirect(new URL(link.path, req.nextUrl.origin))
}
