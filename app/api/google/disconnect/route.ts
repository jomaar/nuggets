import { NextResponse } from 'next/server'
import { isOwner } from '@/lib/auth'
import { disconnect } from '@/lib/googleDrive'

/** POST /api/google/disconnect — drops the stored connection (owner-only). */
export async function POST() {
  if (!await isOwner()) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  await disconnect()
  return NextResponse.json({ connected: false })
}
