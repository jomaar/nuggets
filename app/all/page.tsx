'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import DomainIcon from '@/components/DomainIcon'
import { shortName } from '@/components/DomainChips'
import { useOwner } from '@/components/OwnerContext'
import { Settings } from 'lucide-react'

interface Domain {
  id: string
  name: string
  slug: string
  icon: string | null
  color: string | null
}

interface Nugget {
  id: string
  title: string // already resolved server-side (falls back to a derived title)
  domain: Domain | null
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
  const { isOwner, setIsOwner }         = useOwner()
  const [stats, setStats]               = useState<Stats | null>(null)

  useEffect(() => {
    fetch('/api/domains')
      .then(r => r.json())
      .then(setDomains)
      .catch(() => {})
  }, [])

  // Owner-only stats; owner status comes from the layout-provided context.
  useEffect(() => {
    if (isOwner) {
      fetch('/api/stats').then(r => r.json()).then(setStats).catch(() => {})
    }
  }, [isOwner])

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
            <h1 className="text-3xl">
              Alle Nuggets
            </h1>
            {isOwner && stats && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                {stats.totalNuggets} Nuggets · {((stats.inputTokens + stats.outputTokens) / 1000).toFixed(1)}K Tokens · ~${stats.costUsd.toFixed(3)}
              </p>
            )}
          </div>
          {isOwner ? (
            <div className="flex items-center gap-2">
              <a
                href="/admin"
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-lg whitespace-nowrap"
                style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
              >
                <Settings size={13} strokeWidth={1.75} />
                Prompts
              </a>
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
            </div>
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
                <span className="inline-flex items-center gap-1.5">
                  <DomainIcon slug={d.slug} icon={d.icon} color={d.color} size={14} colored={activeDomain !== d.slug} />
                  <span className="hidden sm:inline lg:hidden">{shortName(d.name)}</span>
                  <span className="hidden lg:inline">{d.name}</span>
                </span>
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

      {/* Title-only list — tap a row to open the single view */}
      <div className="flex flex-col gap-2">
        {nuggets.map(n => (
          <Link
            key={n.id}
            href={search ? `/nugget/${n.id}?q=${encodeURIComponent(search)}` : `/nugget/${n.id}`}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl border transition-all active:scale-[0.99]"
            style={{
              background: 'var(--surface)',
              borderColor: 'var(--border)',
              boxShadow: '0 2px 12px rgba(26,23,20,0.06)',
            }}
          >
            {n.domain && (
              <span
                className="inline-flex items-center text-xs px-2 py-1 rounded-full flex-shrink-0"
                style={{ background: 'var(--warm)', color: 'var(--muted)' }}
              >
                <DomainIcon slug={n.domain.slug} icon={n.domain.icon} color={n.domain.color} size={13} colored />
              </span>
            )}
            <span className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>
              {n.title}
            </span>
          </Link>
        ))}
      </div>
    </>
  )
}
