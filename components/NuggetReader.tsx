'use client'

import NuggetEditor from '@/components/NuggetEditor'
import { useHighlightSave } from '@/components/useHighlightSave'
import type { MarkScheme } from '@/lib/marking'
import type { LinkKind } from '@/lib/bookmarkLink'

/**
 * Read-only Tiptap reading view with debounced highlight persistence.
 * Mounted only once the nugget is loaded so the highlight hook is seeded with
 * the real initial HTML (its baseline is captured at first render).
 *
 * Extracted from app/nugget/[id]/page.tsx (Spinnennetz Stufe 2) so the Peek-
 * Tab reader (components/PeekTabView.tsx) can reuse the exact same reading
 * experience without duplicating it — the main page and a peek tab now both
 * mount this component, just with different props (a peek tab passes
 * `enableMarking={false}` and omits onComment/onCopyInternalLink/
 * onCopyExternalLink so those BubbleMenu rows simply don't render).
 */
export default function NuggetReader({
  id, contentHtml, markScheme, onComment, onCopyInternalLink, onCopyExternalLink, linkCopiedKind, onNearby, enableMarking,
}: {
  id: string
  contentHtml: string
  markScheme: MarkScheme
  onComment?: () => void
  onCopyInternalLink?: () => void
  onCopyExternalLink?: () => void
  linkCopiedKind?: LinkKind | null
  /** "Naheliegendes" (Spinnennetz Stufe 2) — reads the caller's own tracked selection, same pattern as onComment. */
  onNearby?: () => void
  /** false for Peek-Tabs: reading + referencing only, no marking/highlighting a nugget you only opened to look something up. Default true (no behavior change for existing call sites). */
  enableMarking?: boolean
}) {
  const { html, handleContentChange, handleEditorReady } = useHighlightSave(id, contentHtml)
  return (
    <NuggetEditor
      value={html}
      editable={false}
      onChange={handleContentChange}
      onReady={handleEditorReady}
      markScheme={markScheme}
      onComment={onComment}
      onCopyInternalLink={onCopyInternalLink}
      onCopyExternalLink={onCopyExternalLink}
      linkCopiedKind={linkCopiedKind}
      onNearby={onNearby}
      enableMarking={enableMarking}
      renderMermaid
    />
  )
}
