import { marked } from 'marked'
import TurndownService from 'turndown'
import { tables as turndownTables } from 'turndown-plugin-gfm'

// Turndown's Node type (HTMLElement, via domino server-side) has isBlock/
// isBlank attached at runtime; neither is in the DOM lib types.
interface TurndownNode {
  nodeName: string
  parentNode: TurndownNode | null
  isBlock?: boolean
}

/** Whether a node is a table cell or sits somewhere inside one. */
function isInTableCell(node: TurndownNode | null): boolean {
  for (let n = node; n; n = n.parentNode) {
    if (n.nodeName === 'TD' || n.nodeName === 'TH') return true
  }
  return false
}

// codeBlockStyle 'fenced' is required: Turndown's default is an indented
// block with no language tag, which silently drops ```mermaid (and any other
// language) fences from the AI's Markdown projection and from contentMarkdown.
const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  // A blank Tiptap table cell is a blank <td>/<th> wrapping a blank <p> —
  // Turndown's blank-node check runs BEFORE any addRule (see forNode in
  // turndown's Rules class), so the default '\n\n' block spacing lands
  // inside a pipe-table cell as literal newlines, breaking the one-row-
  // per-line table syntax. Only suppress it there; every other blank node
  // keeps Turndown's normal behaviour.
  blankReplacement: (content, node) => {
    const n = node as unknown as TurndownNode
    return isInTableCell(n) ? '' : n.isBlock ? '\n\n' : ''
  },
})
// GFM pipe-table syntax, so a Tiptap table survives into contentMarkdown (the
// AI's projection) as a real table instead of turndown's default fallback,
// which would just concatenate every cell's text with no row/column structure.
turndown.use(turndownTables)
// The plugin's heading-row detection requires <tbody> to be the table's first
// child; it treats a Tiptap table (always <colgroup> then <tbody>, for the
// column-resize widths) as "no heading row" and keeps the WHOLE table as raw
// HTML instead — colgroups are stripped from the string before conversion
// (see htmlToMarkdown) rather than patched here, since the check runs on the
// table's ORIGINAL children before any node-level rule can intervene.
//
// The plugin also doesn't scope turndown's default paragraph spacing to
// outside table cells: since every (non-blank) Tiptap cell's content is a
// <p>, that spacing would otherwise land INSIDE a pipe-table cell as literal
// newlines too. Only the single-paragraph cell (the overwhelmingly common
// case) is handled — multiple paragraphs in one cell would run together
// with no separator.
turndown.addRule('tableCellParagraph', {
  filter: node => node.nodeName === 'P' && isInTableCell(node.parentNode),
  replacement: content => content,
})
// Highlights (<mark>) and coloured underlines (<u data-color>) are reader
// annotations, not content. Unwrap them so the derived Markdown — and
// therefore the AI — never sees marking markup. Plain <u> is unwrapped too:
// Markdown has no underline syntax, so only the text can survive anyway.
turndown.addRule('unwrapMarkings', {
  filter: ['mark', 'u'],
  replacement: content => content,
})
// Bible verse markers (<sup data-verse>) are empty positional atoms — remove
// them entirely so the AI's Markdown projection reads as pure flow text
// (Turndown pre-collapses whitespace, so no double spaces remain).
turndown.addRule('dropVerseMarkers', {
  filter: node => node.nodeName === 'SUP' && node.getAttribute('data-verse') !== null,
  replacement: () => '',
})

/**
 * Converts Markdown input to sanitized HTML.
 * If input already looks like HTML, returns it as-is.
 * Always strips script tags for safety.
 */
/**
 * A pasted Markdown table sometimes arrives with a blank line between every
 * row — e.g. copied from a rendered chat bubble, where each row was its own
 * visual paragraph and copying that as plain text preserves the blank lines
 * literally. GFM tables require contiguous lines: with a blank line inside,
 * `marked` sees only the header + delimiter as a (near-empty) table and
 * drops every other row as an unrelated paragraph. Collapse a blank line
 * that sits strictly between two pipe-delimited lines before handing the
 * text to marked.
 */
function collapseTableRowBlankLines(markdown: string): string {
  return markdown.replace(/(\|[ \t]*)\r?\n(?:[ \t]*\r?\n)+(?=[ \t]*\|)/g, '$1\n')
}

export function normalizeToHtml(input: string): string {
  const trimmed = input.trim()
  const looksLikeHtml = /^<[a-z][\s\S]*>/i.test(trimmed)

  const html = looksLikeHtml
    ? trimmed
    : marked(collapseTableRowBlankLines(trimmed)) as string

  return sanitizeHtml(html)
}

/**
 * Renders a margin-comment body (stored as Markdown plain text) to sanitized
 * HTML for display. Unlike normalizeToHtml the input is ALWAYS treated as
 * Markdown (a comment is never authored as HTML), and single line breaks are
 * kept (`breaks: true`) — comments are casual notes, not documents.
 */
export function commentMarkdownToHtml(markdown: string): string {
  return sanitizeHtml(marked(markdown.trim(), { breaks: true, async: false }) as string)
}

/**
 * Derives Markdown from canonical HTML, stripping highlight marks.
 * Used as the projection sent to the AI, which works in Markdown.
 */
export function htmlToMarkdown(html: string): string {
  // See the addRule('tableCellParagraph', …) comment above for why colgroups
  // (column-resize widths, meaningless to the AI anyway) are stripped first.
  return turndown.turndown(html.replace(/<colgroup>[\s\S]*?<\/colgroup>/gi, ''))
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
 * HTML sanitizer usable both server-side (no DOMParser in Node) and client-side.
 * Removes script/iframe/object tags and dangerous attributes.
 */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')   // remove event handlers
    .replace(/\son\w+='[^']*'/gi, '')
}
