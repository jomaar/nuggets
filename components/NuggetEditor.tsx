'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import CssVarHighlight from './CssVarHighlight'
import AiReworkPopup from './AiReworkPopup'

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
  /** Opt-in: show a "rework with AI" action in the selection menu (edit view). */
  enableAiRework?: boolean
}

/**
 * Convert the AI's plain-text result into editor content for insertion. A single
 * block stays inline (so replacing mid-sentence doesn't split the paragraph);
 * blank-line-separated blocks become paragraphs. HTML is escaped so the model's
 * text can never inject markup, and single newlines become <br>.
 */
function reworkToContent(text: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const blocks = text.split(/\n{2,}/).map(b => b.trim()).filter(Boolean)
  if (blocks.length <= 1) return escape(blocks[0] ?? '').replace(/\n/g, '<br>')
  return blocks.map(b => `<p>${escape(b).replace(/\n/g, '<br>')}</p>`).join('')
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
  enableAiRework = false,
}: NuggetEditorProps) {
  // The selected passage handed to the AI rework popup (null = popup closed).
  const [reworkText, setReworkText] = useState<string | null>(null)
  // The document range the popup's result will replace. Captured when the popup
  // opens, because focusing the popup's inputs drops the visible DOM selection —
  // ProseMirror keeps its state, but we replace by explicit range to be safe.
  const reworkRange = useRef<{ from: number; to: number } | null>(null)
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

  /** Open the AI rework popup for the current selection (edit view only). */
  const openRework = () => {
    if (!editor) return
    const { from, to } = editor.state.selection
    if (from === to) return
    const text = editor.state.doc.textBetween(from, to, '\n').trim()
    if (!text) return
    reworkRange.current = { from, to }
    setReworkText(text)
  }

  /** Accept the AI result: replace the captured range with it, then close. */
  const applyRework = (newText: string) => {
    const range = reworkRange.current
    if (editor && range) {
      editor.chain().focus().insertContentAt(range, reworkToContent(newText)).run()
    }
    reworkRange.current = null
    setReworkText(null)
  }

  return (
    <div className={`tiptap-editor nugget-content${editable ? '' : ' tiptap-readonly'}`}>
      {editor && (
        <BubbleMenu
          editor={editor}
          // Pin the menu just UNDER the sticky top bar instead of next to the
          // selection. iOS's native selection callout hugs the selection (and
          // can't be read — it's a UIKit overlay, not in the DOM), so anchoring
          // ours to a fixed spot at the top keeps the two from ever colliding,
          // wherever the selection is. The reference is a zero-size virtual point
          // at the bottom edge of the sticky header (`.sticky`, present in the
          // read + edit views; fallback near the top otherwise).
          getReferencedVirtualElement={() => {
            const bar = typeof document !== 'undefined' ? document.querySelector('.sticky') : null
            const top = bar ? bar.getBoundingClientRect().bottom : 8
            const x = (typeof window !== 'undefined' ? window.innerWidth : 360) / 2
            return { getBoundingClientRect: () => new DOMRect(x, top, 0, 0) }
          }}
          options={{ placement: 'bottom', offset: 8, flip: false, shift: true }}
          // Show on any non-empty selection — highlighting works in the read-only
          // reading view too (programmatic mark commands run even when editable=false).
          shouldShow={({ from, to }) => from !== to}
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
            {/* Edit view only: rework the selected passage with the AI. */}
            {enableAiRework && editor.isEditable && (
              <button
                type="button"
                className="highlight-ai"
                aria-label="Mit KI überarbeiten"
                title="Mit KI überarbeiten"
                onClick={openRework}
              >
                <Sparkles size={22} />
              </button>
            )}
          </div>
        </BubbleMenu>
      )}
      <EditorContent editor={editor} />
      {reworkText !== null && (
        <AiReworkPopup
          selectedText={reworkText}
          onClose={() => { reworkRange.current = null; setReworkText(null) }}
          onReplace={applyRework}
        />
      )}
    </div>
  )
}
