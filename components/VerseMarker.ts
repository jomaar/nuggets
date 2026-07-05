import { Node, mergeAttributes } from '@tiptap/core'

/**
 * Bible verse marker — an EMPTY inline atom (`<sup data-verse="C.V"></sup>`).
 *
 * The visible "[C.V]" is CSS-generated (globals.css `sup[data-verse]::before`),
 * so the marker contributes nothing to textContent/textBetween: contentPlain,
 * contentMarkdown, annotation quotes and copied reading text all stay clean.
 * `atom` + no content slot means it can never be partially edited; Backspace
 * removes it whole.
 *
 * Registration in NuggetEditor is MANDATORY: Tiptap's schema is an allowlist,
 * and even the read-only reader re-serializes via getHTML() for the highlight
 * save — an unregistered `<sup>` would be silently erased on the first save.
 */
const VerseMarker = Node.create({
  name: 'verseMarker',
  group: 'inline',
  inline: true,
  atom: true,
  // No NodeSelection halo on (iOS) taps; arrow keys just step over the atom.
  selectable: false,

  addAttributes() {
    return {
      verse: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-verse'),
        renderHTML: (attributes) =>
          attributes.verse ? { 'data-verse': attributes.verse } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'sup[data-verse]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['sup', mergeAttributes(HTMLAttributes)]
  },
})

export default VerseMarker
