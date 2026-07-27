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

/**
 * Single-line excerpt header: "Luke 14:33 - 16:4 (ELB03)" — a partial passage that
 * does NOT start at chapter 1 verse 1. Group 1 captures the WHOLE reference ("Luke
 * 14:33 - 16:4", translation stripped) verbatim for use as the nugget title; groups
 * 2/3 are the start chapter:verse for the state machine and group 4 the translation
 * code. The range end is matched but otherwise unused — the actual verse count comes
 * from walking the body, not the header.
 */
const TITLE_RANGE_RE =
  /^((?:.+?)\s+(\d{1,3}):(\d{1,3})(?:\s*[-–]\s*(?:\d{1,3}:)?\d{1,3})?)\s+\(([A-Za-z0-9.\-]{2,12})\)$/

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
function splitHeader(text: string): {
  translation: string
  title: string
  startChapter: number
  startVerse: number
  bodyLines: string[]
} {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  let i = 0

  // Single-line excerpt header ("Luke 14:33 - 16:4 (ELB03)") — start mid-book.
  if (lines[i]) {
    const range = TITLE_RANGE_RE.exec(lines[i])
    if (range) {
      return {
        translation: range[4],
        title: range[1],
        startChapter: parseInt(range[2], 10),
        startVerse: parseInt(range[3], 10),
        bodyLines: lines.slice(i + 1),
      }
    }
  }

  // Two-line full-book header ("(ELB03)" then title) — always starts at 1:1.
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
  return { translation, title, startChapter: 1, startVerse: 1, bodyLines: lines.slice(i) }
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
  start: { chapter: number; verse: number },
  emit?: (piece: { marker?: string; text?: string }) => void
): { chapterCount: number; verseCount: number } {
  let chapter = start.chapter
  let verse = start.verse - 1
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

  return { chapterCount: verseCount > 0 ? chapter - start.chapter + 1 : 0, verseCount }
}

/**
 * Cheap heuristic: does this pasted/loaded text look like a raw Bible book?
 * Safe against ordinary Markdown (ordered lists use "1."/"1)" — the trailing
 * punctuation makes those tokens fail BARE_INT_RE, so they never count as
 * verse markers at all) and against coincidental number sequences in
 * ordinary prose (MIN_VERSE_DENSITY below).
 *
 * Deliberately NOT line-shape-based: source texts vary between one verse per
 * line, one paragraph per line, and hard-wrapped copy from a PDF/reader app
 * (verse numbers landing mid-line at a fixed column width, e.g. critical
 * Greek NT editions) — an earlier version required verse numbers to start
 * most physical LINES, which false-negatived on that last, common case.
 */
const MIN_VERSE_DENSITY = 0.015 // ~1 verse marker per 65 words — real Bible prose runs far denser

export function detectBibleText(text: string): BibleDetection | null {
  if (text.length < 200) return null

  const { translation, title, startChapter, startVerse, bodyLines } = splitHeader(text)
  if (bodyLines.length < 3) return null
  if (!new RegExp(`^${startVerse}\\s`).test(bodyLines[0])) return null

  const { verseCount } = runStateMachine(bodyLines, { chapter: startChapter, verse: startVerse })
  if (verseCount < 10) return null

  const wordCount = bodyLines.reduce((n, l) => n + l.split(/\s+/).filter(Boolean).length, 0)
  if (verseCount / wordCount < MIN_VERSE_DENSITY) return null

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
  const { translation, title, startChapter, startVerse, bodyLines } = splitHeader(text)

  const out: string[] = []
  const { chapterCount, verseCount } = runStateMachine(
    bodyLines,
    { chapter: startChapter, verse: startVerse },
    (piece) => {
      if (piece.marker !== undefined) out.push(`<sup data-verse="${piece.marker}"></sup>`)
      else if (piece.text !== undefined) out.push(escapeHtml(piece.text))
    }
  )

  const body = '<p>' + out.join(' ').replace(/<\/sup>\s+/g, '</sup>') + '</p>'

  return { title, sourceLabel: translation, body, chapterCount, verseCount }
}
