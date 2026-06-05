'use client'

import { useEffect, useState, useCallback } from 'react'
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
  createdAt: string
}

interface Stats {
  totalNuggets: number
  inputTokens: number
  outputTokens: number
  costUsd: number
}

export default function AllPage() {
  const [nuggets, setNuggets]           = useState<Nugget[]>([])
  const [domains, setDomains]           = useState<Domain[]>([])
  const [search, setSearch]             = useState('')
  const [activeDomain, setActiveDomain] = useState<string>('')
  const [loading, setLoading]           = useState(true)
  const [isOwner, setIsOwner]           = useState(false)
  const [stats, setStats]               = useState<Stats | null>(null)

  useEffect(() => {
    fetch('/api/domains')
      .then(r => r.json())
      .then(setDomains)
      .catch(() => {})
    fetch('/api/auth/me')
      .then(r => r.json())
      .then((d: { isOwner: boolean }) => {
        setIsOwner(d.isOwner)
        if (d.isOwner) {
          fetch('/api/stats').then(r => r.json()).then(setStats).catch(() => {})
        }
      })
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search)       params.set('search', search)
      if (activeDomain) params.set('domain', activeDomain)
      const query = params.toString() ? `?${params}` : ''
      const res = await fetch(`/api/nuggets${query}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setNuggets(data)
    } catch (e) {
      console.error('Fehler beim Laden:', e)
    } finally {
      setLoading(false)
    }
  }, [search, activeDomain])

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  return (
    <>
      <header className="pt-10 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl" style={{ fontFamily: 'Playfair Display, serif' }}>
              Alle Nuggets
            </h1>
            {isOwner && stats && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                {stats.totalNuggets} Nuggets · {((stats.inputTokens + stats.outputTokens) / 1000).toFixed(1)}K Tokens · ~${stats.costUsd.toFixed(3)}
              </p>
            )}
          </div>
          {isOwner ? (
            <button
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' })
                setIsOwner(false)
                setStats(null)
              }}
              className="text-xs px-3 py-1 rounded-lg"
              style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
            >
              Abmelden
            </button>
          ) : (
            <a
              href="/login"
              className="text-xs px-3 py-1 rounded-lg"
              style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
            >
              Anmelden
            </a>
          )}
        </div>

        {/* Domain filter */}
        {domains.length > 0 && (
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            <button
              onClick={() => setActiveDomain('')}
              className="px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-all flex-shrink-0"
              style={{
                background: activeDomain === '' ? 'var(--accent)' : 'var(--surface)',
                color:      activeDomain === '' ? 'white'         : 'var(--muted)',
                border: `1px solid ${activeDomain === '' ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              Alle
            </button>
            {domains.map(d => (
              <button
                key={d.id}
                onClick={() => setActiveDomain(activeDomain === d.slug ? '' : d.slug)}
                className="px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-all flex-shrink-0"
                style={{
                  background: activeDomain === d.slug ? 'var(--accent)' : 'var(--surface)',
                  color:      activeDomain === d.slug ? 'white'         : 'var(--muted)',
                  border: `1px solid ${activeDomain === d.slug ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                {d.icon} {d.name}
              </button>
            ))}
          </div>
        )}

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
          {search || activeDomain ? 'Keine Treffer.' : 'Noch keine Nuggets. Leg den ersten an!'}
        </p>
      )}

      {nuggets.map(n => (
        <NuggetCard
          key={n.id}
          {...n}
          tags={JSON.parse(n.tags || '[]')}
          title={n.title}
          domain={n.domain}
          concepts={n.concepts}
          defaultExpanded={false}
          onDelete={isOwner ? id => setNuggets(prev => prev.filter(x => x.id !== id)) : undefined}
        />
      ))}


    </>
  )
}
