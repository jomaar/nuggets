import { NextResponse } from 'next/server'

/** POST /api/auth/logout — clears the session cookie */
export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set('session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  })
  return res
}
