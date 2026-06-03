'use client'

import { useEffect, useState } from 'react'
import NuggetCard from '@/components/NuggetCard'
import BottomNav from '@/components/BottomNav'

interface Nugget {
  id: string
  contentHtml: string
  sourceUrl: string | null
  sourceLabel: string | null
  aiChatUrl: string | null
  tags: string
}

export default function TodayPage() {
  const [nuggets, setNuggets] = useState<Nugget[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/due')
      .then(r => r.json())
      .then(data => { setNuggets(data); setLoading(false) })
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
          onReview={handleReview}
          showReviewButtons
        />
      ))}

      <BottomNav />
    </>
  )
}
