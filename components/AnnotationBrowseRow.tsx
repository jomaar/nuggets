'use client'

import Link from 'next/link'
import { commentMarkdownToHtml } from '@/lib/content'
import { encodeAnchorToken } from '@/lib/bookmarkLink'
import type { DomainAnnotation } from '@/lib/annotations'

/**
 * One cross-nugget comment row in the Denkspuren browse view — the sibling of
 * MarkBrowseRow, and deliberately built the same way: the whole row is a Link
 * that reuses the existing `?bm=` deep-link mechanism (lib/bookmarkLink.ts + the
 * reading view's mount resolver) to land on the commented passage.
 *
 * Layout inverts the reading view's emphasis on purpose. In the AnnotationSheet
 * the text is primary and the comment is marginal; browsing comments, the
 * COMMENT is what you came for, so it sits below the quoted passage as the main
 * body, with the quote as a small quoted lead-in for context.
 *
 * The body is stored as Markdown plaintext and rendered only here, with the same
 * `commentMarkdownToHtml` (sanitized, `breaks: true`) and the same
 * `.annotation-body` typography class the sheet uses — so lists, emphasis and
 * links look identical in both places.
 */
export default function AnnotationBrowseRow({
  annotation,
  showNugget = false,
}: {
  annotation: DomainAnnotation
  showNugget?: boolean
}) {
  const href = `/nugget/${annotation.nuggetId}?bm=${encodeAnchorToken(annotation.anchor)}`

  return (
    <Link
      href={href}
      className="flex flex-col rounded-2xl border overflow-hidden transition-transform active:scale-[0.99]"
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--border)',
        boxShadow: '0 2px 12px rgba(26,23,20,0.06)',
      }}
    >
      {/* The commented passage — context, not the payload. */}
      <div className="px-3 py-2" style={{ background: 'var(--warm)' }}>
        <span className="block text-xs break-words" style={{ color: 'var(--muted)' }}>
          „{annotation.quote}“
        </span>
      </div>
      <div
        className="annotation-body px-3 py-2.5 text-sm"
        style={{ color: 'var(--ink)' }}
        dangerouslySetInnerHTML={{ __html: commentMarkdownToHtml(annotation.body) }}
      />
      {showNugget && (
        <div className="px-3 py-1.5" style={{ borderTop: '1px solid var(--border)' }}>
          <span className="text-xs truncate block" style={{ color: 'var(--muted)' }}>
            {annotation.nuggetTitle}
          </span>
        </div>
      )}
    </Link>
  )
}
