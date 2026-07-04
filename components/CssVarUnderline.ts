import Underline from '@tiptap/extension-underline'

/**
 * Underline mark with an optional colour, persisted only as `data-color` —
 * the second marking style next to the highlight (see CssVarHighlight).
 *
 * Extends the stock Underline mark (StarterKit's bundled copy is disabled in
 * NuggetEditor to avoid a duplicate) so plain <u> from imported HTML keeps
 * round-tripping unchanged: without a colour no `data-color` is emitted and
 * the element renders as an ordinary underline. Coloured reader underlines
 * (`<u data-color="…">`) get their thick, tinted decoration from the CSS-var
 * rules in globals.css (`.nugget-content u[data-color]`) — no inline style,
 * same reasoning as CssVarHighlight.
 */
const CssVarUnderline = Underline.extend({
  /**
   * Add the colour attribute, round-tripping through `data-color` alone.
   */
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-color') || null,
        // Write only data-color — never an inline style.
        renderHTML: (attributes) => {
          if (!attributes.color) return {}
          return { 'data-color': attributes.color }
        },
      },
    }
  },
})

export default CssVarUnderline
