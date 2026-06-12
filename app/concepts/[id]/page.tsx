'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import DomainIcon from '@/components/DomainIcon'

interface Label {
  language: string
  term: string
}

interface Nugget {
  id: string
  title: string
  contentHtml: string
  sourceUrl: string | null
  sourceLabel: string | null
  aiChatUrl: string | null
  tags: string
  domain: { id: string; name: string; slug: string; icon: string | null; color: string | null } | null
}

/** Derives a fallback title from raw HTML when no title is stored. */
function fallbackTitle(contentHtml: string): string {
  const plain = contentHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const sentence = plain.split(/[.!?]/)[0].trim()
  return sentence.length > 80 ? sentence.substring(0, 77) + '…' : sentence
}

interface ConceptDetail {
  id: string
  description: string
  labels: Label[]
  // note = the edge reading: what THIS nugget specifically says about the concept.
  nuggets: { relevance: number; note: string | null; nugget: Nugget }[]
}

/** One proximity result from /api/concepts/:id/related (derived, not a stored edge). */
interface RelatedConcept {
  id: string
  term: string
  score: number
  sharedNuggets: number
}

const LANG_NAMES: Record<string, string> = {
  de: 'Deutsch', en: 'English', el: 'Ελληνικά', he: 'עברית',
}

export default function ConceptPage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()
  const [concept, setConcept] = useState<ConceptDetail | null>(null)
  const [related, setRelated] = useState<RelatedConcept[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    // Proximity is fetched alongside the detail; an empty result just hides the block.
    const [detailRes, relatedRes] = await Promise.all([
      fetch(`/api/concepts/${id}`),
      fetch(`/api/concepts/${id}/related`),
    ])
    if (relatedRes.ok) setRelated(await relatedRes.json())
    if (!detailRes.ok) { setLoading(false); return }
    setConcept(await detailRes.json())
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div className="pt-10">
      <p className="text-sm" style={{ color: 'var(--muted)' }}>Lädt…</p>

    </div>
  )

  if (!concept) return (
    <div className="pt-10">
      <p className="text-sm" style={{ color: 'var(--muted)' }}>Konzept nicht gefunden.</p>

    </div>
  )

  const primaryTerm =
    concept.labels.find(l => l.language === 'de')?.term ??
    concept.labels.find(l => l.language === 'en')?.term ??
    concept.labels[0]?.term ?? '?'

  return (
    <>
      <header className="pt-10 pb-6">
        <button
          onClick={() => router.back()}
          className="text-xs mb-4 flex items-center gap-1"
          style={{ color: 'var(--muted)' }}
        >
          ← Zurück
        </button>

        <h1 className="text-3xl mb-2">
          {primaryTerm}
        </h1>
        <p className="text-sm mb-4" style={{ color: 'var(--muted)', lineHeight: '1.6' }}>
          {concept.description}
        </p>

        {/* Language variants */}
        {concept.labels.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {concept.labels.map(l => (
              <span
                key={l.language + l.term}
                className="text-xs px-2.5 py-1 rounded-full"
                style={{ background: 'var(--warm)', color: 'var(--muted)' }}
              >
                <span style={{ opacity: 0.7 }}>{LANG_NAMES[l.language] ?? l.language} · </span>
                {l.term}
              </span>
            ))}
          </div>
        )}
      </header>

      <p className="text-xs tracking-widest uppercase mb-4" style={{ color: 'var(--muted)' }}>
        {concept.nuggets.length} {concept.nuggets.length === 1 ? 'Nugget' : 'Nuggets'}
      </p>

      {/* Nugget list — each row shows the edge reading (what THIS nugget says
          about the concept) beneath the title; tap a row to open the single view */}
      <div className="flex flex-col gap-2">
        {concept.nuggets.map(({ nugget, note }) => (
          <Link
            key={nugget.id}
            href={`/nugget/${nugget.id}`}
            className="flex flex-col gap-1 px-5 py-2.5 rounded-2xl border transition-all active:scale-[0.99]"
            style={{
              background: 'var(--surface)',
              borderColor: 'var(--border)',
              boxShadow: '0 2px 12px rgba(26,23,20,0.06)',
            }}
          >
            <span className="flex items-center gap-2">
              {nugget.domain && (
                <span
                  className="inline-flex items-center text-xs px-2 py-1 rounded-full flex-shrink-0"
                  style={{ background: 'var(--warm)', color: 'var(--muted)' }}
                >
                  <DomainIcon slug={nugget.domain.slug} icon={nugget.domain.icon} color={nugget.domain.color} size={13} colored />
                </span>
              )}
              <span className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>
                {nugget.title || fallbackTitle(nugget.contentHtml)}
              </span>
            </span>
            {note && (
              <span className="text-xs line-clamp-2" style={{ color: 'var(--muted)', lineHeight: '1.5' }}>
                {note}
              </span>
            )}
          </Link>
        ))}
      </div>

      {/* Related concepts — proximity derived from shared nuggets (lib/graph.ts),
          never a stored edge. The count shows WHY they are close. */}
      {related.length > 0 && (
        <>
          <p className="text-xs tracking-widest uppercase mt-10 mb-4" style={{ color: 'var(--muted)' }}>
            Verwandte Konzepte
          </p>
          <div className="flex flex-wrap gap-2">
            {related.map(r => (
              <Link
                key={r.id}
                href={`/concepts/${r.id}`}
                className="text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5"
                style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}
              >
                <span>{r.term}</span>
                <span style={{ opacity: 0.6 }} title="gemeinsame Nuggets">{r.sharedNuggets}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  )
}
