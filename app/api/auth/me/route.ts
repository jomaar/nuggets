import { NextRequest, NextResponse } from 'next/server'

/** GET /api/auth/me — returns whether the current user is the owner */
export async function GET(req: NextRequest) {
  const secret = process.env.SESSION_SECRET
  const isOwner = !!secret && req.cookies.get('session')?.value === secret
  return NextResponse.json({ isOwner })
}
