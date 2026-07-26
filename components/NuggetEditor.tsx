'use client'

import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { TableKit } from '@tiptap/extension-table'
import { useEffect, useRef, useState } from 'react'
import {
  Bold, Italic, MessageSquarePlus, Sparkles, Share2, Check,
  Table2, Rows3, Columns3, TableCellsMerge, Trash2,
} from 'lucide-react'
import { normalizeToHtml } from '@/lib/content'
import CssVarHighlight from './CssVarHighlight'
import CssVarUnderline from './CssVarUnderline'
import VerseMarker from './VerseMarker'
import MermaidCodeBlock from './MermaidCodeBlock'
import AiReworkPopup from './AiReworkPopup'
import {
  HIGHLIGHT_PALETTE, UNDERLINE_PALETTE,
  markLabel, hasMarkLabel, type MarkScheme,
} from '@/lib/marking'

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
  /**
   * Opt-in: show a "comment" action in the selection menu (reading view). The
   * handler reads the live DOM selection itself (the single view tracks it via
   * selectionchange); afterwards the editor selection is collapsed so the menu
   * closes.
   */
  onComment?: () => void
  /**
   * Opt-in: show a "copy external link" action in the selection menu (reading
   * view). Copies an ABSOLUTE deep link to the selection for sharing outside
   * the app; the handler reads the live DOM selection itself (same pattern as
   * onComment). Unlike onComment, the selection is NOT collapsed afterward —
   * there's no sheet to open as confirmation, so `externalLinkCopied` flips
   * the button's icon to a checkmark in place while the menu stays open.
   */
  onExternalLink?: () => void
  /** Briefly true after a successful onExternalLink copy (see above). */
  externalLinkCopied?: boolean
  /**
   * Per-nugget colour meanings (lib/marking.ts). Named colours show their name
   * as a mini label under the swatch (iOS has no hover tooltips).
   */
  markScheme?: MarkScheme
  /**
   * Opt-in: render ```mermaid code blocks as diagrams (single reading view).
   * Off by default so the edit view and card previews keep the editable code.
   */
  renderMermaid?: boolean
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
 * A GFM table delimiter row (e.g. `|---|:--:|--:|` or `---|---`) — the line
 * of dashes/colons under a table's header row. Requires at least one `|`
 * between two dash segments so a plain `---` horizontal rule / setext
 * heading underline is never mistaken for one; this is the most specific
 * signal a pasted table has, since (unlike the header/body rows) prose
 * essentially never produces a line shaped like this by accident. It's what
 * `marked` itself requires to recognize a table, so this alone predicts
 * whether normalizeToHtml would actually render one — no separate check
 * for a leading `|` on other rows is needed, and it also catches the GFM
 * variant without outer pipes (`Col A | Col B` header, no leading `|`).
 */
