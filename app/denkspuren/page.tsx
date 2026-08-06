'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import DomainIcon from '@/components/DomainIcon'
import { shortName } from '@/components/DomainChips'
import MarkSwatch from '@/components/MarkSwatch'
import MarkBrowseRow from '@/components/MarkBrowseRow'
import AnnotationBrowseRow from '@/components/AnnotationBrowseRow'
import { getLastDomainSlug, setLastDomainSlug } from '@/lib/lastDomain'
import type { DomainMarks, DomainMark } from '@/lib/marks'
import type { DomainAnnotations } from '@/lib/annotations'
import { Footprints, Palette, Tag, Layers, Highlighter, MessageSquareText } from 'lucide-react'

interface Domain {
  id: string
  name: string
  slug: string
  icon: string | null
  color: string | null
}

/** Top-level view: markings, or margin comments (which have no colour axis). */
type Tab = 'marks' | 'comments'

/**
 * How marks are bucketed.
 * - `dimension` — by the colour's fixed meaning (Kern, Grund, …), merging a
 *   hue's highlight and underline. The default: it is the only cut that is both
 *   meaningful AND total over the corpus, since the dimension is a property of
 *   the colour itself, not of any per-nugget naming.
 * - `color` — by the exact (style, colour) slot. Finest granularity.
 * - `meaning` — by the per-nugget custom label. Meaningful where schemes were
 *   actually named, sparse elsewhere.
 */
