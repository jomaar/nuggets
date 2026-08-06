/**
 * Domain-wide aggregation of margin comments (`Annotation`) for Denkspuren.
 *
 * The counterpart to lib/marks.ts, but much simpler: a comment already IS
 * structured data. Its `body` is Markdown plaintext (rendered only for display,
 * see `commentMarkdownToHtml` in lib/content.ts) and its `quote`/`prefix`/
 * `suffix` triple is already a stored text-quote anchor — so unlike marks, which
 * only exist as inline markup inside `contentHtml` and need a jsdom pass to
 * extract, nothing has to be parsed out of a document here.
 *
 * What comments do NOT have is a categorical axis: no colour, no dimension, no
 * scheme. That is why Denkspuren shows them in their own tab rather than as a
 * third facet mode over marks — there is nothing to bucket them by.
 *
 * Prisma access lives in this lib rather than the route handler, mirroring
 * lib/marks.ts and lib/insights.ts, so a later AI stage can call it directly.
 * `contentHtml` is read only to derive a fallback title and never leaves.
 */
import { prisma } from '@/lib/prisma'
import { fallbackTitle } from '@/lib/content'
import type { AnchorToken } from '@/lib/bookmarkLink'

/** Mirrors the `take` valve in lib/marks.ts. */
const MAX_ANNOTATIONS = 2000

/** One comment, decorated with its owning nugget and a jump-ready anchor. */
export interface DomainAnnotation {
  id: string
  nuggetId: string
  nuggetTitle: string
  /** The commented passage — shown as the context line above the comment. */
  quote: string
  /** Markdown source; the client renders it with `commentMarkdownToHtml`. */
  body: string
  /** Bookmark-shaped anchor for the `?bm=` deep link. */
  anchor: AnchorToken
  createdAt: string
}

export interface DomainAnnotations {
  domain: { id: string; name: string; slug: string; icon: string | null; color: string | null } | null
  annotations: DomainAnnotation[]
  stats: { total: number; nuggetsWithComments: number; truncated: boolean }
}

/**
 * Loads every comment of a domain (or of all domains when `domainSlug` is null),
 * newest first — the reverse of the per-nugget GET, which returns document order,
 * because a cross-nugget browse is a timeline, not a reading order.
 *
 * Comments with an empty body are skipped: the single view creates a comment
 * before the first keystroke and deletes it again on close, so a stray empty row
 * would be noise here.
 */
export async function loadDomainAnnotations(domainSlug: string | null): Promise<DomainAnnotations> {
  const [rows, domain] = await Promise.all([
    prisma.annotation.findMany({
      where: {
        body: { not: '' },
        ...(domainSlug ? { nugget: { domain: { slug: domainSlug } } } : {}),
      },
      select: {
        id: true,
        nuggetId: true,
        quote: true,
        prefix: true,
        suffix: true,
        body: true,
        createdAt: true,
        nugget: { select: { title: true, contentHtml: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_ANNOTATIONS + 1,
    }),
    domainSlug
      ? prisma.domain.findUnique({
          where: { slug: domainSlug },
          select: { id: true, name: true, slug: true, icon: true, color: true },
        })
      : Promise.resolve(null),
  ])

  const truncated = rows.length > MAX_ANNOTATIONS
  const kept = truncated ? rows.slice(0, MAX_ANNOTATIONS) : rows

  const annotations: DomainAnnotation[] = kept.map(row => ({
    id: row.id,
    nuggetId: row.nuggetId,
    nuggetTitle: row.nugget.title || fallbackTitle(row.nugget.contentHtml),
    quote: row.quote,
    body: row.body,
    anchor: { quote: row.quote, prefix: row.prefix, suffix: row.suffix },
    createdAt: row.createdAt.toISOString(),
  }))

  return {
    domain,
    annotations,
    stats: {
      total: annotations.length,
      nuggetsWithComments: new Set(annotations.map(a => a.nuggetId)).size,
      truncated,
    },
  }
}
