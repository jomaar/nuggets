/**
 * Central marking palettes — the single source of truth for the two marking
 * styles a reader can apply to nugget text:
 *
 *   - Highlights:  <mark data-color="…">  (pastel background washes)
 *   - Underlines:  <u data-color="…">     (thick, saturated decoration lines)
 *
 * The `name` is what gets written to `data-color`; the actual colour lives in
 * the matching CSS variable in globals.css (`.nugget-content mark[data-color]` /
 * `.nugget-content u[data-color]` rules), so themes stay centrally re-tintable.
 * The two palettes share the same 6 names IN THE SAME ORDER on purpose — each
 * index is a pair (e.g. "pink" highlight + "pink" underline are the same hue),
 * so swatch pickers/legends that iterate both palettes line up visually. Only
 * the intensity differs: underline tones are the more saturated member of the
 * pair (a pastel wash is unreadable as a line).
 */

/** Which of the two marking styles a colour belongs to. */
export type MarkKind = 'hl' | 'ul'

/** One selectable marking colour: data-color value, default label, CSS var. */
export interface MarkColor {
  name: string
  label: string
  cssVar: string
}

/**
 * Highlight (background) palette — pastel, Kindle-style washes.
 *
 * ORDER IS SEMANTIC, not arbitrary: it follows the dimension spectrum below
 * (Kern · Grund · Gegen · Folge · Aufbau · Ich), which runs warm → cool and
 * deliberately puts the opposing pair pink/green side by side. Reordering this
 * array only changes DISPLAY order (swatch rows, legend, Denkspuren facet bar)
 * — `name` stays the stored `data-color` value, so there is nothing to migrate.
 */
export const HIGHLIGHT_PALETTE: readonly MarkColor[] = [
  { name: 'yellow', label: 'Gelb', cssVar: 'var(--hl-yellow)' },
  { name: 'orange', label: 'Orange', cssVar: 'var(--hl-orange)' },
  { name: 'pink', label: 'Pink', cssVar: 'var(--hl-pink)' },
  { name: 'green', label: 'Grün', cssVar: 'var(--hl-green)' },
  { name: 'blue', label: 'Blau', cssVar: 'var(--hl-blue)' },
  { name: 'purple', label: 'Lila', cssVar: 'var(--hl-purple)' },
] as const

/**
 * Underline (decoration) palette — same 6 names and order as HIGHLIGHT_PALETTE
 * so the two are always paired (same hue, underline = the more saturated
 * member of the pair; a pastel wash is unreadable as a line).
 */
export const UNDERLINE_PALETTE: readonly MarkColor[] = [
  { name: 'yellow', label: 'Gelb', cssVar: 'var(--ul-yellow)' },
  { name: 'orange', label: 'Orange', cssVar: 'var(--ul-orange)' },
  { name: 'pink', label: 'Pink', cssVar: 'var(--ul-pink)' },
  { name: 'green', label: 'Grün', cssVar: 'var(--ul-green)' },
  { name: 'blue', label: 'Blau', cssVar: 'var(--ul-blue)' },
  { name: 'purple', label: 'Lila', cssVar: 'var(--ul-purple)' },
] as const

/**
 * Resolves a data-color value to its palette CSS var for the given style,
 * falling back to the palette's first colour for unknown/legacy values.
 */
export function markColorVar(kind: MarkKind, name: string): string {
  const palette = kind === 'hl' ? HIGHLIGHT_PALETTE : UNDERLINE_PALETTE
  return (palette.find(c => c.name === name) ?? palette[0]).cssVar
}

// --- Semantic dimensions (colour → meaning) ----------------------------------
// The one rule that makes markings comparable across the whole corpus:
//
//   COLOUR carries the dimension, STYLE carries the level.
//
// Highlights mark STATEMENTS (what the text claims), underlines mark LANGUAGE
// (how the text works) — so a colour's highlight and underline are the same
// idea one level apart. Derived from a real corpus analysis: the average span
// length separates the two styles cleanly (underlines 2.8–5.6 words: connectors,
// imperatives, lexemes; highlights 7.4–14.9 words: theses, poles, own thoughts).
//
// The dimension depends ONLY on the colour, never on the applied template. That
// makes it a TOTAL function over every mark in the app — which is exactly what
// the Denkspuren "Nach Dimension" facet needs, with zero configuration and no
// template lookup. Templates (see `MarkTemplate`) only specialize the LABELS
// inside this fixed frame.

/** One colour's semantic dimension, with a gloss per marking style. */
export interface MarkDimension {
  /** The colour this dimension belongs to (= `data-color` value). */
  color: string
  /** Short dimension name, e.g. "Kern". */
  name: string
  /** What a highlight in this colour means (statement level). */
  hlGloss: string
  /** What an underline in this colour means (language level). */
  ulGloss: string
}

/**
 * The six dimensions, in palette order.
 *
 * Mnemonic: Gelb = worum es geht · Orange = woher es kommt · Pink = wogegen es
 * steht · Grün = was folgt · Blau = wie es gebaut ist · Lila = was ich denke.
 */
