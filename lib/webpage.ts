import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'

/** Max HTML we are willing to download before parsing (guards against
 *  multi-megabyte pages blowing up memory / parse time). */
const MAX_HTML_BYTES = 5_000_000

/** Abort the fetch if the server is too slow to respond fully. */
const FETCH_TIMEOUT_MS = 15_000

/** Pretend to be a normal browser — many sites serve empty/blocked HTML to
 *  obvious bots. */
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36'

/**
 * Pulls the readable article text out of a generic web page.
 *
 * Server-side only (it makes outbound HTTP requests and uses jsdom).
 * Uses Mozilla Readability — the same "reader mode" extraction Firefox ships —
 * to drop nav/ads/footers and keep the main content, then flattens it to plain
 * text with paragraph breaks the AI revision step can work with.
 */
export class WebPage {
  /** True for plain http(s) URLs we can attempt to read. */
  static matches(raw: string): boolean {
    return /^https?:\/\/\S+$/i.test(raw.trim())
  }

  /**
   * Fetch a URL and return its main article text. Throws an Error with a
   * German, user-facing message on any failure (non-HTML, blocked, empty…).
   */
  static async fetchArticleText(url: string): Promise<string> {
    const html = await this.download(url.trim())
    const dom = new JSDOM(html, { url: url.trim() })
    const article = new Readability(dom.window.document).parse()

    const text = article?.content
      ? this.htmlToParagraphs(article.content, dom)
      : this.fallbackBodyText(dom)

    if (!text) {
      throw new Error('Auf der Seite wurde kein lesbarer Text gefunden.')
    }
    // Prefix the article title (if any) so the note keeps its headline.
    const title = article?.title?.trim()
    return title && !text.startsWith(title) ? `# ${title}\n\n${text}` : text
  }

  /**
   * Download the page with a timeout and a hard byte cap. Rejects non-HTML
   * responses early so we never feed a PDF/image into the HTML parser.
   */
  private static async download(url: string): Promise<string> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
        signal: controller.signal,
        redirect: 'follow',
      })
      if (!res.ok) {
        throw new Error(`Seite nicht erreichbar (HTTP ${res.status}).`)
      }
      const contentType = res.headers.get('content-type') ?? ''
      if (!/text\/html|application\/xhtml/i.test(contentType)) {
        throw new Error('Der Link verweist nicht auf eine HTML-Seite.')
      }
      return await this.readCapped(res)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('Zeitüberschreitung beim Laden der Seite.')
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * Read the response body but stop once MAX_HTML_BYTES is reached, so an
   * unexpectedly huge page can't exhaust memory. The truncated HTML is still
   * usable — Readability works on a prefix.
   */
  private static async readCapped(res: Response): Promise<string> {
    if (!res.body) return await res.text()
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let received = 0
    while (received < MAX_HTML_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.length
    }
    await reader.cancel().catch(() => {})
    const merged = new Uint8Array(received)
    let offset = 0
    for (const chunk of chunks) {
      merged.set(chunk.subarray(0, Math.min(chunk.length, received - offset)), offset)
      offset += chunk.length
    }
    return new TextDecoder('utf-8').decode(merged)
  }

  /**
   * Turn Readability's cleaned article HTML into plain text, keeping one blank
   * line between block elements. Selects leaf-ish blocks (headings, paragraphs,
   * list items) to avoid counting nested containers twice.
   */
  private static htmlToParagraphs(articleHtml: string, dom: JSDOM): string {
    const doc = new dom.window.DOMParser().parseFromString(articleHtml, 'text/html')
    const blocks = doc.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, blockquote, pre')
    const lines: string[] = []
    blocks.forEach(el => {
      // Skip blocks that only wrap other selected blocks (e.g. a <li> holding a
      // <p>) — keep the innermost so text isn't duplicated.
      if (el.querySelector('p, li, blockquote, pre')) return
      const text = el.textContent?.replace(/\s+/g, ' ').trim()
      if (text) lines.push(text)
    })
    return lines.join('\n\n')
  }

  /** Last resort when Readability finds no article: raw body text. */
  private static fallbackBodyText(dom: JSDOM): string {
    return dom.window.document.body?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  }
}
