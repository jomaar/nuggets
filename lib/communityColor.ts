/**
 * Deterministic per-community colours for the theme map (Konzept-Wolke).
 *
 * Each detected concept community (see `lib/conceptCommunities.ts`) is a theme; on
 * the /concepts page every concept chip wears its community's colour so themes read
 * as coloured regions of one map. The colour is DERIVED from the community's index
 * via the golden-angle rotation (137.5°): that spreads any number of communities
 * around the hue wheel with near-maximal separation and needs no hand-maintained
 * palette (the user chose deterministic generation over CSS-var palettes).
 *
 * Saturation and lightness are fixed for the app's light-only surfaces: a saturated
 * ink that stays readable as text and border, plus a pale wash for the chip fill.
 * Detection order is stable (Louvain is deterministic, communities come largest
 * first), so the same community keeps the same colour across loads.
 */

/** The two tones a community chip uses. */
export interface CommunityColor {
  /** Saturated tone for text and border. */
  ink: string
  /** Pale background wash for the chip fill. */
  wash: string
}

/** Golden angle in degrees — successive multiples never cluster on the hue wheel. */
const GOLDEN_ANGLE = 137.508

/**
 * Colour for the community at `index` (0-based, in detection order).
 * @returns readable ink + pale wash, both stable for a given index.
 */
export function communityColor(index: number): CommunityColor {
  const hue = (((index * GOLDEN_ANGLE) % 360) + 360) % 360
  const h = hue.toFixed(1)
  return {
    ink:  `hsl(${h}, 58%, 40%)`,
    wash: `hsl(${h}, 64%, 94%)`,
  }
}
