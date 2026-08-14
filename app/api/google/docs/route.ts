import { NextRequest, NextResponse } from 'next/server'
import { isOwner } from '@/lib/auth'
import { GoogleAuthError, listGoogleDocs } from '@/lib/googleDrive'

/**
 * GET /api/google/docs?q=… — the owner's Google Docs, newest first.
 *
 * Owner-only (private Drive). A GoogleAuthError means the grant is gone, which
 * the picker must distinguish from a transient failure: it answers 409 so the
 * UI can offer "neu verbinden" instead of just an error line.
 */
export async function GET(req: NextRequest) {
  if (!await isOwner()) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const docs = await listGoogleDocs(req.nextUrl.searchParams.get('q') ?? '')
    return NextResponse.json({ docs })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google Drive antwortet nicht.'
    const status  = error instanceof GoogleAuthError ? 409 : 502
    return NextResponse.json({ error: message }, { status })
  }
}
