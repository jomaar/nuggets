import { prisma } from '@/lib/prisma'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

/**
 * Google Drive import — pick a Google Doc and drop it into a new nugget as
 * Markdown.
 *
 * Why this exists at all: on the Mac a Doc can simply be downloaded as
 * Markdown and fed through the existing file picker in app/add. On the iPhone
 * that route does not exist (the Google Docs app offers no Markdown export
 * and the Files provider hands out no usable text), so the app has to talk to
 * Drive itself.
 *
 * Deliberately NO `googleapis` dependency — that package is tens of megabytes
 * for what amounts to four REST calls. Plain fetch against the documented
 * endpoints keeps the install small and the failure modes visible.
 *
 * Security note: this module reads the owner's private Drive. Every route that
 * calls into it MUST be owner-guarded (lib/auth `isOwner`) — that is the
 * exception to this app's convention that reads are public.
 */

const AUTH_ENDPOINT  = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke'
const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo'
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files'

/** Drive's mime type for a native Google Doc (not an uploaded .docx). */
export const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document'

/**
 * drive.readonly is needed to LIST arbitrary Docs; the narrower drive.file
 * scope only ever sees files the app itself created. userinfo.email is just
 * so the settings row can name the connected account.
 */
const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')

/**
 * Same ceiling as /api/extract — a Doc this long is not a nugget, and the
 * downstream Claude call would blow up on it.
 */
const MAX_DOC_CHARS = 100_000

/** Fixed id of the singleton connection row (AppSettings pattern). */
const AUTH_ID = 'global'

export interface GoogleDocSummary {
  id: string
  name: string
  modifiedTime: string
  webViewLink: string
}

export interface GoogleDocContent {
  id: string
  title: string
  markdown: string
  webViewLink: string
  truncated: boolean
  charCount: number
}

/** Thrown when the connection is missing or no longer usable. */
export class GoogleAuthError extends Error {}

/** Thrown when Google is configured but the API call itself failed. */
export class GoogleApiError extends Error {}

function credentials(): { clientId: string; clientSecret: string } {
  const clientId     = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new GoogleAuthError(
      'Google ist nicht konfiguriert (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET fehlen).',
    )
  }
  return { clientId, clientSecret }
}

/** True when the server has OAuth credentials at all (no DB access). */
export function isGoogleConfigured(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET
}

/**
 * The redirect URI must match a value registered in the Google Cloud console
 * EXACTLY. It is derived from the incoming request so prod and the dev host
 * work from one deployment; GOOGLE_REDIRECT_URI overrides when the derived
 * value is wrong (e.g. an extra proxy hop).
 *
 * `origin` is built from the forwarded headers rather than req.url: behind
 * nginx the request arrives over plain HTTP, so req.url reports http:// and
 * Google would reject the mismatch.
 */
