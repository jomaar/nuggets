import { NextRequest, NextResponse } from 'next/server'

/** POST /api/auth/login — checks password, sets session cookie */
export async function POST(req: NextRequest) {
  const { password } = await req.json()

  const adminPassword = process.env.ADMIN_PASSWORD
  const sessionSecret = process.env.SESSION_SECRET

  if (!adminPassword || !sessionSecret) {
    return NextResponse.json({ error: 'Auth not configured' }, { status: 500 })
  }

  if (password !== adminPassword) {
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set('session', sessionSecret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  })
  return res
}
