'use client'

import { useEffect, useState, useCallback } from 'react'
import NuggetCard from '@/components/NuggetCard'
import BottomNav from '@/components/BottomNav'

interface Nugget {
  id: string
  contentHtml: string
  sourceUrl: string | null
  sourceLabel: string | null
  aiChatUrl: string | null
  tags: string
  createdAt: string
}

export default function AllPage() {
  const [nuggets, setNuggets] = useState<Nugget[]>([])
  const [search, setSearch]   = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const params = search ? `?search=${encodeURIComponent(search)}` : ''
    const data = await fetch(`/api/nuggets${params}`).then(r => r.json())
    setNuggets(data)
    setLoading(false)
  }, [search])

  useEffect(() => {
    const t = setTimeout(load, 300) // debounce
    return () => clearTimeout(t)
  }, [load])

  return (
    <>
      <header className="pt-10 pb-4">
        <h1 className="text-3xl mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>
          Alle Nuggets
        </h1>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Suchen…"
          className="w-full rounded-xl px-4 py-3 text-sm"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--ink)',
            fontFamily: 'DM Sans, sans-serif',
            outline: 'none',
          }}
        />
      </header>

      {loading && <p className="text-sm" style={{ color: 'var(--muted)' }}>Lädt…</p>}

      {!loading && nuggets.length === 0 && (
        <p className="text-sm text-center py-12" style={{ color: 'var(--muted)' }}>
          {search ? 'Keine Treffer.' : 'Noch keine Nuggets. Leg den ersten an!'}
        </p>
      )}

      {nuggets.map(n => (
        <NuggetCard
          key={n.id}
          {...n}
          tags={JSON.parse(n.tags || '[]')}
          onDelete={id => setNuggets(prev => prev.filter(x => x.id !== id))}
        />
      ))}

      <BottomNav />
    </>
  )
}
