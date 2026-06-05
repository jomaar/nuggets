'use client'

import { useEffect, useState } from 'react'
import NuggetCard from '@/components/NuggetCard'

interface Domain {
  id: string
  name: string
  slug: string
  icon: string | null
}

interface NuggetConceptEntry {
  relevance: number
  concept: { id: string; description: string; labels: { language: string; term: string }[] }
}

interface Nugget {
  id: string
  title: string
  contentHtml: string
  sourceUrl: string | null
  sourceLabel: string | null
  aiChatUrl: string | null
  tags: string
  domain: Domain | null
  concepts: NuggetConceptEntry[]
}

export default function TodayPage() {
  const [nuggets, setNuggets] = useState<Nugget[]>([])
  const [loading, setLoading] = useState(true)
  const [isOwner, setIsOwner] = useState(false)

  useEffect(() => {
    fetch('/api/due')
      .then(r => r.json())
      .then(data => { setNuggets(data); setLoading(false) })
    fetch('/api/auth/me')
      .then(r => r.json())
      .then((d: { isOwner: boolean }) => setIsOwner(d.isOwner))
      .catch(() => {})
  }, [])

  const handleReview = async (id: string, rating: 'again' | 'hard' | 'easy') => {
    await fetch(`/api/nuggets/${id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating }),
    })
  }

  return (
    <>
      <header className="pt-10 pb-6">
        <p className="text-xs tracking-widest uppercase mb-1" style={{ color: 'var(--muted)' }}>
          {new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h1 className="text-3xl" style={{ fontFamily: 'Playfair Display, serif' }}>
          Heute fällig
        </h1>
      </header>

      {loading && (
        <p style={{ color: 'var(--muted)' }} className="text-sm">Lädt…</p>
      )}

      {!loading && nuggets.length === 0 && (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">✦</p>
          <p className="serif text-xl mb-2">Alles erledigt.</p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Keine fälligen Nuggets heute.
          </p>
        </div>
      )}

      {nuggets.map(n => (
        <NuggetCard
          key={n.id}
          {...n}
          tags={JSON.parse(n.tags || '[]')}
          title={n.title}
          domain={n.domain}
          concepts={n.concepts}
          defaultExpanded={true}
          onReview={isOwner ? handleReview : undefined}
          showReviewButtons={isOwner}
        />
      ))}


    </>
  )
}
