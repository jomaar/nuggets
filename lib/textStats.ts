import { htmlToPlain } from './content'

/** Length read-out of a nugget's body: characters, words and paragraphs. */
export interface TextStats {
  chars: number
  words: number
  paragraphs: number
}

/**
 * Count a plain-text / Markdown draft (as typed in the add form). Paragraphs
 * are blank-line separated blocks.
 */
export function countPlainText(text: string): TextStats {
  const trimmed = text.trim()
  return {
    chars: text.length,
    words: trimmed ? trimmed.split(/\s+/).length : 0,
    paragraphs: trimmed ? trimmed.split(/\n\s*\n/).filter(p => p.trim()).length : 0,
  }
}

/**
 * Count canonical HTML content (the read/edit views). Characters and words are
 * measured on the stripped plain text — not the markup — so a tag-heavy nugget
 * isn't over-counted; paragraphs are counted from block-level tags.
 */
export function countHtml(html: string): TextStats {
  const plain = htmlToPlain(html)
  const blocks = html.match(/<(?:p|li|h[1-6]|blockquote|pre)[\s/>]/gi)?.length ?? 0
  return {
    chars: plain.length,
    words: plain ? plain.split(/\s+/).filter(Boolean).length : 0,
    // Fall back to "1 paragraph" for legacy nuggets stored without block tags.
    paragraphs: blocks || (plain ? 1 : 0),
  }
}
