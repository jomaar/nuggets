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
 * Strips all HTML tags to get plain text for search indexing.
 */
export function htmlToPlain(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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
