import type { AnchorToken } from './bookmarkLink'

// Shared verbatim-quote verification, extracted from lib/insights.ts (where
// `locateInsightPassage` originated it) once a second caller — the
// Spinnennetz knowledge-unit segmentation in lib/knowledgeUnits.ts — needed
// the exact same check: an LLM claims to have copied a quote character-for-
// character out of a nugget's plain text, and this turns that claim into a
// real, resolvable text-quote anchor (or null if the claim doesn't hold up).

/** Escape a string for safe use inside a RegExp. */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Chars of prefix/suffix captured around a verified quote, matching the bookmark anchor shape. */
const CONTEXT_LEN = 30

/**
 * Build a text-quote anchor (quote + prefix/suffix context, the bookmark
 * shape) from a verbatim quote a model claims to have copied from
 * `contentPlain`. Returns null unless the quote genuinely occurs in the
 * text — exact match first, then a whitespace-flexible fallback (models
 * occasionally re-space). Without a real substring, `findRanges` in the
 * reader can't resolve it, so callers should fall back to a safe default
 * (e.g. jumping to the nugget top) rather than trusting an unverified quote.
 */
export function buildAnchor(contentPlain: string, rawQuote: string): AnchorToken | null {
  const q = rawQuote.trim()
  if (!q) return null

  let idx = contentPlain.indexOf(q)
  let matched = q
  if (idx === -1) {
    const pattern = q.split(/\s+/).map(escapeRegex).join('\\s+')
    const m = new RegExp(pattern).exec(contentPlain)
    if (m) { idx = m.index; matched = m[0] }
  }
  if (idx === -1) return null

  const prefix = contentPlain.slice(Math.max(0, idx - CONTEXT_LEN), idx)
  const suffix = contentPlain.slice(idx + matched.length, idx + matched.length + CONTEXT_LEN)
  return { quote: matched, prefix, suffix }
}
