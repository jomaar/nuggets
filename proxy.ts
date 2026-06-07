import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const WRITE_METHODS = new Set(['POST', 'PATCH', 'DELETE'])

/** Returns true if the session cookie matches the SESSION_SECRET. */
function isAuthenticated(req: NextRequest): boolean {
  const secret = process.env.SESSION_SECRET
  if (!secret) return false
  return req.cookies.get('session')?.value === secret
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const auth = isAuthenticated(req)

  // Protect pages → redirect to login
  if (pathname.startsWith('/add') || pathname.startsWith('/edit') || pathname.startsWith('/admin')) {
    if (!auth) {
      const loginUrl = new URL('/login', req.url)
      loginUrl.searchParams.set('from', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  // Protect write API calls (except /api/auth/*)
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth')) {
    if (WRITE_METHODS.has(req.method) && !auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/add', '/edit/:path*', '/admin', '/api/:path*'],
}
