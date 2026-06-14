/**
 * Per-device reading font size for nugget text only. The value is stored in
 * localStorage and applied as the `--nugget-font-size` CSS variable on <html>,
 * which `.nugget-content` reads (globals.css). The rest of the UI is unaffected.
 *
 * Client-only and best-effort: every function degrades gracefully without a
 * window or with localStorage blocked. The flash-free initial apply happens in
 * an inline boot script in layout.tsx; this module drives live changes + reads.
 */

export const MIN_FONT_SIZE = 13
export const MAX_FONT_SIZE = 24
/** Matches the CSS fallback in .tiptap-editor .ProseMirror (the previous size). */
export const DEFAULT_FONT_SIZE = 15
export const FONT_SIZE_STEP = 1

/** localStorage key holding the chosen size in px (a bare integer string). */
const STORAGE_KEY = 'nugget-font-size'

/** Clamp to the supported range and round to a whole pixel. */
function clamp(px: number): number {
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(px)))
}

/** The stored reading size, or the default when unset/invalid. */
export function getNuggetFontSize(): number {
  if (typeof window === 'undefined') return DEFAULT_FONT_SIZE
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const value = raw ? parseInt(raw, 10) : NaN
    return Number.isFinite(value) ? clamp(value) : DEFAULT_FONT_SIZE
  } catch {
    return DEFAULT_FONT_SIZE
  }
}

/**
 * Persist and apply a new reading size (clamped). Returns the value actually
 * applied, so callers can reflect the clamp in their UI state.
 */
export function setNuggetFontSize(px: number): number {
  const value = clamp(px)
  if (typeof window === 'undefined') return value
  document.documentElement.style.setProperty('--nugget-font-size', `${value}px`)
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value))
  } catch {
    /* best-effort */
  }
  return value
}
