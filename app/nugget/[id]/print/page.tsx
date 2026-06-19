import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import PrintControls from './PrintControls'

/**
 * Print / PDF-export view for a single nugget.
 *
 * A dedicated, chrome-free document page: header (title + domain · date · source
 * + tags) followed by the complete content. Rendered as a server component that
 * reads straight from Prisma — no Tiptap editor, no API roundtrip. The content
 * reuses the shared `.nugget-content` typography (globals.css); a `.pdf-doc`
 * wrapper plus the `@media print` block there handle dense, page-break-friendly
 * print sizing and keep highlight colours via `print-color-adjust: exact`.
 */
export default async function NuggetPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const nugget = await prisma.nugget.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      contentHtml: true,
      sourceUrl: true,
      sourceLabel: true,
      tags: true,
      createdAt: true,
      domain: { select: { name: true } },
    },
  })
  if (!nugget) notFound()

  // Tags are stored as a JSON string (project rule) — parse defensively.
  let tags: string[] = []
  try {
    const parsed = JSON.parse(nugget.tags)
    if (Array.isArray(parsed)) tags = parsed.filter((t): t is string => typeof t === 'string')
  } catch {
    /* malformed tags → treat as none */
  }

  const dateLabel = new Date(nugget.createdAt).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
  const sourceLabel = nugget.sourceLabel || nugget.sourceUrl

  return (
    <div className="pdf-doc">
      <PrintControls title={nugget.title || 'Nugget'} backHref={`/nugget/${nugget.id}`} />

      <header className="pdf-head">
        {nugget.title && <h1 className="pdf-title">{nugget.title}</h1>}
        <div className="pdf-meta">
          {nugget.domain?.name && <span>{nugget.domain.name}</span>}
          <span>{dateLabel}</span>
          {sourceLabel && (
            nugget.sourceUrl ? (
              <a href={nugget.sourceUrl}>{sourceLabel}</a>
            ) : (
              <span>{sourceLabel}</span>
            )
          )}
        </div>
        {tags.length > 0 && (
          <div className="pdf-tags">
            {tags.map(tag => (
              <span key={tag}>#{tag}</span>
            ))}
          </div>
        )}
      </header>

      {/* contentHtml is sanitized on write (lib/content.ts) — safe to inline. */}
      <div className="nugget-content" dangerouslySetInnerHTML={{ __html: nugget.contentHtml }} />
    </div>
  )
}
