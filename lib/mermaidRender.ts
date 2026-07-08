/**
 * Client-side Mermaid rendering, shared by the reading view's code-block
 * NodeView (components/MermaidCodeBlock.ts) and the print route
 * (app/nugget/[id]/print/PrintControls.tsx).
 *
 * The mermaid library is heavy (~2 MB), so it is loaded via dynamic import on
 * first use — documents without a diagram never fetch it. Browser-only: both
 * callers are client components; never import this from server code.
 */

let initialized = false
let renderSeq = 0

/**
 * Renders Mermaid source to an SVG markup string. Initializes the library once
 * (securityLevel 'strict': no click handlers / script injection from diagram
 * source). Rejects on invalid source — callers keep the raw code as fallback.
 */
export async function renderMermaidSvg(source: string): Promise<string> {
  const mermaid = (await import('mermaid')).default
  if (!initialized) {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral' })
    initialized = true
  }
  const id = `mermaid-render-${++renderSeq}`
  try {
    const { svg } = await mermaid.render(id, source)
    return svg
  } finally {
    // On a parse error mermaid can leave its temporary render element in the
    // document body — remove it so failed diagrams don't litter the page.
    document.getElementById(id)?.remove()
    document.getElementById('d' + id)?.remove()
  }
}

/**
 * Replaces every ```mermaid code block under `root` with its rendered diagram
 * (a `.mermaid-diagram` wrapper). For static, non-Tiptap HTML — the print
 * route renders raw contentHtml, where the blocks sit as
 * `<pre><code class="language-mermaid">`. Blocks that fail to parse keep
 * their raw code so the document never loses content.
 */
export async function renderMermaidBlocks(root: HTMLElement): Promise<void> {
  const codeBlocks = Array.from(root.querySelectorAll('pre > code.language-mermaid'))
  for (const codeElement of codeBlocks) {
    const pre = codeElement.parentElement
    if (!pre) continue
    try {
      const svg = await renderMermaidSvg(codeElement.textContent ?? '')
      const wrapper = document.createElement('div')
      wrapper.className = 'mermaid-diagram'
      wrapper.innerHTML = svg
      pre.replaceWith(wrapper)
    } catch {
      /* invalid diagram source → keep the raw code block */
    }
  }
}
