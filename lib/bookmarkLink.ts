// Encode/decode a bookmark's text-quote anchor into a URL-safe token, so a
// reading spot can be deep-linked from one nugget into another. The token
// carries ONLY the anchor (quote + surrounding context); the target nugget id
// lives in the URL path, so `/nugget/<id>?bm=<token>` fully addresses a spot.
//
// Mirrors the anchor shape captured in the reading view (lib counterpart to the
// text-quote anchors documented in CLAUDE.md). Same-origin links built from
// these tokens are intercepted in the reading view and resolved via
// `resolveAnchor()` — surviving reflow/edits like every other bookmark jump.

/** The portable part of a bookmark anchor — enough to re-locate the spot. */
export interface AnchorToken {
  quote: string
  prefix: string
  suffix: string
}

/** Base64url-encode a UTF-8 string (no padding), safe inside a URL query. */
function base64UrlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Decode a base64url string produced by `base64UrlEncode` back to UTF-8. */
function base64UrlDecode(token: string): string {
  const binary = atob(token.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** Serialize an anchor into the opaque `?bm=` token. */
export function encodeAnchorToken(anchor: AnchorToken): string {
  return base64UrlEncode(JSON.stringify(anchor))
}

/** Minimal HTML-escaping for text interpolated into an `<a>` tag. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Copy a deep link to the clipboard as BOTH rich HTML and a plain-text URL.
 *
 * `path` is a SITE-RELATIVE path (e.g. `/nugget/<id>?bm=<token>`). The HTML
 * `<a>` keeps the href relative on purpose: it gets stored verbatim in the
 * target nugget's contentHtml, so it must NOT bake in the current origin —
 * otherwise every pasted link would break on a domain/server move. The reading
 * view resolves the relative href against whatever origin is live. The visible
 * text is human-readable (the highlight text or bookmarked line); the URL stays
 * hidden in the href.
 *
 * The plain-text fallback is made absolute (current origin + path) so a link
 * pasted OUTSIDE the app (chat, notes) is still complete and clickable.
 * Returns false if the clipboard is unavailable.
 */
export async function copyDeepLink(path: string, label: string): Promise<boolean> {
  const text = label.trim() || path
  const html = `<a href="${escapeHtml(path)}">${escapeHtml(text)}</a>`
  const absoluteUrl = `${window.location.origin}${path}`
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html':  new Blob([html],        { type: 'text/html' }),
          'text/plain': new Blob([absoluteUrl], { type: 'text/plain' }),
        }),
      ])
      return true
    }
    await navigator.clipboard.writeText(absoluteUrl)
    return true
  } catch {
    return false
  }
}

/**
 * Parse a `?bm=` token back into an anchor. Returns null on any malformed or
 * incomplete input, so a corrupted link degrades to "no jump" rather than
 * throwing.
 */
export function decodeAnchorToken(token: string): AnchorToken | null {
  try {
    const parsed = JSON.parse(base64UrlDecode(token))
    if (
      parsed &&
      typeof parsed.quote === 'string' && parsed.quote.length > 0 &&
      typeof parsed.prefix === 'string' &&
      typeof parsed.suffix === 'string'
    ) {
      return { quote: parsed.quote, prefix: parsed.prefix, suffix: parsed.suffix }
    }
  } catch {
    /* malformed token — fall through to null */
  }
  return null
}
