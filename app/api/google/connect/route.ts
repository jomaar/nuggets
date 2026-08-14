import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { isOwner } from '@/lib/auth'
import { authorizationUrl, isGoogleConfigured } from '@/lib/googleDrive'

/**
 * GET /api/google/connect — starts the OAuth consent flow (owner-only).
 *
 * A plain redirect rather than a fetch, because the consent screen is a full
 * page the user has to see. The CSRF `state` is stashed in a short-lived
 * httpOnly cookie and compared in the callback, so a stray callback URL from
 * somewhere else cannot attach a foreign Google account to this app.
 */
export async function GET(req: NextRequest) {
  if (!await isOwner()) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isGoogleConfigured()) {
    return NextResponse.json({ error: 'Google ist auf dem Server nicht konfiguriert.' }, { status: 503 })
  }

  const state = randomBytes(16).toString('hex')
  const res = NextResponse.redirect(authorizationUrl(req, state))
  res.cookies.set('google_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax', // must survive the top-level redirect back from Google
    secure:   req.nextUrl.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https',
    path:     '/',
    maxAge:   600,
  })
  return res
}
