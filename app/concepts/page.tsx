'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Lightbulb, Sparkles } from 'lucide-react'
import { useOwner } from '@/components/OwnerContext'
import InsightCard from '@/components/InsightCard'

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
          {loading ? '…' : `${concepts.length} Konzepte · Größe = Vernetzungsgrad`}
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

      {/* Tag cloud */}
      {!loading && filtered.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-12 items-baseline">
          {filtered.map(c => {
            const scale = visualScale(c._count.nuggets, min, max)
            const label = primaryLabel(c.labels)
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
                  background:      'var(--surface)',
                  color:           'var(--accent)',
                  border:          '1px solid var(--accent)',
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
