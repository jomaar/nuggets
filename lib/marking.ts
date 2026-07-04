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
 * The two palettes are deliberately independent: underline hues are stronger
 * and need not mirror the highlight hues (a pastel wash is unreadable as a line).
 */

/** Which of the two marking styles a colour belongs to. */
export type MarkKind = 'hl' | 'ul'

/** One selectable marking colour: data-color value, default label, CSS var. */
export interface MarkColor {
  name: string
  label: string
  cssVar: string
}

/** Highlight (background) palette — pastel, Kindle-style washes. */
export const HIGHLIGHT_PALETTE: readonly MarkColor[] = [
  { name: 'yellow', label: 'Gelb', cssVar: 'var(--hl-yellow)' },
  { name: 'blue', label: 'Blau', cssVar: 'var(--hl-blue)' },
  { name: 'green', label: 'Grün', cssVar: 'var(--hl-green)' },
  { name: 'pink', label: 'Pink', cssVar: 'var(--hl-pink)' },
  { name: 'orange', label: 'Orange', cssVar: 'var(--hl-orange)' },
  { name: 'purple', label: 'Lila', cssVar: 'var(--hl-purple)' },
] as const

/** Underline (decoration) palette — saturated tones that read as a line. */
export const UNDERLINE_PALETTE: readonly MarkColor[] = [
  { name: 'red', label: 'Rot', cssVar: 'var(--ul-red)' },
  { name: 'blue', label: 'Blau', cssVar: 'var(--ul-blue)' },
  { name: 'green', label: 'Grün', cssVar: 'var(--ul-green)' },
  { name: 'orange', label: 'Orange', cssVar: 'var(--ul-orange)' },
  { name: 'purple', label: 'Lila', cssVar: 'var(--ul-purple)' },
  { name: 'teal', label: 'Türkis', cssVar: 'var(--ul-teal)' },
] as const

/**
 * Resolves a data-color value to its palette CSS var for the given style,
 * falling back to the palette's first colour for unknown/legacy values.
 */
export function markColorVar(kind: MarkKind, name: string): string {
  const palette = kind === 'hl' ? HIGHLIGHT_PALETTE : UNDERLINE_PALETTE
  return (palette.find(c => c.name === name) ?? palette[0]).cssVar
}
