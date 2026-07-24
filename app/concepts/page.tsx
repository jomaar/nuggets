'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { Lightbulb, Sparkles } from 'lucide-react'
import { useOwner } from '@/components/OwnerContext'
import InsightCard from '@/components/InsightCard'
import { communityColor } from '@/lib/communityColor'

interface Label {
  language: string
  term: string
}

interface Concept {
  id: string
  description: string
  labels: Label[]
  _count: { nuggets: number }
}

/** One theme = a detected concept community (from /api/concepts/communities). */
interface CommunityGroup {
  lead: { id: string; term: string }
  conceptIds: string[]
}

/** A cached insight in the aggregate feed (serialized shape + anchor concept). */
interface FeedInsight {
  id: string
  kind: string
  status: string
  title: string
  body: string
  anchorConceptId: string | null
  refs: { conceptIds: string[]; nuggetIds: string[] }
}

function primaryLabel(labels: Label[]): string {
  return (
    labels.find(l => l.language === 'de')?.term ??
    labels.find(l => l.language === 'en')?.term ??
    labels[0]?.term ?? '?'
  )
}

/** Maps nugget count to visual scale values */
function visualScale(count: number, min: number, max: number) {
  const t = max === min ? 0.5 : (count - min) / (max - min)
  return {
    fontSize:   `${0.78 + t * 0.62}rem`,
    fontWeight: t > 0.6 ? 600 : t > 0.3 ? 500 : 400,
    padding:    `${0.3 + t * 0.3}rem ${0.6 + t * 0.4}rem`,
    opacity:    0.55 + t * 0.45,
  }
}

