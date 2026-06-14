import { cookies } from 'next/headers'

/**
 * Returns whether the current request belongs to the owner, based on the
 * session cookie. Single source of truth for the server-side owner check
 * (read once in the root layout instead of each page fetching /api/auth/me).
 */
export async function isOwner(): Promise<boolean> {
  const secret = process.env.SESSION_SECRET
  const session = (await cookies()).get('session')?.value
  return !!secret && session === secret
}