export const MARK_DIMENSIONS: readonly MarkDimension[] = [
  {
    color: 'yellow',
    name: 'Kern',
    hlGloss: 'Die zentrale Aussage — worum es in diesem Abschnitt geht.',
    ulGloss: 'Das zentrale Wort — Lexem, Leitwort, Wortfeld.',
  },
  {
    color: 'orange',
    name: 'Grund',
    hlGloss: 'Worauf es sich stützt — Beleg, Parallelstelle, Wortbedeutung.',
    ulGloss: 'Die Verweis- oder Zitatformel, die den Beleg einführt.',
  },
  {
    color: 'pink',
    name: 'Gegen',
    hlGloss: 'Was verneint oder abgewehrt wird — Abgrenzung, Einwand, Warnung.',
    ulGloss: 'Die Negation im Wortlaut — οὐ, μή, ἀλλά, „nicht … sondern".',
  },
  {
    color: 'green',
    name: 'Folge',
    hlGloss: 'Was gilt oder zugesagt wird — der Positiv-Pol, der Indikativ.',
    ulGloss: 'Der Imperativ oder die Folgerung — was daraus zu tun ist.',
  },
  {
    color: 'blue',
    name: 'Aufbau',
    hlGloss: 'Die Denkbewegung — Gliederung, Argumentationsgang, Blaupause.',
    ulGloss: 'Der Konnektor — γάρ, οὖν, δέ, „deshalb", „wenn".',
  },
  {
    color: 'purple',
    name: 'Ich',
    hlGloss: 'Mein eigener Gedanke — Hypothese, Bewertung, Beobachtung.',
    ulGloss: 'Meine offene Frage — unklar, zu prüfen.',
  },
] as const

/**
 * The dimension a colour carries. Unknown/legacy colours fall back to the first
 * dimension, mirroring `markColorVar`'s tolerance.
 */
export function markDimension(color: string): MarkDimension {
  return MARK_DIMENSIONS.find(d => d.color === color) ?? MARK_DIMENSIONS[0]
}

/** The dimension's gloss for a given marking style. */
export function markGloss(kind: MarkKind, color: string): string {
  const dimension = markDimension(color)
  return kind === 'hl' ? dimension.hlGloss : dimension.ulGloss
}

// --- Named colour schemes (per nugget) ---------------------------------------
// A nugget can give each (style, colour) combination its own meaning ("These",
// "Gegenargument", …). The scheme is stored on the nugget as a JSON string
// (`Nugget.markScheme`, same pattern as `tags`): only combinations with a
// custom name are present, keyed `"hl:yellow"` / `"ul:blue"`.

/** Per-nugget colour meanings: markKey → custom label. Sparse (named entries only). */
export type MarkScheme = Record<string, string>

/** Maximum length of one custom colour name (also enforced by the API). */
export const MARK_LABEL_MAX = 60

/** The scheme key for a (style, colour) combination, e.g. "hl:yellow". */
export function markKey(kind: MarkKind, name: string): string {
  return `${kind}:${name}`
}

/**
 * Display label for a (style, colour): the nugget's custom name when one is
 * set, otherwise the palette's default colour label.
 */
export function markLabel(scheme: MarkScheme, kind: MarkKind, name: string): string {
  const custom = scheme[markKey(kind, name)]
  if (custom) return custom
  const palette = kind === 'hl' ? HIGHLIGHT_PALETTE : UNDERLINE_PALETTE
  return palette.find(c => c.name === name)?.label ?? name
}

/** Whether the scheme holds a custom name for this (style, colour). */
export function hasMarkLabel(scheme: MarkScheme, kind: MarkKind, name: string): boolean {
  return Boolean(scheme[markKey(kind, name)])
}

/** Parse a stored `markScheme` JSON string, tolerating null/malformed input. */
export function parseMarkScheme(json: string | null | undefined): MarkScheme {
  if (!json) return {}
  try {
    const parsed = JSON.parse(json)
    return sanitizeMarkScheme(parsed) ?? {}
  } catch {
    return {}
  }
}

/** Every key a scheme may contain — the cross product of style × palette. */
const VALID_MARK_KEYS = new Set<string>([
  ...HIGHLIGHT_PALETTE.map(c => markKey('hl', c.name)),
  ...UNDERLINE_PALETTE.map(c => markKey('ul', c.name)),
])

/**
 * Validate an untrusted scheme value (API input / stored JSON): must be a plain
 * object with known keys and non-empty string values (trimmed, length-capped).
 * Unknown keys and empty names are dropped; a non-object returns null so the
 * API can reject it.
 */
export function sanitizeMarkScheme(input: unknown): MarkScheme | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null
  const scheme: MarkScheme = {}
  for (const [key, value] of Object.entries(input)) {
    if (!VALID_MARK_KEYS.has(key) || typeof value !== 'string') continue
    const label = value.trim().slice(0, MARK_LABEL_MAX)
    if (label) scheme[key] = label
  }
  return scheme
}
