// Bible book import: detect the raw .txt format (translation code + title header,
// verse numbers inline, chapters only recognizable by the verse counter resetting
// to 1) and convert it into ONE flowing paragraph with empty <sup data-verse="C.V">
// marker atoms. The visible "[C.V]" is CSS-generated (globals.css ::before), so the
// markers never leak into contentPlain (search), contentMarkdown (AI projection) or
// copied text, and the reading view can hide them via the `verses-hidden` class.

export interface BibleDetection {
  /** Translation code from a "(ELB03)"-style first line, if present. */
  translation: string | null
  /** Book title from the header line, if present. */
  title: string | null
}

export interface BibleConversion {
  title: string
  sourceLabel: string
  /** One <p>…</p> of flow text with <sup data-verse> markers (real HTML). */
  body: string
  chapterCount: number
  verseCount: number
}

/** "(ELB03)" → translation code line; short alphanumeric token in parentheses. */
const TRANSLATION_RE = /^\([A-Za-z0-9.\-]{2,12}\)$/

/** A body line starts with a bare verse number ("1 Paulus…") — NOT "1." (markdown list). */
const VERSE_LINE_RE = /^\d{1,3}\s/

/** A whitespace-delimited token that is a bare integer (candidate verse number). */
const BARE_INT_RE = /^\d{1,3}$/

/** Escape text tokens so the assembled body is safe literal HTML. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * A numbered book title without a dot ("2 Korinther", "1 Mose") LOOKS like a
 * verse line. Accept it as a title anyway when it is short and the NEXT line
 * starts with verse 1 — a real verse line in title position would be verse 1
 * itself (long, and never followed by another "1 " line).
 */
const NUMBERED_TITLE_MAX = 48

/** Split the raw file into optional header lines + body lines (trimmed, non-empty). */
function splitHeader(text: string): { translation: string; title: string; bodyLines: string[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  let i = 0
  let translation = ''
  if (lines[i] && TRANSLATION_RE.test(lines[i])) {
    translation = lines[i].slice(1, -1)
    i++
  }
  let title = ''
  if (lines[i]) {
    const candidate = lines[i]
    const next = lines[i + 1]
    const numberedTitle =
      VERSE_LINE_RE.test(candidate) &&
      candidate.length <= NUMBERED_TITLE_MAX &&
      next !== undefined &&
      /^1\s/.test(next)
    if (!VERSE_LINE_RE.test(candidate) || numberedTitle) {
      title = candidate
      i++
    }
  }
  return { translation, title, bodyLines: lines.slice(i) }
}

/**
 * Core verse state machine, shared by detection (dry run) and conversion.
 *
 * A bare-integer token is a verse marker only if it continues the sequence:
 *   n === verse + 1            → next verse (covers the very first "1", verse=0)
 *   n === 1 && verse > 1 &&
 *   token is FIRST on its line → verse reset = new chapter (chapter++)
 * Anything else stays literal text ("40 Jahre" is never swallowed).
 *
 * The line-start restriction on the chapter reset prevents a literal "1" in the
 * middle of a sentence from shifting every following chapter number.
 *
 * Accepted residual risk: a literal number that happens to equal verse+1 becomes
 * a false marker and desyncs the count until the next line-start reset. Rare in
 * practice for Bible prose.
 */
function runStateMachine(
  bodyLines: string[],
  emit?: (piece: { marker?: string; text?: string }) => void
): { chapterCount: number; verseCount: number } {
  let chapter = 1
  let verse = 0
  let verseCount = 0

  for (const line of bodyLines) {
    const tokens = line.split(/\s+/).filter(Boolean)
    tokens.forEach((tok, idx) => {
      if (BARE_INT_RE.test(tok)) {
        const n = parseInt(tok, 10)
        if (n === verse + 1) {
          verse = n
          verseCount++
          emit?.({ marker: `${chapter}.${verse}` })
          return
        }
        if (n === 1 && verse > 1 && idx === 0) {
          chapter++
          verse = 1
          verseCount++
          emit?.({ marker: `${chapter}.1` })
          return
        }
      }
      emit?.({ text: tok })
    })
  }

  return { chapterCount: verseCount > 0 ? chapter : 0, verseCount }
}

/**
 * Cheap heuristic: does this pasted/loaded text look like a raw Bible book?
 * Safe against ordinary Markdown (ordered lists use "1."/"1)" and fail the
 * bare-number line test; the dry-run requirement kills remaining false positives).
 */
export function detectBibleText(text: string): BibleDetection | null {
  if (text.length < 200) return null

  const { translation, title, bodyLines } = splitHeader(text)
  if (bodyLines.length < 3) return null
  if (!/^1\s/.test(bodyLines[0])) return null

  const verseLineShare =
    bodyLines.filter((l) => VERSE_LINE_RE.test(l)).length / bodyLines.length
  if (verseLineShare < 0.8) return null

  const { verseCount } = runStateMachine(bodyLines)
  if (verseCount < 10) return null

  return { translation: translation || null, title: title || null }
}

/**
 * Convert a raw Bible book into scroll-style flow text: header lines removed,
 * all paragraphs joined into ONE <p>, every verse number replaced by an empty
 * <sup data-verse="C.V"></sup> atom glued to the FOLLOWING word (the visual gap
 * comes from CSS margin) — so with markers hidden exactly one space remains
 * between words, and copied text never contains double spaces.
 *
 * The body starts with "<" on purpose: normalizeToHtml's HTML sniff passes it
 * through untouched (no `marked` round-trip that could mangle the markup).
 */
export function convertBibleText(text: string): BibleConversion {
  const { translation, title, bodyLines } = splitHeader(text)

  const out: string[] = []
  const { chapterCount, verseCount } = runStateMachine(bodyLines, (piece) => {
    if (piece.marker !== undefined) out.push(`<sup data-verse="${piece.marker}"></sup>`)
    else if (piece.text !== undefined) out.push(escapeHtml(piece.text))
  })

  const body = '<p>' + out.join(' ').replace(/<\/sup>\s+/g, '</sup>') + '</p>'

  return { title, sourceLabel: translation, body, chapterCount, verseCount }
}
