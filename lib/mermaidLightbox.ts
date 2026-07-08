/**
 * Fullscreen pan-and-zoom overlay for a rendered Mermaid diagram.
 *
 * Inline diagrams are fitted to the text column, which makes their labels
 * unreadably small on phones. Tapping a diagram opens this lightbox: the SVG
 * at its NATURAL size (mermaid's 16px label text), pannable and pinch-zoomable
 * via the `panzoom` library (dynamically imported like mermaid itself).
 * Deliberately a vanilla-DOM overlay, no React — the caller is the Tiptap
 * NodeView in components/MermaidCodeBlock.ts, which is vanilla DOM too.
 * Styling lives in globals.css (`.mermaid-lightbox*`).
 */
// Whether a lightbox is currently open (or opening). A SYNCHRONOUS flag, not
// a DOM check: the overlay is only created after the async panzoom import, so
// a quick double-tap would pass a DOM guard twice and stack two overlays (the
// second capturing the first one's scroll lock as the state to restore).
let isOpen = false

export async function openMermaidLightbox(svg: string): Promise<void> {
  if (isOpen) return
  isOpen = true
  let panzoom: typeof import('panzoom').default
  try {
    panzoom = (await import('panzoom')).default
  } catch (error) {
    isOpen = false
    throw error
  }

  const overlay = document.createElement('div')
  overlay.className = 'mermaid-lightbox'

  const stage = document.createElement('div')
  stage.className = 'mermaid-lightbox-stage'
  stage.innerHTML = svg
  overlay.appendChild(stage)

  // Mermaid emits `width="100%"` plus an inline max-width — both would keep
  // the SVG fitted instead of at natural size. Pin it to its viewBox pixel
  // size so zoom level 1 means "text at full rendered size".
  const svgElement = stage.querySelector('svg')
  const viewBox = svgElement?.viewBox?.baseVal
  if (svgElement && viewBox && viewBox.width > 0) {
    svgElement.style.maxWidth = 'none'
    svgElement.style.width = `${viewBox.width}px`
    svgElement.style.height = `${viewBox.height}px`
  }

  const closeButton = document.createElement('button')
  closeButton.className = 'mermaid-lightbox-close'
  closeButton.setAttribute('aria-label', 'Schließen')
  closeButton.textContent = '✕'
  overlay.appendChild(closeButton)

  document.body.appendChild(overlay)
  // Lock page scrolling while the lightbox is open.
  const previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'

  const zoomer = panzoom(stage, {
    maxZoom: 8,
    minZoom: 0.15,
    bounds: true,
    boundsPadding: 0.1,
  })

  // Start fitted to the viewport (never scaled up past natural size), so the
  // whole diagram is visible before the user zooms in. The stage is a
  // viewport-sized flex box with the SVG centered, so zooming around the
  // viewport center keeps it centered.
  const svgWidth = viewBox?.width ?? 0
  const svgHeight = viewBox?.height ?? 0
  if (svgWidth > 0 && svgHeight > 0) {
    const fit = Math.min(window.innerWidth / svgWidth, window.innerHeight / svgHeight, 1) * 0.92
    zoomer.zoomAbs(window.innerWidth / 2, window.innerHeight / 2, fit)
  }

  /** Tear the overlay down and restore page scrolling. */
  const close = () => {
    zoomer.dispose()
    overlay.remove()
    document.body.style.overflow = previousOverflow
    window.removeEventListener('keydown', onKeyDown)
    isOpen = false
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close()
  }
  closeButton.addEventListener('click', close)
  window.addEventListener('keydown', onKeyDown)
}
