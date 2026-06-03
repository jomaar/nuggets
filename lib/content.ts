import { marked } from 'marked'

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
