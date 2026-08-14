import { NextResponse } from 'next/server'
import { isOwner } from '@/lib/auth'
import { connectionStatus } from '@/lib/googleDrive'

/**
 * GET /api/google/status — is Drive configured, and is it connected?
 *
 * Owner-only like every /api/google route: these touch the owner's private
 * Drive, which is the one place where this app's "reads are public" convention
 * must not apply.
 */
export async function GET() {
  if (!await isOwner()) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json(await connectionStatus())
}
