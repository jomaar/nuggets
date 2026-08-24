import { NextRequest, NextResponse } from 'next/server'
import { MAX_PDF_BYTES, pdfToMarkdown } from '@/lib/pdfToMarkdown'
import { PythonToolError } from '@/lib/pythonTools'

export const runtime = 'nodejs'

/** Returns true if the request carries a valid owner session cookie. */
function isOwner(req: NextRequest): boolean {
  const secret = process.env.SESSION_SECRET
  return !!secret && req.cookies.get('session')?.value === secret
}

/**
 * POST /api/tools/pdf-to-markdown — multipart body with `file`, returns
 * { markdown, pages, chars, truncated, title, filename }.
 *
 * Owner-only on purpose. Reading is public everywhere else in this app, but
 * this route accepts an upload and spawns a process for it — the one thing an
 * anonymous visitor must not be able to do. (Note for deployment: nginx caps
 * request bodies at 1 MB by default; the site config raises it, see CLAUDE.md.)
 */
export async function POST(req: NextRequest) {
  if (!isOwner(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Ungültiger Upload.' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Keine Datei empfangen.' }, { status: 400 })
  }
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json(
      { error: `Die Datei ist größer als ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB.` },
      { status: 413 },
    )
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer())
    const result = await pdfToMarkdown(bytes)
    return NextResponse.json({ ...result, filename: file.name })
  } catch (error) {
    if (error instanceof PythonToolError) {
      // The message is written for the user; the detail is for us.
      console.error('[tools/pdf-to-markdown]', error.message, error.detail ?? '')
      return NextResponse.json({ error: error.message }, { status: 422 })
    }
    console.error('[tools/pdf-to-markdown] failed:', error)
    return NextResponse.json({ error: 'Die Umwandlung ist fehlgeschlagen.' }, { status: 500 })
  }
}