const TABLE_DELIMITER_RE = /^[ \t]{0,3}\|?[ \t]*:?-+:?[ \t]*\|[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/m

/**
 * Heuristic: does pasted plain text look like block-level Markdown?
 * Inline-only markdown (**bold**, *italic*) is left to Tiptap's built-in
 * bold/italic paste rules; we only take over when block syntax (headings,
 * blockquotes, lists, code fences, tables) would otherwise land as literal
 * text. Requires a multi-line paste so a fragment like "5. Mose" pasted into
 * a sentence is never mistaken for an ordered list.
 */
function looksLikeMarkdownBlocks(text: string): boolean {
  if (!text.includes('\n')) return false
  return /^\s{0,3}(#{1,6}\s|>\s|[-*+]\s|\d+[.)]\s|```)/m.test(text) || TABLE_DELIMITER_RE.test(text)
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
  onComment,
  onExternalLink,
  externalLinkCopied = false,
  markScheme = {},
  renderMermaid = false,
}: NuggetEditorProps) {
  // The selected passage handed to the AI rework popup (null = popup closed).
  const [reworkText, setReworkText] = useState<string | null>(null)
  // The document range the popup's result will replace. Captured when the popup
  // opens, because focusing the popup's inputs drops the visible DOM selection —
  // ProseMirror keeps its state, but we replace by explicit range to be safe.
  const reworkRange = useRef<{ from: number; to: number } | null>(null)
  // Lets handlePaste (captured once by useEditor) reach the live editor instance.
  const editorRef = useRef<Editor | null>(null)
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
        // StarterKit (v3) also bundles Underline — disabled because our
        // CssVarUnderline (colour via data-color) replaces it; two copies of
        // the same mark would trigger the duplicate-extension warning.
        underline: false,
        // Same pattern for CodeBlock: replaced by MermaidCodeBlock below
        // (identical document model, adds diagram rendering in the reading view).
        codeBlock: false,
      }),
      MermaidCodeBlock.configure({ renderDiagram: renderMermaid }),
      // Bundles Table/TableRow/TableHeader/TableCell in one extension. Column
      // drag-resize (edit view only in practice — the reading view is never
      // editable, so no resize handles render there); the resulting per-column
      // width lives in a <colgroup>, which survives the sanitize/Markdown
      // round-trip untouched (dropped only by the GFM table rule, which
      // doesn't model column widths).
      TableKit.configure({ table: { resizable: true } }),
      CssVarHighlight.configure({ multicolor: true }),
      CssVarUnderline,
      // Bible verse markers — MUST stay registered: Tiptap's schema is an
      // allowlist, and even the read-only reader re-serializes for the
      // highlight save, which would erase unregistered <sup data-verse> atoms.
      VerseMarker,
      Placeholder.configure({ placeholder: placeholder ?? 'Schreibe dein Nugget…' }),
    ],
    content: value,
    editorProps: {
      // Markdown pasted as plain text (e.g. via a chat app's copy button) used
      // to land literally: Tiptap only parses HTML on paste, and its built-in
      // bold/italic paste rules made the result look half-converted. Route
      // block-level markdown through the same marked+sanitize pipeline the
      // add form uses. Clipboard HTML keeps native handling untouched.
      handlePaste: (_view, event) => {
        const clipboard = event.clipboardData
        if (!clipboard || clipboard.getData('text/html').trim()) return false
        const text = clipboard.getData('text/plain')
        if (!text || !looksLikeMarkdownBlocks(text)) return false
        editorRef.current?.chain().focus().insertContent(normalizeToHtml(text)).run()
        return true
      },
    },
    // Report the normalized baseline so callers can detect real edits vs. mount-time
    // re-serialization (see NuggetCard's no-op-save suppression).
    onCreate: ({ editor }) => onReady?.(editor.getHTML()),
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
  })

  // Keep the paste handler's editor reference current.
  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  // Keep the editor in sync when the value is replaced from the outside
  // (e.g. after the nugget finishes loading), without clobbering user typing.
  useEffect(() => {
    if (!editor) return
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false })
    }
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

  /**
   * Apply a coloured underline to the current selection. Same focus rule as
   * applyHighlight. Uses setMark directly because the stock setUnderline
   * command takes no attributes.
   */
  const applyUnderline = (colorName: string) => {
    if (!editor) return
    const chain = editor.chain()
    if (editor.isEditable) chain.focus()
    chain.setMark('underline', { color: colorName }).run()
  }

  /** Remove both marking styles (highlight + underline) from the selection. */
  const removeMarks = () => {
    if (!editor) return
    const chain = editor.chain()
    if (editor.isEditable) chain.focus()
    chain.unsetHighlight().unsetUnderline().run()
  }

  /**
   * Toggle bold/italic on the selection. Edit-view only — unlike the colour
   * marks these change the document structure itself, and there's no
   * keyboard shortcut fallback on iOS (no Cmd+B without a physical keyboard).
   */
  const toggleBold = () => editor?.chain().focus().toggleBold().run()
  const toggleItalic = () => editor?.chain().focus().toggleItalic().run()

  /**
   * Hand the current selection to the comment handler (reading view only),
   * then collapse the editor selection so the BubbleMenu closes. The DOM
   * selection is cleared too — the caller has already captured it.
   */
  const commentSelection = () => {
    if (!editor || !onComment) return
    const { to } = editor.state.selection
    onComment()
    editor.chain().setTextSelection(to).run()
    window.getSelection()?.removeAllRanges()
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

  /**
   * Table structure toolbar (edit view only, always visible above the editor —
   * unlike the marking/comment actions above, these aren't selection-bound: an
   * empty cursor position is enough to insert a table or grow the current one).
   * Nested tables aren't in the schema, so "insert" only shows outside a table;
   * once the cursor is inside one, row/column/delete actions take its place.
   */
  const insertTable = () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  const addColumn = () => editor?.chain().focus().addColumnAfter().run()
  const deleteColumn = () => editor?.chain().focus().deleteColumn().run()
  const addRow = () => editor?.chain().focus().addRowAfter().run()
  const deleteRow = () => editor?.chain().focus().deleteRow().run()
  const mergeOrSplitCells = () => editor?.chain().focus().mergeOrSplit().run()
  const deleteTable = () => editor?.chain().focus().deleteTable().run()

  // Whether a swatch row contains any custom-named colour (label slots are
  // rendered row-wide so the swatches stay on one baseline).
  const hlRowNamed = HIGHLIGHT_PALETTE.some(c => hasMarkLabel(markScheme, 'hl', c.name))
  const ulRowNamed = UNDERLINE_PALETTE.some(c => hasMarkLabel(markScheme, 'ul', c.name))

  return (
    <div className={`tiptap-editor nugget-content${editable ? '' : ' tiptap-readonly'}`}>
      {editor && (
        <BubbleMenu
          editor={editor}
          // Append to document.body instead of Tiptap's default (a sibling of
          // the ProseMirror DOM, i.e. INSIDE contentRef in the reading view).
          // The single view's anchor-context builders (bookmarks/comments/
          // external links) walk a Range bounded by contentRef's end — with
          // the default placement, an open menu's own text (e.g. the "✕"
          // remove button) could leak into a quote's captured prefix/suffix.
          appendTo={() => document.body}
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
            {/* Bold/Italic toggle — edit view only. No colour-mark keyboard-shortcut
                fallback exists on iOS (no Cmd+B without a physical keyboard), so this
                is the only way to remove bold/italic there. */}
            {editor.isEditable && (
              <div className="highlight-menu-row">
                <button
                  type="button"
                  className={`format-toggle${editor.isActive('bold') ? ' is-active' : ''}`}
                  aria-label="Fett"
                  aria-pressed={editor.isActive('bold')}
                  title="Fett"
                  onClick={toggleBold}
                >
                  <Bold size={16} />
                </button>
                <button
                  type="button"
                  className={`format-toggle${editor.isActive('italic') ? ' is-active' : ''}`}
                  aria-label="Kursiv"
                  aria-pressed={editor.isActive('italic')}
                  title="Kursiv"
                  onClick={toggleItalic}
                >
                  <Italic size={16} />
                </button>
              </div>
            )}
            {/* Custom colour names show as a mini label under the swatch. When a
                row has at least one name, EVERY cell in it gets a label slot
                (blank if unnamed) so all swatches keep the same baseline. */}
            {/* Row 1: highlight (background) colours + remove-both. */}
            <div className="highlight-menu-row">
              {HIGHLIGHT_PALETTE.map((color) => {
                const label = markLabel(markScheme, 'hl', color.name)
                const named = hasMarkLabel(markScheme, 'hl', color.name)
                return (
                  <div key={color.name} className="swatch-cell">
                    <button
                      type="button"
                      className="highlight-swatch"
                      style={{ background: color.cssVar }}
                      aria-label={`Markieren: ${label}`}
                      title={label}
                      onClick={() => applyHighlight(color.name)}
                    />
                    {hlRowNamed && <span className="swatch-label">{named ? label : '\u00a0'}</span>}
                  </div>
                )
              })}
              <div className="swatch-cell">
                <button
                  type="button"
                  className="highlight-remove"
                  aria-label="Markierung entfernen"
                  title="Markierung entfernen"
                  onClick={removeMarks}
                >
                  ✕
                </button>
                {hlRowNamed && <span className="swatch-label">{'\u00a0'}</span>}
              </div>
            </div>
            {/* Row 2: underline colours (swatch = thick colour bar at the base). */}
            <div className="highlight-menu-row">
              {UNDERLINE_PALETTE.map((color) => {
                const label = markLabel(markScheme, 'ul', color.name)
                const named = hasMarkLabel(markScheme, 'ul', color.name)
                return (
                  <div key={color.name} className="swatch-cell">
                    <button
                      type="button"
                      className="underline-swatch"
                      style={{ boxShadow: `inset 0 -0.34rem 0 ${color.cssVar}` }}
                      aria-label={`Unterstreichen: ${label}`}
                      title={label}
                      onClick={() => applyUnderline(color.name)}
                    />
                    {ulRowNamed && <span className="swatch-label">{named ? label : '\u00a0'}</span>}
                  </div>
                )
              })}
              {/* Reading view only: attach a margin comment to the selection. */}
              {onComment && (
                <div className="swatch-cell">
                  <button
                    type="button"
                    className="highlight-ai"
                    aria-label="Kommentar hinzufügen"
                    title="Kommentar hinzufügen"
                    onClick={commentSelection}
                  >
                    <MessageSquarePlus size={22} />
                  </button>
                  {ulRowNamed && <span className="swatch-label">{'\u00a0'}</span>}
                </div>
              )}
              {/* Reading view only: copy an absolute link to the selection for
                  sharing outside the app. */}
              {onExternalLink && (
                <div className="swatch-cell">
                  <button
                    type="button"
                    className="highlight-ai"
                    aria-label="Externen Link kopieren"
                    title="Externen Link kopieren"
                    onClick={onExternalLink}
                  >
                    {externalLinkCopied ? <Check size={22} /> : <Share2 size={22} />}
                  </button>
                  {ulRowNamed && <span className="swatch-label">{'\u00a0'}</span>}
                </div>
              )}
              {/* Edit view only: rework the selected passage with the AI. */}
              {enableAiRework && editor.isEditable && (
                <div className="swatch-cell">
                  <button
                    type="button"
                    className="highlight-ai"
                    aria-label="Mit KI überarbeiten"
                    title="Mit KI überarbeiten"
                    onClick={openRework}
                  >
                    <Sparkles size={22} />
                  </button>
                  {ulRowNamed && <span className="swatch-label">{'\u00a0'}</span>}
                </div>
              )}
            </div>
          </div>
        </BubbleMenu>
      )}
      {editable && editor && (
        <div className="flex flex-wrap items-center gap-1.5 px-1 pb-2">
          {editor.isActive('table') ? (
            <>
              <button
                type="button"
                onClick={addColumn}
                title="Spalte danach einfügen"
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-full"
                style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
              >
                <Columns3 size={13} /> Spalte +
              </button>
              <button
                type="button"
                onClick={deleteColumn}
                title="Spalte löschen"
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-full"
                style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
              >
                <Columns3 size={13} /> Spalte −
              </button>
              <button
                type="button"
                onClick={addRow}
                title="Zeile danach einfügen"
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-full"
                style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
              >
                <Rows3 size={13} /> Zeile +
              </button>
              <button
                type="button"
                onClick={deleteRow}
                title="Zeile löschen"
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-full"
                style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
              >
                <Rows3 size={13} /> Zeile −
              </button>
              <button
                type="button"
                onClick={mergeOrSplitCells}
                title="Zellen verbinden / teilen"
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-full"
                style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
              >
                <TableCellsMerge size={13} /> Verb./Teilen
              </button>
              <button
                type="button"
                onClick={deleteTable}
                title="Tabelle löschen"
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-full"
                style={{ color: 'var(--act-delete)', border: '1px solid var(--act-delete)' }}
              >
                <Trash2 size={13} /> Tabelle
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={insertTable}
              title="Tabelle einfügen"
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-full"
              style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
            >
              <Table2 size={13} /> Tabelle einfügen
            </button>
          )}
        </div>
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
