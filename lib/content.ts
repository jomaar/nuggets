import { marked } from 'marked'
import TurndownService from 'turndown'

const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' })
// Highlights (<mark>) are reader annotations, not content. Unwrap them so the
// derived Markdown — and therefore the AI — never sees highlight markup.
turndown.addRule('unwrapHighlight', {
  filter: 'mark',
  replacement: content => content,
})

/**
 * Converts Markdown input to sanitized HTML.
 * If input already looks like HTML, returns it as-is.
 * Always strips script tags for safety.
 */
export function normalizeToHtml(input: string): string {
  const trimmed = input.trim()
  const looksLikeHtml = /^<[a-z][\s\S]*>/i.test(trimmed)

  const html = looksLikeHtml
    ? trimmed
    : marked(trimmed) as string

  return sanitizeHtml(html)
}

/**
 * Derives Markdown from canonical HTML, stripping highlight marks.
 * Used as the projection sent to the AI, which works in Markdown.
 */
export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html)
}

/**
 * Removes ChatGPT-Exporter chrome from imported HTML before it becomes a nugget.
 *
 * The "ChatGPT Exporter" browser extension wraps a conversation in boilerplate:
 *   - a metadata header paragraph (User / Created / Updated / Exported / Link)
 *   - "Prompt:" / "Response:" section headers with a timestamp line each
 *   - a "Powered by ChatGPT Exporter" footer
 * None of that is knowledge worth keeping. We only touch documents that are
 * recognisably exporter output (footer URL or the metadata header present), so
 * ordinary HTML imports pass through untouched — in particular the broad
 * timestamp-paragraph rule never fires on non-exporter content.
 */
export function stripImportBallast(html: string): string {
  const isChatGptExport =
    /chatgptexporter\.com/i.test(html) || /<p><strong>User:<\/strong>/i.test(html)
  if (!isChatGptExport) return html

  return html
    // Metadata header: <p><strong>User:</strong> … <strong>Link:</strong> …</p>
    .replace(/<p><strong>User:<\/strong>[\s\S]*?<\/p>\s*/i, '')
    // Footer: optional <hr> then "Powered by <a …chatgptexporter.com…>…</a>"
    .replace(/(?:<hr\s*\/?>\s*)?<p>\s*Powered by\s*<a [^>]*chatgptexporter\.com[^>]*>[\s\S]*?<\/a>\s*<\/p>\s*/i, '')
    // Q&A scaffolding headers
    .replace(/<h2>\s*(?:Prompt|Response):\s*<\/h2>\s*/gi, '')
    // Timestamp-only paragraphs, e.g. <p>5/4/2026, 4:58:10 PM</p>
    .replace(/<p>\s*\d{1,2}\/\d{1,2}\/\d{4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?\s*<\/p>\s*/gi, '')
    .trim()
}

/**
 * Strips all HTML tags to get plain text for search indexing.
 */
export function htmlToPlain(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Derives a display title from canonical HTML for nuggets without a stored title:
 * the first sentence of the plain text, capped at ~80 chars. Lives here so the
 * server can compute it once (e.g. the list route) and the payload never has to
 * ship full contentHtml just so the client can fall back to it. Mirrors the
 * per-view helpers in app/all, app/concepts and components/NuggetCard.
 */
export function fallbackTitle(contentHtml: string): string {
  const sentence = htmlToPlain(contentHtml).split(/[.!?]/)[0].trim()
  return sentence.length > 80 ? sentence.substring(0, 77) + '…' : sentence
}

/**
 * Server-side HTML sanitizer (no DOMParser available in Node).
 * Removes script/iframe/object tags and dangerous attributes.
 */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')   // remove event handlers
    .replace(/\son\w+='[^']*'/gi, '')
}
