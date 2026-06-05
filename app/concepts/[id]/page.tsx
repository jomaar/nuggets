'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import NuggetCard from '@/components/NuggetCard'

interface Label {
  language: string
  term: string
}

interface Nugget {
  id: string
  contentHtml: string
  sourceUrl: string | null
  sourceLabel: string | null
  aiChatUrl: string | null
  tags: string
  domain: { id: string; name: string; slug: string; icon: string | null } | null
}

interface ConceptDetail {
  id: string
  description: string
  labels: Label[]
  nuggets: { relevance: number; nugget: Nugget }[]
}

const LANG_NAMES: Record<string, string> = {
  de: 'Deutsch', en: 'English', el: 'Ελληνικά', he: 'עברית',
}

export default function ConceptPage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()
  const [concept, setConcept] = useState<ConceptDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const res = await fetch(`/api/concepts/${id}`)
    if (!res.ok) { setLoading(false); return }
    setConcept(await res.json())
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

        <h1 className="text-3xl mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
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

      {concept.nuggets.map(({ nugget }) => (
        <NuggetCard
          key={nugget.id}
          {...nugget}
          tags={JSON.parse(nugget.tags || '[]')}
          domain={nugget.domain}
        />
      ))}


    </>
  )
}
