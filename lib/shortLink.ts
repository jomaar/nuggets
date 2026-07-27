import { randomBytes } from 'crypto'

/** 8 URL-safe chars from 6 random bytes — opaque by design (no content leak); not collision-free by construction, so callers must retry on a unique-constraint hit. */
export function generateShortCode(): string {
  return randomBytes(6).toString('base64url')
}
