'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import DomainIcon from '@/components/DomainIcon'
import { shortName } from '@/components/DomainChips'
import MarkSwatch from '@/components/MarkSwatch'
import MarkBrowseRow from '@/components/MarkBrowseRow'
import { getLastDomainSlug, setLastDomainSlug } from '@/lib/lastDomain'
import type { DomainMarks, DomainMark } from '@/lib/marks'
import { Footprints, Palette, Tag } from 'lucide-react'

interface Domain {
  id: string
  name: string
  slug: string
  icon: string | null
  color: string | null
}

type Mode = 'color' | 'meaning'

/** Same normalization as the server's meaning-bucket key (lib/marks.ts), so a
 *  mark can be matched against the active meaning facet client-side without
 *  re-fetching. */
function normalizeLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ')
}

export default function DenkspurenPage() {
  const [domains, setDomains]         = useState<Domain[]>([])
  // null = not yet initialized from ?domain=/lastDomain — distinct from ''
  // ("Alle"), so the load-effect below doesn't fire once with the wrong
  // (empty) slug before the init effect resolves the real one.
  const [domainSlug, setDomainSlug]   = useState<string | null>(null)
  const [data, setData]               = useState<DomainMarks | null>(null)
  const [loading, setLoading]         = useState(true)
  const [mode, setMode]               = useState<Mode>('color')
  const [activeFacet, setActiveFacet] = useState<string | null>(null)
  const [search, setSearch]           = useState('')
  // Guards against out-of-order responses (e.g. rapid domain switching) —
  // only the most recently issued request is allowed to update state.
  const requestId = useRef(0)

  // Restore ?domain= (shareable URL) or fall back to the shared last-domain
  // preference (same storage as /all and /add, see lib/lastDomain.ts).
  useEffect(() => {
    const fromQuery = new URLSearchParams(window.location.search).get('domain')?.trim()
    setDomainSlug(fromQuery || getLastDomainSlug())
  }, [])

  useEffect(() => {
    fetch('/api/domains').then(r => r.json()).then(setDomains).catch(() => {})
  }, [])

  const load = useCallback(async (slug: string) => {
    const id = ++requestId.current
    setLoading(true)
    try {
      const query = slug ? `?domain=${encodeURIComponent(slug)}` : ''
      const res = await fetch(`/api/marks${query}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (id !== requestId.current) return // a newer request already landed
      setData(json)
    } catch (e) {
      console.error('Fehler beim Laden der Markierungen:', e)
      if (id === requestId.current) setData(null)
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (domainSlug === null) return // wait for the init effect above
    load(domainSlug)
  }, [domainSlug, load])

  const selectDomain = (slug: string) => {
    setDomainSlug(slug)
    setActiveFacet(null)
    setLastDomainSlug(slug)
    const path = slug ? `/denkspuren?domain=${slug}` : '/denkspuren'
    window.history.replaceState(null, '', path)
  }

  const switchMode = (next: Mode) => {
    setMode(next)
    setActiveFacet(null)
  }

  const filteredMarks: DomainMark[] = useMemo(() => {
    if (!data) return []
    const needle = search.trim().toLowerCase()
    return data.marks.filter(m => {
      if (needle && !m.text.toLowerCase().includes(needle)) return false
      if (!activeFacet) return true
      return mode === 'color' ? m.key === activeFacet : normalizeLabel(m.label) === activeFacet
    })
  }, [data, search, activeFacet, mode])

  // Marks arrive already grouped by nugget (collectDomainMarks appends one
  // nugget's marks contiguously) — preserve that order rather than re-sorting.
  const groups = useMemo(() => {
    const order: string[] = []
    const byNugget = new Map<string, { nuggetId: string; nuggetTitle: string; marks: DomainMark[] }>()
    for (const m of filteredMarks) {
      let group = byNugget.get(m.nuggetId)
      if (!group) {
        group = { nuggetId: m.nuggetId, nuggetTitle: m.nuggetTitle, marks: [] }
        byNugget.set(m.nuggetId, group)
        order.push(m.nuggetId)
      }
      group.marks.push(m)
    }
    return order.map(id => byNugget.get(id)!)
  }, [filteredMarks])

  return (
    <>
      <header className="pt-3 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <Footprints size={22} style={{ color: 'var(--accent)' }} />
          <h1 className="text-3xl">Denkspuren</h1>
        </div>
        <p className="text-sm mb-2" style={{ color: 'var(--muted)' }}>
          Alle Markierungen dieser Domäne an einem Ort.
        </p>
        {data && (
          <p className="text-xs mb-3" style={{ color: 'var(--muted)' }}>
            {data.stats.totalMarks} Markierung{data.stats.totalMarks === 1 ? '' : 'en'} aus {data.stats.nuggetsWithMarks} Nugget{data.stats.nuggetsWithMarks === 1 ? '' : 's'}
            {data.stats.truncated && ' · gekürzt'}
          </p>
        )}

        {/* Domain filter — same markup as app/all/page.tsx */}
        {domains.length > 0 && (
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            <button
              onClick={() => selectDomain('')}
              className="px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-all flex-shrink-0"
              style={{
                background: domainSlug === '' ? 'var(--accent)' : 'var(--surface)',
                color:      domainSlug === '' ? 'white'         : 'var(--muted)',
                border: `1px solid ${domainSlug === '' ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              Alle
            </button>
            {domains.map(d => (
              <button
                key={d.id}
                onClick={() => selectDomain(domainSlug === d.slug ? '' : d.slug)}
                className="px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-all flex-shrink-0"
                style={{
                  background: domainSlug === d.slug ? 'var(--accent)' : 'var(--surface)',
                  color:      domainSlug === d.slug ? 'white'         : 'var(--muted)',
                  border: `1px solid ${domainSlug === d.slug ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                <span className="inline-flex items-center gap-1.5">
                  <DomainIcon slug={d.slug} icon={d.icon} color={d.color} size={14} colored={domainSlug !== d.slug} />
                  <span className="hidden sm:inline lg:hidden">{shortName(d.name)}</span>
                  <span className="hidden lg:inline">{d.name}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Mode toggle */}
        <div className="flex gap-1 mb-3 p-1 rounded-xl w-fit" style={{ background: 'var(--warm)' }}>
          <button
            onClick={() => switchMode('color')}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all"
            style={{
              background: mode === 'color' ? 'var(--surface)' : 'transparent',
              color: mode === 'color' ? 'var(--ink)' : 'var(--muted)',
              boxShadow: mode === 'color' ? '0 1px 4px rgba(26,23,20,0.08)' : undefined,
            }}
          >
            <Palette size={13} /> Nach Farbe
          </button>
          <button
            onClick={() => switchMode('meaning')}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all"
            style={{
              background: mode === 'meaning' ? 'var(--surface)' : 'transparent',
              color: mode === 'meaning' ? 'var(--ink)' : 'var(--muted)',
              boxShadow: mode === 'meaning' ? '0 1px 4px rgba(26,23,20,0.08)' : undefined,
            }}
          >
            <Tag size={13} /> Nach Bedeutung
          </button>
        </div>

        {/* Facet bar */}
        {data && (mode === 'color' ? data.facets.length > 0 : data.meanings.length > 0) && (
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            <button
              onClick={() => setActiveFacet(null)}
              className="px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-all flex-shrink-0"
              style={{
                background: activeFacet === null ? 'var(--accent)' : 'var(--surface)',
                color:      activeFacet === null ? 'white'         : 'var(--muted)',
                border: `1px solid ${activeFacet === null ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              Alle
            </button>
            {mode === 'color'
              ? data.facets.map(f => (
                  <button
                    key={f.key}
                    onClick={() => setActiveFacet(activeFacet === f.key ? null : f.key)}
                    title={f.diverging ? `Uneinheitlich benannt: ${f.labels.filter(l => l.custom).map(l => l.label).join(', ')}` : undefined}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-all flex-shrink-0"
                    style={{
                      background: activeFacet === f.key ? 'var(--accent)' : 'var(--surface)',
                      color:      activeFacet === f.key ? 'white'         : 'var(--muted)',
                      border: `1px solid ${activeFacet === f.key ? 'var(--accent)' : 'var(--border)'}`,
                      opacity: f.known ? 1 : 0.6,
                    }}
                  >
                    <MarkSwatch kind={f.kind} color={f.color} size={14} />
                    {f.defaultLabel}
                    <span style={{ opacity: 0.7 }}>{f.count}</span>
                    {f.diverging && <span aria-hidden style={{ color: 'var(--act-delete, #c0392b)' }}>●</span>}
                  </button>
                ))
              : data.meanings.map(m => (
                  <button
                    key={m.slug}
                    onClick={() => setActiveFacet(activeFacet === m.slug ? null : m.slug)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-all flex-shrink-0"
                    style={{
                      background: activeFacet === m.slug ? 'var(--accent)' : 'var(--surface)',
                      color:      activeFacet === m.slug ? 'white'         : 'var(--muted)',
                      border: `1px solid ${activeFacet === m.slug ? 'var(--accent)' : 'var(--border)'}`,
                    }}
                  >
                    <span className="inline-flex -space-x-1">
                      {m.keys.slice(0, 3).map(key => {
                        const [kind, color] = key.split(':') as ['hl' | 'ul', string]
                        return <MarkSwatch key={key} kind={kind} color={color} size={12} />
                      })}
                    </span>
                    {m.label}
                    <span style={{ opacity: 0.7 }}>{m.count}</span>
                  </button>
                ))}
          </div>
        )}

        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Markierungstext durchsuchen…"
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

      {!loading && data && data.stats.nuggetsScanned === 0 && (
        <p className="text-sm text-center py-12" style={{ color: 'var(--muted)' }}>
          Keine Nuggets in dieser Domäne.
        </p>
      )}

      {!loading && data && data.stats.nuggetsScanned > 0 && data.stats.totalMarks === 0 && (
        <p className="text-sm text-center py-12" style={{ color: 'var(--muted)' }}>
          Noch keine Markierungen. Markiere beim Lesen Stellen mit Highlight oder Unterstreichung —
          hier laufen sie zusammen.
        </p>
      )}

      {!loading && data && data.stats.totalMarks > 0 && filteredMarks.length === 0 && (
        <p className="text-sm text-center py-12" style={{ color: 'var(--muted)' }}>
          Keine Treffer.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {groups.map(group => (
          <div key={group.nuggetId} className="flex flex-col gap-2">
            <a
              href={`/nugget/${group.nuggetId}`}
              className="text-xs font-medium truncate px-1"
              style={{ color: 'var(--muted)' }}
            >
              {group.nuggetTitle}
            </a>
            <div className="flex flex-col gap-2">
              {group.marks.map(m => (
                <MarkBrowseRow key={m.id} mark={m} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
