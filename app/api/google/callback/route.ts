import { NextRequest, NextResponse } from 'next/server'
import { isOwner } from '@/lib/auth'
import { completeAuthorization } from '@/lib/googleDrive'

/**
 * GET /api/google/callback — where Google sends the user back with the code.
 *
 * Always ends in a redirect to /add (the only place the connection is used),
 * carrying the outcome as a query param so the page can show it. Errors are
 * short German strings, not stack traces: this URL is user-visible.
 */
export async function GET(req: NextRequest) {
  const back = (params: Record<string, string>) =>
    NextResponse.redirect(new URL(`/add?${new URLSearchParams(params)}`, req.nextUrl.origin))

  if (!await isOwner()) return back({ gdrive: 'error', message: 'Nicht angemeldet.' })

  const url    = req.nextUrl.searchParams
  const denied = url.get('error')
  if (denied) return back({ gdrive: 'error', message: 'Zugriff bei Google abgelehnt.' })

  const code  = url.get('code')
  const state = url.get('state')
  const expected = req.cookies.get('google_oauth_state')?.value
  if (!code || !state || !expected || state !== expected) {
    return back({ gdrive: 'error', message: 'Ungültige Antwort von Google (state).' })
  }

  try {
    const email = await completeAuthorization(req, code)
    const res = back({ gdrive: 'connected', email })
    res.cookies.delete('google_oauth_state')
    return res
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Verbindung fehlgeschlagen.'
    return back({ gdrive: 'error', message })
  }
}
