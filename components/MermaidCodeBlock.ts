import CodeBlock, { type CodeBlockOptions } from '@tiptap/extension-code-block'
import { renderMermaidSvg } from '@/lib/mermaidRender'

export interface MermaidCodeBlockOptions extends CodeBlockOptions {
  /**
   * Render ```mermaid code blocks as diagrams instead of code. On in the
   * reading view; off in the edit view (and card previews), where the raw
   * source stays visible and editable.
   */
  renderDiagram: boolean
}

/**
 * CodeBlock extension with Mermaid support (drop-in for StarterKit's copy,
 * which must be disabled via `codeBlock: false` — same pattern as
 * CssVarUnderline). Document model and serialization are IDENTICAL to the
 * stock CodeBlock: the diagram source stays a plain code block in contentHtml
 * (`<pre><code class="language-mermaid">`), only the on-screen presentation
 * changes. Rendering happens in a NodeView, so highlight saves, the Markdown
 * projection and text search are all unaffected.
 */
const MermaidCodeBlock = CodeBlock.extend<MermaidCodeBlockOptions>({
  addOptions() {
    // `parent` is always defined when extending an existing extension; the
    // non-null call keeps the inherited options required in the result type.
    return {
      ...this.parent!(),
      renderDiagram: false,
    }
  },

  addNodeView() {
    return ({ node }) => {
      const language: string | null = node.attrs.language ?? null

      // Anything that isn't a rendered mermaid diagram replicates the stock
      // <pre><code> rendering (a NodeView applies to ALL code blocks; there is
      // no per-node opt-out back to the default renderer).
      if (!this.options.renderDiagram || language !== 'mermaid') {
        const pre = document.createElement('pre')
        const code = document.createElement('code')
        if (language) code.classList.add(this.options.languageClassPrefix + language)
        pre.appendChild(code)
        return { dom: pre, contentDOM: code }
      }

      // Rendered diagram (reading view). No contentDOM: the code text is not
      // part of the visible DOM, so it can't be selected/highlighted — the
      // diagram is a single opaque block, like an image.
      const dom = document.createElement('div')
      dom.className = 'mermaid-diagram'
      let source = node.textContent
      let drawToken = 0

      /** Render the source async; on parse errors fall back to the raw code. */
      const draw = (code: string) => {
        const token = ++drawToken
        renderMermaidSvg(code)
          .then(svg => {
            if (token === drawToken) dom.innerHTML = svg
          })
          .catch(() => {
            if (token !== drawToken) return
            dom.innerHTML = ''
            const pre = document.createElement('pre')
            const codeElement = document.createElement('code')
            codeElement.textContent = code
            pre.appendChild(codeElement)
            dom.appendChild(pre)
          })
      }
      draw(source)

      return {
        dom,
        // Keep the rendered SVG across unrelated document changes (e.g. a
        // highlight saved elsewhere); redraw only when the source changed.
        update: updated => {
          if (updated.type !== node.type || updated.attrs.language !== 'mermaid') return false
          if (updated.textContent !== source) {
            source = updated.textContent
            draw(source)
          }
          return true
        },
        // The async SVG injection must never be reported back to ProseMirror
        // as a document mutation.
        ignoreMutation: () => true,
      }
    }
  },
})

export default MermaidCodeBlock
