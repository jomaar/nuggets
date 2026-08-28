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
 * The plain-text fallback is a MARKDOWN link `[label](absolute-url)`, not a bare
 * URL: the new-nugget form (`app/add`) and the editor preview are Markdown, so a
 * bare URL pasted there shows the raw URL instead of a labelled link. Markdown
 * `[label](url)` renders (via `marked`) to the same hidden-URL hyperlink as the
 * rich HTML variant, and Markdown-aware apps render it too; the URL is absolute
 * (current origin) so it also works outside the app. The HTML `<a>` keeps the
 * href relative for in-app portability (see above). Returns false if the
 * clipboard is unavailable.
 */
export async function copyDeepLink(path: string, label: string): Promise<boolean> {
  const text = label.trim() || path
  const html = `<a href="${escapeHtml(path)}">${escapeHtml(text)}</a>`
  const absoluteUrl = `${window.location.origin}${path}`
  // Escape `[`/`]` so a label with brackets can't break the Markdown link.
  const cleanLabel = label.trim().replace(/[[\]]/g, '\\$&')
  const markdown = cleanLabel ? `[${cleanLabel}](${absoluteUrl})` : absoluteUrl
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html':  new Blob([html],     { type: 'text/html' }),
          'text/plain': new Blob([markdown], { type: 'text/plain' }),
        }),
      ])
      return true
    }
    await navigator.clipboard.writeText(markdown)
    return true
  } catch {
    return false
  }
}

/** Caps a label used as a plain-text prefix — `anchor.quote` is arbitrary user-selected text and can be long. */
function truncateForPlainText(label: string): string {
  return label.length > 80 ? label.slice(0, 77) + '…' : label
}

/**
 * Resolve a site-relative reading-spot path to an ABSOLUTE short `/s/<code>`
 * URL for sharing outside the app. Falls back to the long absolute URL on any
 * network/API failure, so a share never fails outright — it just stays long.
 *
 * Lives here rather than in the reading view because BOTH share entry points
 * need it: the selection menu and the per-mark share button in the marks popup.
 */
export async function shortLinkUrl(nuggetId: string, path: string): Promise<string> {
  const longUrl = `${window.location.origin}${path}`
  try {
    const res = await fetch('/api/shortlinks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nuggetId, path }),
    })
    if (!res.ok) return longUrl
    const { code } = await res.json()
    return code ? `${window.location.origin}/s/${code}` : longUrl
  } catch {
    return longUrl
  }
}

/**
 * Copy an ABSOLUTE URL to the clipboard for sharing OUTSIDE the app
 * (Reminders, Kalender, chat, email) — unlike `copyDeepLink`'s internal
 * cross-nugget links (site-relative href, portable across domain moves), a
 * link meant to leave the app must carry the domain to work from anywhere it
 * lands. `url` is expected to already be absolute (either a short `/s/<code>`
 * link or a long fallback URL — `shortLinkUrl()` above does that round trip and
 * is what every caller should use to build the `url` argument).
 *
 * A short code alone (e.g. `/s/x7k2`) is opaque by design (no slugify/content
 * leak in the URL), so the plain-text flavor puts the human-readable `label`
 * as visible TEXT right next to the link (`"<label> – <url>"`) instead of a
 * bare URL — Reminders/Kalender are plain-text fields, and a Markdown
 * `[label](url)` would show its brackets literally there (see `copyDeepLink`'s
 * comment for why the plain-text flavor never uses Markdown syntax). Rich
 * targets that accept an HTML paste (email, chat, Notes) get a proper
 * labelled hyperlink via the HTML flavor. Returns false if the clipboard is
 * unavailable.
 */
export async function copyExternalDeepLink(url: string, label: string): Promise<boolean> {
  const text = label.trim() || url
  const html = `<a href="${escapeHtml(url)}">${escapeHtml(text)}</a>`
  const plainLabel = truncateForPlainText(label.trim())
  const plainText = plainLabel ? `${plainLabel} – ${url}` : url
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html':  new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plainText], { type: 'text/plain' }),
        }),
      ])
      return true
    }
    await navigator.clipboard.writeText(plainText)
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