export default function ConceptsPage() {
  const { isOwner } = useOwner()
  const [concepts, setConcepts]     = useState<Concept[]>([])
  const [search, setSearch]         = useState('')
  const [loading, setLoading]       = useState(true)

  // Theme map: concept communities (Louvain) drive per-chip colouring + a legend.
  const [communities, setCommunities] = useState<CommunityGroup[]>([])

  // Stufe-4 feed: every cached insight across all concepts, plus the display
  // labels the cards need (the feed has no per-concept context to resolve from).
  const [feed, setFeed]                 = useState<FeedInsight[]>([])
  const [conceptTerms, setConceptTerms] = useState<Record<string, string>>({})
  const [nuggetTitles, setNuggetTitles] = useState<Record<string, string>>({})
  const [generatingThemes, setGeneratingThemes] = useState(false)
  const [feedError, setFeedError]       = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/concepts')
      .then(r => r.json())
      .then((data: Concept[]) => { setConcepts(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetch('/api/concepts/communities')
      .then(r => r.json())
      .then((data: { communities: CommunityGroup[] }) => setCommunities(data.communities ?? []))
      .catch(() => {}) // colouring is a non-critical enhancement — cloud still renders plain
  }, [])

  // conceptId → community index (detection order = colour + legend order). Concepts
  // in no theme-worthy community are absent → they render neutral.
  const communityOf = useMemo(() => {
    const map = new Map<string, number>()
    communities.forEach((group, index) => {
      for (const id of group.conceptIds) map.set(id, index)
    })
    return map
  }, [communities])

  const loadFeed = useCallback(async () => {
    const res = await fetch('/api/insights/feed')
    if (!res.ok) return
    const data = await res.json()
    setFeed(data.insights ?? [])
    setConceptTerms(data.conceptTerms ?? {})
    setNuggetTitles(data.nuggetTitles ?? {})
  }, [])

  useEffect(() => { loadFeed() }, [loadFeed])

  /**
   * "Neue Impulse suchen" — the feed is the natural home for the GLOBAL theme
   * engine (the per-concept engines live on each concept's page). Runs theme
   * generation over the whole graph, then refreshes the feed. Owner-only,
   * idempotent (cache hit = free after the first run).
   */
  const findNewImpulses = useCallback(async () => {
    setGeneratingThemes(true)
    setFeedError(null)
    try {
      const res = await fetch('/api/insights/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'theme' }),
      })
      const data = await res.json()
      if (!res.ok) { setFeedError(data.error ?? 'KI-Anfrage fehlgeschlagen.'); return }
      await loadFeed()
    } catch {
      setFeedError('Netzwerkfehler.')
    } finally {
      setGeneratingThemes(false)
    }
  }, [loadFeed])

  /** Keep/dismiss on a feed card (the PATCH lives in InsightCard; this syncs the list). */
  const applyStatus = useCallback((insightId: string, status: 'kept' | 'dismissed') => {
    setFeed(prev =>
      status === 'dismissed'
        ? prev.filter(i => i.id !== insightId)
        : prev.map(i => (i.id === insightId ? { ...i, status } : i)),
    )
  }, [])

  const filtered = concepts.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      c.description.toLowerCase().includes(q) ||
      c.labels.some(l => l.term.toLowerCase().includes(q))
    )
  })

  // Group by theme: concepts of the same community sit together (largest theme
  // first, themeless last). sort() is stable, so within a group the incoming
  // nugget-count order is preserved.
  const grouped = [...filtered].sort(
    (a, b) => (communityOf.get(a.id) ?? Infinity) - (communityOf.get(b.id) ?? Infinity),
  )

  const counts = filtered.map(c => c._count.nuggets)
  const min = Math.min(...counts, 1)
  const max = Math.max(...counts, 1)

  const nuggetTitle = (id: string) => nuggetTitles[id] ?? 'Nugget'
  const conceptTerm = (id: string) => conceptTerms[id] ?? 'Konzept'

  return (
    <>
      <header className="pt-3 pb-6">
        <h1 className="text-3xl mb-1">
          Konzept-Graph
        </h1>
        <p className="text-sm mb-5" style={{ color: 'var(--muted)' }}>
          {loading
            ? '…'
            : `${concepts.length} Konzepte · Größe = Vernetzungsgrad${communities.length ? ' · Farbe = Thema' : ''}`}
        </p>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Konzept suchen…"
          className="w-full rounded-xl px-4 py-3 text-sm"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--ink)',
            outline: 'none',
          }}
        />
      </header>

      {!loading && filtered.length === 0 && (
        <p className="text-sm text-center py-12" style={{ color: 'var(--muted)' }}>
          {search ? 'Keine Treffer.' : 'Noch keine Konzepte. Leg einen Nugget an!'}
        </p>
      )}

      {/* Theme legend — one pill per detected community (colour ↔ lead concept),
          so the coloured cloud reads as a map of named themes. */}
      {!loading && !search && communities.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 mb-5">
          {communities.map((group, index) => {
            const colour = communityColor(index)
            return (
              <Link
                key={group.lead.id}
                href={`/concepts/${group.lead.id}`}
                className="inline-flex items-center gap-1.5 text-xs active:scale-95 transition-transform"
                style={{ color: 'var(--muted)' }}
                title={`Thema · ${group.conceptIds.length} Konzepte`}
              >
                <span
                  className="inline-block rounded-full"
                  style={{ width: 10, height: 10, background: colour.ink }}
                />
                {group.lead.term}
              </Link>
            )
          })}
        </div>
      )}

      {/* Tag cloud — chips coloured by theme (community); themeless concepts neutral. */}
      {!loading && grouped.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-12 items-baseline">
          {grouped.map(c => {
            const scale = visualScale(c._count.nuggets, min, max)
            const label = primaryLabel(c.labels)
            const communityIndex = communityOf.get(c.id)
            const colour = communityIndex === undefined ? null : communityColor(communityIndex)
            return (
              <Link
                key={c.id}
                href={`/concepts/${c.id}`}
                className="rounded-full transition-all active:scale-95"
                style={{
                  fontSize:        scale.fontSize,
                  fontWeight:      scale.fontWeight,
                  padding:         scale.padding,
                  opacity:         scale.opacity,
                  background:      colour ? colour.wash : 'var(--surface)',
                  color:           colour ? colour.ink : 'var(--muted)',
                  border:          `1px solid ${colour ? colour.ink : 'var(--border)'}`,
                  lineHeight:      1.4,
                  display:         'inline-block',
                }}
                title={`${c.description} · ${c._count.nuggets} Nugget${c._count.nuggets !== 1 ? 's' : ''}`}
              >
                {label}
                <span
                  className="ml-1.5"
                  style={{ fontSize: '0.65em', opacity: 0.6, fontWeight: 400 }}
                >
                  {c._count.nuggets}
                </span>
              </Link>
            )
          })}
        </div>
      )}

      {/* Denkanstöße-Feed (Stufe 4) — every cached insight across all concepts, the
          graph reasoning ABOUT the material aggregated in one place. Each card
          shows which concept it lives on and jumps to the relevant spot. */}
      {!loading && (feed.length > 0 || isOwner) && (
        <section>
          <div className="flex items-center justify-between gap-3 mb-4">
            <p className="text-xs tracking-widest uppercase flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
              <Lightbulb size={13} />
              Denkanstöße
            </p>
            {isOwner && (
              <button
                onClick={findNewImpulses}
                disabled={generatingThemes}
                title="Sucht emergente Themen im GANZEN Konzept-Graphen (idempotent — nach dem ersten Lauf gecacht)."
                className="text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 disabled:opacity-50 flex-shrink-0"
                style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}
              >
                <Sparkles size={13} />
                {generatingThemes ? 'Suche…' : 'Neue Impulse suchen'}
              </button>
            )}
          </div>

          {feedError && (
            <p className="text-xs mb-3" style={{ color: 'var(--act-delete, #c0392b)' }}>{feedError}</p>
          )}

          {feed.length === 0 ? (
            <p className="text-xs mb-8" style={{ color: 'var(--muted)', lineHeight: '1.6' }}>
              Noch keine Denkanstöße. Öffne ein Konzept und lass die KI nach Spannungen, offenen
              Fragen oder Brücken suchen — oder starte hier die Themen-Suche über den ganzen Graphen.
            </p>
          ) : (
            <div className="flex flex-col gap-3 mb-8">
              {feed.map(ins => (
                <InsightCard
                  key={ins.id}
                  insight={ins}
                  isOwner={isOwner}
                  nuggetTitle={nuggetTitle}
                  conceptTerm={conceptTerm}
                  anchorConcept={
                    ins.anchorConceptId
                      ? { id: ins.anchorConceptId, term: conceptTerm(ins.anchorConceptId) }
                      : null
                  }
                  onStatusChange={applyStatus}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </>
  )
}
