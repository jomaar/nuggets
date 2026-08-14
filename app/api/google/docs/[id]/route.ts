import { NextRequest, NextResponse } from 'next/server'
import { isOwner } from '@/lib/auth'
import { GoogleAuthError, exportGoogleDoc } from '@/lib/googleDrive'

/**
 * GET /api/google/docs/:id — one Doc exported as Markdown, ready for the
 * content field of a new nugget. Owner-only (private Drive).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isOwner()) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params

  try {
    return NextResponse.json(await exportGoogleDoc(id))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Dokument konnte nicht geladen werden.'
    const status  = error instanceof GoogleAuthError ? 409 : 502
    return NextResponse.json({ error: message }, { status })
  }
}