type Mode = 'dimension' | 'color' | 'meaning'

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
  const [comments, setComments]       = useState<DomainAnnotations | null>(null)
  const [loading, setLoading]         = useState(true)
  const [tab, setTab]                 = useState<Tab>('marks')
  const [mode, setMode]               = useState<Mode>('dimension')
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

  // Both tabs load together: the payloads are small, the tab toggle stays
  // instant, and the header can show honest counts for both without a fetch.
  const load = useCallback(async (slug: string) => {
    const id = ++requestId.current
    setLoading(true)
    try {
      const query = slug ? `?domain=${encodeURIComponent(slug)}` : '?domain='
      const [marksRes, commentsRes] = await Promise.all([
        fetch(`/api/marks${slug ? query : ''}`),
        fetch(`/api/annotations${query}`),
      ])
      if (!marksRes.ok) throw new Error(`HTTP ${marksRes.status}`)
      const [marksJson, commentsJson] = await Promise.all([
        marksRes.json(),
        commentsRes.ok ? commentsRes.json() : Promise.resolve(null),
      ])
      if (id !== requestId.current) return // a newer request already landed
      setData(marksJson)
      setComments(commentsJson)
    } catch (e) {
      console.error('Fehler beim Laden der Denkspuren:', e)
      if (id === requestId.current) { setData(null); setComments(null) }
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

  const switchTab = (next: Tab) => {
    setTab(next)
    setActiveFacet(null)
    setSearch('')
  }

  const filteredMarks: DomainMark[] = useMemo(() => {
    if (!data) return []
    const needle = search.trim().toLowerCase()
    return data.marks.filter(m => {
      if (needle && !m.text.toLowerCase().includes(needle)) return false
      if (!activeFacet) return true
      if (mode === 'color') return m.key === activeFacet
      if (mode === 'dimension') return m.color === activeFacet
      return normalizeLabel(m.label) === activeFacet
    })
  }, [data, search, activeFacet, mode])

  // Comments have no facet axis — only free-text search over quote and body.
  const filteredComments = useMemo(() => {
    if (!comments) return []
    const needle = search.trim().toLowerCase()
    if (!needle) return comments.annotations
    return comments.annotations.filter(a =>
      a.body.toLowerCase().includes(needle) || a.quote.toLowerCase().includes(needle))
  }, [comments, search])

  const commentGroups = useMemo(() => {
    const order: string[] = []
    const byNugget = new Map<string, { nuggetId: string; nuggetTitle: string; items: typeof filteredComments }>()
    for (const a of filteredComments) {
      let group = byNugget.get(a.nuggetId)
      if (!group) {
        group = { nuggetId: a.nuggetId, nuggetTitle: a.nuggetTitle, items: [] }
        byNugget.set(a.nuggetId, group)
        order.push(a.nuggetId)
      }
      group.items.push(a)
    }
    return order.map(id => byNugget.get(id)!)
  }, [filteredComments])

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
          Alle Markierungen und Kommentare dieser Domäne an einem Ort.
        </p>
        {tab === 'marks' && data && (
          <p className="text-xs mb-3" style={{ color: 'var(--muted)' }}>
            {data.stats.totalMarks} Markierung{data.stats.totalMarks === 1 ? '' : 'en'} aus {data.stats.nuggetsWithMarks} Nugget{data.stats.nuggetsWithMarks === 1 ? '' : 's'}
            {data.stats.truncated && ' · gekürzt'}
          </p>
        )}
        {tab === 'comments' && comments && (
          <p className="text-xs mb-3" style={{ color: 'var(--muted)' }}>
            {comments.stats.total} Kommentar{comments.stats.total === 1 ? '' : 'e'} aus {comments.stats.nuggetsWithComments} Nugget{comments.stats.nuggetsWithComments === 1 ? '' : 's'}
            {comments.stats.truncated && ' · gekürzt'}
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

        {/* Tab toggle — comments get their own view because they carry no
            colour/dimension axis to bucket by. */}
        <div className="flex gap-1 mb-3 p-1 rounded-xl w-fit" style={{ background: 'var(--warm)' }}>
          {([
            ['marks', 'Markierungen', Highlighter],
            ['comments', 'Kommentare', MessageSquareText],
          ] as const).map(([value, label, Icon]) => (
            <button
              key={value}
              onClick={() => switchTab(value)}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all"
              style={{
                background: tab === value ? 'var(--surface)' : 'transparent',
                color: tab === value ? 'var(--ink)' : 'var(--muted)',
                boxShadow: tab === value ? '0 1px 4px rgba(26,23,20,0.08)' : undefined,
              }}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        {/* Mode toggle — marks only. */}
        {tab === 'marks' && (
          <div className="flex gap-1 mb-3 p-1 rounded-xl w-fit" style={{ background: 'var(--warm)' }}>
            {([
              ['dimension', 'Nach Dimension', Layers],
              ['color', 'Nach Farbe', Palette],
              ['meaning', 'Nach Bedeutung', Tag],
            ] as const).map(([value, label, Icon]) => (
              <button
                key={value}
                onClick={() => switchMode(value)}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all"
                style={{
                  background: mode === value ? 'var(--surface)' : 'transparent',
                  color: mode === value ? 'var(--ink)' : 'var(--muted)',
                  boxShadow: mode === value ? '0 1px 4px rgba(26,23,20,0.08)' : undefined,
                }}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
        )}

        {/* Facet bar */}
        {tab === 'marks' && data && (
          mode === 'color' ? data.facets.length > 0
          : mode === 'dimension' ? data.dimensions.length > 0
          : data.meanings.length > 0
        ) && (
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
            {mode === 'dimension'
              ? data.dimensions.map(d => (
                  <button
                    key={d.color}
                    onClick={() => setActiveFacet(activeFacet === d.color ? null : d.color)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-all flex-shrink-0"
                    style={{
                      background: activeFacet === d.color ? 'var(--accent)' : 'var(--surface)',
                      color:      activeFacet === d.color ? 'white'         : 'var(--muted)',
                      border: `1px solid ${activeFacet === d.color ? 'var(--accent)' : 'var(--border)'}`,
                    }}
                  >
                    {/* Both styles of the hue — the dimension spans them. */}
                    <span className="inline-flex gap-0.5">
                      <MarkSwatch kind="hl" color={d.color} size={12} />
                      <MarkSwatch kind="ul" color={d.color} size={12} />
                    </span>
                    {d.name}
                    <span style={{ opacity: 0.7 }}>{d.count}</span>
                  </button>
                ))
              : mode === 'color'
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
          placeholder={tab === 'marks' ? 'Markierungstext durchsuchen…' : 'Kommentare durchsuchen…'}
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

      {!loading && tab === 'marks' && data && data.stats.nuggetsScanned > 0 && data.stats.totalMarks === 0 && (
        <p className="text-sm text-center py-12" style={{ color: 'var(--muted)' }}>
          Noch keine Markierungen. Markiere beim Lesen Stellen mit Highlight oder Unterstreichung —
          hier laufen sie zusammen.
        </p>
      )}

      {!loading && tab === 'marks' && data && data.stats.totalMarks > 0 && filteredMarks.length === 0 && (
        <p className="text-sm text-center py-12" style={{ color: 'var(--muted)' }}>
          Keine Treffer.
        </p>
      )}

      {!loading && tab === 'comments' && data && data.stats.nuggetsScanned > 0 && comments?.stats.total === 0 && (
        <p className="text-sm text-center py-12" style={{ color: 'var(--muted)' }}>
          Noch keine Kommentare. Markiere beim Lesen eine Stelle und tippe auf die Sprechblase —
          hier laufen sie zusammen.
        </p>
      )}

      {!loading && tab === 'comments' && comments && comments.stats.total > 0 && filteredComments.length === 0 && (
        <p className="text-sm text-center py-12" style={{ color: 'var(--muted)' }}>
          Keine Treffer.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {tab === 'marks'
          ? groups.map(group => (
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
            ))
          : commentGroups.map(group => (
              <div key={group.nuggetId} className="flex flex-col gap-2">
                <a
                  href={`/nugget/${group.nuggetId}`}
                  className="text-xs font-medium truncate px-1"
                  style={{ color: 'var(--muted)' }}
                >
                  {group.nuggetTitle}
                </a>
                <div className="flex flex-col gap-2">
                  {group.items.map(a => (
                    <AnnotationBrowseRow key={a.id} annotation={a} />
                  ))}
                </div>
              </div>
            ))}
      </div>
    </>
  )
}