export function redirectUri(req: Request): string {
  const override = process.env.GOOGLE_REDIRECT_URI
  if (override) return override
  const host  = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost:3000'
  const proto = req.headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}/api/google/callback`
}

/** Builds the consent-screen URL. `state` is the CSRF token from the cookie. */
export function authorizationUrl(req: Request, state: string): string {
  const { clientId } = credentials()
  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri(req),
    response_type: 'code',
    scope:         SCOPES,
    // offline + consent: without BOTH, Google withholds the refresh token on
    // every authorization after the first, and the connection would silently
    // die an hour later.
    access_type:   'offline',
    prompt:        'consent',
    state,
  })
  return `${AUTH_ENDPOINT}?${params.toString()}`
}

/**
 * Exchanges the one-time code for tokens and stores the singleton row.
 * Returns the connected account's email.
 */
export async function completeAuthorization(req: Request, code: string): Promise<string> {
  const { clientId, clientSecret } = credentials()
  const res = await fetch(TOKEN_ENDPOINT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      code,
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  redirectUri(req),
      grant_type:    'authorization_code',
    }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.access_token) {
    throw new GoogleAuthError(googleErrorText(data) ?? 'Token-Austausch mit Google fehlgeschlagen.')
  }
  if (!data.refresh_token) {
    throw new GoogleAuthError(
      'Google hat kein Refresh-Token geliefert. In den Google-Kontoeinstellungen den Zugriff der App entfernen und erneut verbinden.',
    )
  }

  const email = await fetchEmail(data.access_token)
  const row = {
    email,
    refreshToken: data.refresh_token as string,
    accessToken:  data.access_token as string,
    expiresAt:    expiryFrom(data.expires_in),
    scope:        (data.scope as string) ?? '',
  }
  await prisma.googleAuth.upsert({ where: { id: AUTH_ID }, create: { id: AUTH_ID, ...row }, update: row })
  return email
}

/** Current connection state for the UI. */
export async function connectionStatus(): Promise<{ configured: boolean; connected: boolean; email: string }> {
  const configured = isGoogleConfigured()
  const row = configured ? await prisma.googleAuth.findUnique({ where: { id: AUTH_ID } }) : null
  return { configured, connected: !!row, email: row?.email ?? '' }
}

/**
 * Drops the stored connection. Revoking at Google is best-effort: if that call
 * fails the local row still goes, otherwise a broken connection would be
 * impossible to clear from the UI.
 */
export async function disconnect(): Promise<void> {
  const row = await prisma.googleAuth.findUnique({ where: { id: AUTH_ID } })
  if (!row) return
  await fetch(REVOKE_ENDPOINT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({ token: row.refreshToken }),
  }).catch(() => {})
  await prisma.googleAuth.delete({ where: { id: AUTH_ID } })
}

/**
 * Returns a valid access token, refreshing when the stored one is (nearly)
 * expired. A refresh that Google rejects means the grant is gone for good
 * (revoked, or the 7-day expiry that OAuth clients in "Testing" mode have) —
 * the row is dropped so the UI offers a reconnect instead of failing forever.
 */
async function accessToken(): Promise<string> {
  const { clientId, clientSecret } = credentials()
  const row = await prisma.googleAuth.findUnique({ where: { id: AUTH_ID } })
  if (!row) throw new GoogleAuthError('Google Drive ist nicht verbunden.')

  // 60 s of slack so a token can't expire between this check and the API call.
  if (row.accessToken && row.expiresAt.getTime() - Date.now() > 60_000) return row.accessToken

  const res = await fetch(TOKEN_ENDPOINT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: row.refreshToken,
      grant_type:    'refresh_token',
    }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.access_token) {
    await prisma.googleAuth.delete({ where: { id: AUTH_ID } }).catch(() => {})
    throw new GoogleAuthError(
      'Die Google-Verbindung ist abgelaufen und muss neu hergestellt werden.',
    )
  }
  await prisma.googleAuth.update({
    where: { id: AUTH_ID },
    data:  { accessToken: data.access_token, expiresAt: expiryFrom(data.expires_in) },
  })
  return data.access_token as string
}

/**
 * Lists the owner's Google Docs, newest first. `query` filters by file name
 * (Drive has no relevance ordering, so an unfiltered list is simply the most
 * recently touched documents — which is what the phone case usually wants).
 */
export async function listGoogleDocs(query: string, limit = 30): Promise<GoogleDocSummary[]> {
  const clauses = [`mimeType = '${GOOGLE_DOC_MIME}'`, 'trashed = false']
  const term = query.trim()
  // Single quotes terminate a Drive query string literal; backslash-escape them
  // (and the backslash itself) instead of rejecting names that contain one.
  if (term) clauses.push(`name contains '${term.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`)

  const params = new URLSearchParams({
    q:        clauses.join(' and '),
    orderBy:  'modifiedTime desc',
    pageSize: String(limit),
    fields:   'files(id,name,modifiedTime,webViewLink)',
  })
  const data = await driveJson(`${DRIVE_FILES}?${params.toString()}`)
  const files = Array.isArray(data?.files) ? data.files : []
  return files.map((f: Record<string, unknown>) => ({
    id:           String(f.id ?? ''),
    name:         String(f.name ?? 'Ohne Titel'),
    modifiedTime: String(f.modifiedTime ?? ''),
    webViewLink:  String(f.webViewLink ?? ''),
  }))
}

