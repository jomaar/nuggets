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

  // Size the SVG itself to fit the viewport (never scaled up past natural
  // size), so zoom level 1 = "whole diagram visible". Crucially the STAGE is
  // never scaled below the viewport: minZoom is 1, so the gesture surface
  // always covers the whole screen. (The first version scaled the stage down
  // to fit instead — fingers landing outside the shrunken stage then went to
  // Safari's native page zoom, which killed the pinch mid-gesture, let the
  // diagram drift, and displaced the fixed ✕ button's hit area.)
  const svgElement = stage.querySelector('svg')
  const viewBox = svgElement?.viewBox?.baseVal
  if (svgElement && viewBox && viewBox.width > 0 && viewBox.height > 0) {
    const fit =
      Math.min(window.innerWidth / viewBox.width, window.innerHeight / viewBox.height, 1) * 0.92
    svgElement.style.maxWidth = 'none'
    svgElement.style.width = `${viewBox.width * fit}px`
    svgElement.style.height = `${viewBox.height * fit}px`
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
    maxZoom: 10,
    // Never below the fitted overview — this both gives "zoom fully out" a
    // natural resting point and keeps the stage covering the viewport (see
    // the sizing comment above).
    minZoom: 1,
    // No kinetic momentum: on iOS a pinch can lose a touch mid-gesture
    // (system edge gestures), and leftover momentum then made the diagram
    // drift away on its own. Direct 1:1 gestures only.
    smoothScroll: false,
  })

  /** Tear the overlay down and restore page scrolling. */
  const close = () => {
    // Overlay removal first — if panzoom's dispose ever throws, the user must
    // still get their page back.
    overlay.remove()
    document.body.style.overflow = previousOverflow
    window.removeEventListener('keydown', onKeyDown)
    isOpen = false
    try {
      zoomer.dispose()
    } catch {
      /* already torn down with the DOM */
    }
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close()
  }
  // iOS Safari doesn't reliably synthesize a click here (gesture handling on
  // the fullscreen stage interferes), so close directly on touchend too. The
  // touchend targets the button only if the touch also STARTED on it, so a
  // pan released over the ✕ can't close the lightbox by accident.
  closeButton.addEventListener('touchend', event => {
    event.preventDefault()
    close()
  })
  closeButton.addEventListener('click', close)
  window.addEventListener('keydown', onKeyDown)
}
