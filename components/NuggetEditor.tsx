'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { useEffect } from 'react'
import CssVarHighlight from './CssVarHighlight'

/**
 * Highlight palette offered in the selection BubbleMenu. The `color` value is
 * written to `data-color`; the actual colour comes from the matching CSS variable
 * in globals.css (see `.nugget-content mark[data-color="…"]`).
 */
const HIGHLIGHT_COLORS = [
  { name: 'yellow', label: 'Gelb', cssVar: 'var(--hl-yellow)' },
  { name: 'blue', label: 'Blau', cssVar: 'var(--hl-blue)' },
  { name: 'green', label: 'Grün', cssVar: 'var(--hl-green)' },
  { name: 'pink', label: 'Pink', cssVar: 'var(--hl-pink)' },
  { name: 'orange', label: 'Orange', cssVar: 'var(--hl-orange)' },
] as const

interface NuggetEditorProps {
  /** Current content as HTML (canonical format). */
  value: string
  /** Called with the new HTML whenever the document changes (omit for read-only). */
  onChange?: (html: string) => void
  /**
   * Called once with the editor's own serialization of the initial `value`, as soon
   * as the editor is created. Lets callers establish a save baseline that accounts for
   * Tiptap's HTML normalization (the re-serialized form differs from the stored HTML).
   */
  onReady?: (html: string) => void
  /** Placeholder shown while the editor is empty. */
  placeholder?: string
  /** Whether the content can be edited. Defaults to true. */
  editable?: boolean
}

/**
 * Shared Tiptap rich-text editor for nuggets.
 *
 * The canonical content format is HTML (stored in `contentHtml`); Markdown is only
 * derived server-side as a projection for the AI. This component reads and emits HTML.
 * Multi-color highlights live as a Highlight mark in the same document model, so the
 * editing view and the read-only reading view (`editable={false}`) render them identically.
 */
export default function NuggetEditor({
  value,
  onChange,
  onReady,
  placeholder,
  editable = true,
}: NuggetEditorProps) {
  const editor = useEditor({
    // Avoid SSR hydration mismatch in the Next.js App Router.
    immediatelyRender: false,
    editable,
    extensions: [
      // StarterKit (v3) already bundles the Link extension — configure it here
      // instead of adding a second one (that caused a "duplicate extension" warn
      // and made link behaviour ambiguous). openOnClick is off so the reading
      // view can intercept clicks itself; linkOnPaste/autolink turn a pasted
      // bookmark/highlight deep-link URL into a clickable <a>.
      StarterKit.configure({
        link: { openOnClick: false, linkOnPaste: true, autolink: true },
      }),
      CssVarHighlight.configure({ multicolor: true }),
      Placeholder.configure({ placeholder: placeholder ?? 'Schreibe dein Nugget…' }),
    ],
    content: value,
    // Report the normalized baseline so callers can detect real edits vs. mount-time
    // re-serialization (see NuggetCard's no-op-save suppression).
    onCreate: ({ editor }) => onReady?.(editor.getHTML()),
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
  })

  // Keep the editor in sync when the value is replaced from the outside
  // (e.g. after the nugget finishes loading), without clobbering user typing.
  useEffect(() => {
    if (!editor) return
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor])

  // Reflect prop changes to the editable state.
  useEffect(() => {
    editor?.setEditable(editable)
  }, [editable, editor])

  /**
   * Apply a highlight colour to the current selection. In the read-only reading
   * view we skip `.focus()` so the browser's text selection isn't dropped before
   * the mark is applied.
   */
  const applyHighlight = (colorName: string) => {
    if (!editor) return
    const chain = editor.chain()
    if (editor.isEditable) chain.focus()
    chain.setHighlight({ color: colorName }).run()
  }

  /** Remove any highlight from the current selection. */
  const removeHighlight = () => {
    if (!editor) return
    const chain = editor.chain()
    if (editor.isEditable) chain.focus()
    chain.unsetHighlight().run()
  }

  return (
    <div className={`tiptap-editor nugget-content${editable ? '' : ' tiptap-readonly'}`}>
      {editor && (
        <BubbleMenu
          editor={editor}
          // Show on any non-empty selection — highlighting works in the read-only
          // reading view too (programmatic mark commands run even when editable=false).
          shouldShow={({ editor, from, to }) => from !== to}
        >
          <div className="highlight-menu">
            {HIGHLIGHT_COLORS.map((color) => (
              <button
                key={color.name}
                type="button"
                className="highlight-swatch"
                style={{ background: color.cssVar }}
                aria-label={`Markieren: ${color.label}`}
                title={color.label}
                onClick={() => applyHighlight(color.name)}
              />
            ))}
            <button
              type="button"
              className="highlight-remove"
              aria-label="Markierung entfernen"
              title="Markierung entfernen"
              onClick={removeHighlight}
            >
              ✕
            </button>
          </div>
        </BubbleMenu>
      )}
      <EditorContent editor={editor} />
    </div>
  )
}
