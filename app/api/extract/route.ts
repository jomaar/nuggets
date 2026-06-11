import { NextRequest, NextResponse } from 'next/server'
import { YoutubeLink } from '@/lib/youtube'
import { WebPage } from '@/lib/webpage'
import {
  YoutubeTranscriptError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptVideoUnavailableError,
} from 'youtube-transcript'

/**
 * Hard ceiling on returned text. Guards the downstream Claude call against
 * token blow-ups from very long transcripts or article pages. Beyond this we
 * truncate and tell the client so it can warn the user. ~100k chars ≈ 25k
 * tokens — already far longer than a focused nugget should be.
 */
const MAX_EXTRACT_CHARS = 100_000

/**
 * POST /api/extract  { url }
 *
 * Resolves a link into plain text the user can drop into a new nugget.
 * Runs server-side so it has real network access (the browser can't fetch
 * arbitrary cross-origin URLs). Handles YouTube transcripts and generic web
 * pages; the returned text is capped at MAX_EXTRACT_CHARS.
 */
export async function POST(req: NextRequest) {
  let url = ''
  try {
    const body = await req.json()
    url = typeof body?.url === 'string' ? body.url.trim() : ''
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 })
  }

  if (!url) {
    return NextResponse.json({ error: 'Kein Link angegeben.' }, { status: 400 })
  }

  try {
    if (YoutubeLink.matches(url)) {
      const text = await YoutubeLink.fetchTranscriptText(url)
      return NextResponse.json(capped(text, 'youtube'))
    }
    if (WebPage.matches(url)) {
      const text = await WebPage.fetchArticleText(url)
      return NextResponse.json(capped(text, 'webpage'))
    }
    return NextResponse.json(
      { error: 'Bitte einen gültigen YouTube- oder Webseiten-Link (http/https) angeben.' },
      { status: 422 },
    )
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 422 })
  }
}

/**
 * Apply the hard char cap and report whether truncation happened, so the
 * client can surface it instead of silently dropping content.
 */
function capped(text: string, source: 'youtube' | 'webpage') {
  if (text.length <= MAX_EXTRACT_CHARS) {
    return { text, source, truncated: false, charCount: text.length }
  }
  return {
    text: text.slice(0, MAX_EXTRACT_CHARS),
    source,
    truncated: true,
    charCount: MAX_EXTRACT_CHARS,
  }
}

/**
 * Map a known extraction error to a short German message. YouTube errors get
 * specific wording; WebPage already throws German Errors; anything else falls
 * back to a generic message.
 */
function errorMessage(error: unknown): string {
  if (error instanceof YoutubeTranscriptTooManyRequestError) {
    return 'YouTube drosselt gerade die Anfragen — bitte später erneut versuchen.'
  }
  if (
    error instanceof YoutubeTranscriptDisabledError ||
    error instanceof YoutubeTranscriptNotAvailableError
  ) {
    return 'Für dieses Video gibt es kein abrufbares Transcript.'
  }
  if (error instanceof YoutubeTranscriptVideoUnavailableError) {
    return 'Das Video ist nicht verfügbar.'
  }
  if (error instanceof YoutubeTranscriptError) {
    return 'Konnte das Transcript nicht laden.'
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return 'Unerwarteter Fehler beim Auflösen des Links.'
}