/**
 * Exports one Doc as Markdown.
 *
 * Drive can export a Doc to text/markdown directly, which keeps headings,
 * lists, emphasis, links and tables intact. Should that fail (older docs and
 * some shared files reject it), fall back to the HTML export and run it
 * through the same Turndown conversion the file picker in app/add uses.
 */
export async function exportGoogleDoc(fileId: string): Promise<GoogleDocContent> {
  const meta = await driveJson(
    `${DRIVE_FILES}/${encodeURIComponent(fileId)}?fields=id,name,mimeType,webViewLink`,
  )
  if (meta?.mimeType !== GOOGLE_DOC_MIME) {
    throw new GoogleApiError('Diese Datei ist kein Google-Docs-Dokument.')
  }

  let markdown = ''
  try {
    markdown = cleanExportedMarkdown(await driveExport(fileId, 'text/markdown'))
  } catch {
    const html = await driveExport(fileId, 'text/html')
    const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' })
    td.use(gfm)
    markdown = cleanExportedMarkdown(td.turndown(html))
  }

  const truncated = markdown.length > MAX_DOC_CHARS
  const text = truncated ? markdown.slice(0, MAX_DOC_CHARS) : markdown
  return {
    id:          String(meta.id),
    title:       String(meta.name ?? 'Ohne Titel'),
    markdown:    text,
    webViewLink: String(meta.webViewLink ?? ''),
    truncated,
    charCount:   text.length,
  }
}

/**
 * Strips what a Doc export carries that a nugget must not.
 *
 * Google inlines every image as a base64 data: URI — a single screenshot can
 * outweigh the entire text and would be pasted straight into contentHtml. The
 * app's content is deliberately image-free (see PLAN.md TODO 5), so images go
 * and only their alt text survives as a marker.
 */
export function cleanExportedMarkdown(markdown: string): string {
  return markdown
    // Reference definitions holding the actual image payload:
    //   [image1]: <data:image/png;base64,…>
    .replace(/^\[[^\]]+\]:\s*<?data:[^\n>]*>?\s*$/gim, '')
    // Reference-style and inline images alike.
    .replace(/!\[([^\]]*)\]\[[^\]]*\]/g, (_m, alt) => (alt ? `[Bild: ${alt}]` : ''))
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_m, alt) => (alt ? `[Bild: ${alt}]` : ''))
    // Docs likes to end every export with a run of empty paragraphs.
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** GET a Drive JSON endpoint with a fresh access token. */
async function driveJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await accessToken()}` } })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new GoogleApiError(googleErrorText(data) ?? 'Google Drive antwortet nicht.')
  return data ?? {}
}

/** GET the export endpoint, which returns the file body rather than JSON. */
async function driveExport(fileId: string, mimeType: string): Promise<string> {
  const url = `${DRIVE_FILES}/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(mimeType)}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await accessToken()}` } })
  if (!res.ok) {
    throw new GoogleApiError(`Export als ${mimeType} fehlgeschlagen (${res.status}).`)
  }
  return res.text()
}

/** Best-effort account email; a failure here must not block the connection. */
async function fetchEmail(token: string): Promise<string> {
  try {
    const res = await fetch(USERINFO_ENDPOINT, { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    return typeof data?.email === 'string' ? data.email : ''
  } catch {
    return ''
  }
}

function expiryFrom(expiresIn: unknown): Date {
  const seconds = typeof expiresIn === 'number' ? expiresIn : 3600
  return new Date(Date.now() + seconds * 1000)
}

/** Pulls the human-readable part out of Google's two error shapes. */
function googleErrorText(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const body = data as Record<string, unknown>
  if (typeof body.error_description === 'string') return body.error_description
  const nested = body.error
  if (typeof nested === 'string') return nested
  if (nested && typeof nested === 'object' && typeof (nested as Record<string, unknown>).message === 'string') {
    return (nested as Record<string, unknown>).message as string
  }
  return null
}
