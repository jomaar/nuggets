import Highlight from '@tiptap/extension-highlight'

/**
 * Highlight mark that persists its colour only as a `data-color` attribute and
 * emits NO inline `background-color` style.
 *
 * Tiptap's stock Highlight mark inlines `style="background-color:…"` when a colour
 * is set, which wins the CSS cascade and overrides our themed palette. By rendering
 * only `data-color`, the CSS-variable rules in globals.css
 * (`.nugget-content mark[data-color="…"]`) stay authoritative, so highlights match
 * the warm theme and can be re-themed centrally.
 */
const CssVarHighlight = Highlight.extend({
  /**
   * Replace the `color` attribute so it round-trips through `data-color` alone.
   */
  addAttributes() {
    return {
      color: {
        default: null,
        // Read back from data-color first; fall back to any legacy inline style.
        parseHTML: (element) =>
          element.getAttribute('data-color') || element.style.backgroundColor || null,
        // Write only data-color — never an inline style.
        renderHTML: (attributes) => {
          if (!attributes.color) return {}
          return { 'data-color': attributes.color }
        },
      },
    }
  },
})

export default CssVarHighlight
