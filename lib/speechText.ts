/**
 * Pure text helpers for "Vorlesen" (read-aloud) — no server dependencies, so
 * this file is safe to import from both lib/speech.ts (server, AI-backed
 * generation) and the client player component (fallback plain reading).
 */

export interface SpeechSegment {
  text: string
  lang: 'de' | 'en' | 'la'
}

const HEBREW_RE = /[֑-״]/
const GREEK_RE = /[Ͱ-Ͽἀ-῿]/

/**
 * Drops whole (whitespace-delimited) tokens that are majority Hebrew or Greek
 * script — the original-language quotes this app's Bible-study nuggets are
 * full of (e.g. "יָדַע שׁוֹר קֹנֵהוּ..."). iOS's speech synthesis has no
 * Biblical-Hebrew or Koine-Greek voice, only modern he-IL/el-GR, so reading
 * them aloud would mispronounce every word — skipping leaves the adjacent
 * German "wörtlich: …" gloss, which already carries the meaning. Deterministic
 * and free (Unicode ranges), unlike the German/English/Latin split below,
 * which needs real language understanding.
 */
export function stripOriginalLanguageQuotes(text: string): string {
  return text
    .split(/(\s+)/)
    .filter(token => {
      if (/^\s*$/.test(token)) return true // keep separators so words don't fuse
      const letters = Array.from(token).filter(ch => /\p{L}/u.test(ch))
      if (letters.length === 0) return true
      const foreign = letters.filter(ch => HEBREW_RE.test(ch) || GREEK_RE.test(ch)).length
      return foreign / letters.length < 0.5
    })
    .join('')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * One verified non-German span, located by exact substring match. `translit`
 * covers romanized Hebrew/Greek pronunciation aids (e.g. "yādaʿ", "mē
 * kauchasthō ho sophos") — these are NOT Latin, they're the original-language
 * quote spelled in Latin letters, and get dropped like the quote itself
 * rather than read in any voice (see {@link buildSpeechSegments}).
 */
export interface ForeignSpan {
  quote: string
  lang: 'en' | 'la' | 'translit'
}

/**
 * Turns a (Hebrew/Greek-stripped) text plus a set of verified foreign-language
 * spans into an ordered, lang-tagged segment list ready for
 * SpeechSynthesisUtterance playback. Only each span's FIRST occurrence is used
 * (same "first match wins" convention as lib/insights.ts's buildAnchor) —
 * spans are located via `text.indexOf`, sorted, and overlaps dropped; gaps
 * between them default to German. `translit` spans are dropped entirely (not
 * read in any voice, same treatment as the Hebrew/Greek script they
 * transliterate). Adjacent same-language segments are merged so a run of
 * German paragraphs around one English sentence stays one utterance instead
 * of many small ones.
 */
export function buildSpeechSegments(text: string, spans: ForeignSpan[]): SpeechSegment[] {
  interface Hit { start: number; end: number; lang: 'en' | 'la' | 'translit' }
  const hits: Hit[] = []
  for (const span of spans) {
    const q = span.quote.trim()
    if (!q) continue
    const start = text.indexOf(q)
    if (start === -1) continue
    hits.push({ start, end: start + q.length, lang: span.lang })
  }
  hits.sort((a, b) => a.start - b.start)

  const kept: Hit[] = []
  let cursor = 0
  for (const hit of hits) {
    if (hit.start < cursor) continue // overlaps an earlier span — drop
    kept.push(hit)
    cursor = hit.end
  }

  const raw: SpeechSegment[] = []
  let pos = 0
  for (const hit of kept) {
    if (hit.start > pos) {
      const de = text.slice(pos, hit.start)
      if (de.trim()) raw.push({ text: de, lang: 'de' })
    }
    if (hit.lang !== 'translit') raw.push({ text: text.slice(hit.start, hit.end), lang: hit.lang })
    pos = hit.end
  }
  if (pos < text.length) {
    const de = text.slice(pos)
    if (de.trim()) raw.push({ text: de, lang: 'de' })
  }

  const merged: SpeechSegment[] = []
  for (const seg of raw) {
    const prev = merged[merged.length - 1]
    if (prev && prev.lang === seg.lang) prev.text += seg.text
    else merged.push({ ...seg })
  }
  return merged
}
