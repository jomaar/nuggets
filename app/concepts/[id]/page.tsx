'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Waypoints, Lightbulb, Sparkles, Check, X } from 'lucide-react'
import DomainIcon from '@/components/DomainIcon'
import { useOwner } from '@/components/OwnerContext'
import { commentMarkdownToHtml } from '@/lib/content'
import { encodeAnchorToken, type AnchorToken } from '@/lib/bookmarkLink'

interface Label {
  language: string
  term: string
}

interface Nugget {
  id: string
  title: string
  contentHtml: string
  sourceUrl: string | null
  sourceLabel: string | null
  aiChatUrl: string | null
  tags: string
  domain: { id: string; name: string; slug: string; icon: string | null; color: string | null } | null
}

/** Derives a fallback title from raw HTML when no title is stored. */
function fallbackTitle(contentHtml: string): string {
  const plain = contentHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const sentence = plain.split(/[.!?]/)[0].trim()
  return sentence.length > 80 ? sentence.substring(0, 77) + '…' : sentence
}

interface ConceptDetail {
  id: string
  description: string
  labels: Label[]
  // note = the edge reading: what THIS nugget specifically says about the concept.
  nuggets: { relevance: number; note: string | null; nugget: Nugget }[]
}

/** One proximity result from /api/concepts/:id/related (derived, not a stored edge). */
interface RelatedConcept {
  id: string
  term: string
  score: number
  sharedNuggets: number
}

/** A generated insight (Denkanstoß) anchored to this concept — see lib/insights.ts. */
interface Insight {
  id: string
  kind: string
  status: string // "new" | "kept"  (dismissed ones are never sent)
  title: string
  body: string
  refs: { conceptIds: string[]; nuggetIds: string[] } // jump targets
  createdAt: string
}

const LANG_NAMES: Record<string, string> = {
  de: 'Deutsch', en: 'English', el: 'Ελληνικά', he: 'עברית',
}

export default function ConceptPage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()
  const { isOwner } = useOwner()
  const [concept, setConcept] = useState<ConceptDetail | null>(null)
  const [related, setRelated] = useState<RelatedConcept[]>([])
  const [loading, setLoading] = useState(true)
  const [insights, setInsights] = useState<Insight[]>([])
  const [generating, setGenerating] = useState(false)
  const [insightError, setInsightError] = useState<string | null>(null)
  const [hasGenerated, setHasGenerated] = useState(false)
  const [jumpingKey, setJumpingKey] = useState<string | null>(null)
  // Per-session cache of located anchors (insightId:nuggetId → anchor|null), so
  // tapping the same chip twice doesn't re-spend an AI call.
  const anchorCache = useRef<Record<string, AnchorToken | null>>({})

  const load = useCallback(async () => {
    // Proximity is fetched alongside the detail; an empty result just hides the block.
    const [detailRes, relatedRes] = await Promise.all([
      fetch(`/api/concepts/${id}`),
      fetch(`/api/concepts/${id}/related`),
    ])
    if (relatedRes.ok) setRelated(await relatedRes.json())
    if (!detailRes.ok) { setLoading(false); return }
    setConcept(await detailRes.json())
    setLoading(false)
  }, [id])

  // Cached insights load independently (public read); an empty list just shows the
  // invitation to generate. Generation itself is owner-only and on demand.
  const loadInsights = useCallback(async () => {
    const res = await fetch(`/api/insights?conceptId=${id}`)
    if (res.ok) setInsights((await res.json()).insights ?? [])
  }, [id])

  useEffect(() => { load(); loadInsights() }, [load, loadInsights])

  /** Owner action: run the tension engine for this concept, then refresh the list. */
  const generateInsights = useCallback(async () => {
    setGenerating(true)
    setInsightError(null)
    try {
      const res = await fetch('/api/insights/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'tension', conceptId: id }),
      })
      const data = await res.json()
      if (!res.ok) { setInsightError(data.error ?? 'KI-Anfrage fehlgeschlagen.'); return }
      setHasGenerated(true)
      await loadInsights()
    } catch {
      setInsightError('Netzwerkfehler.')
    } finally {
      setGenerating(false)
    }
  }, [id, loadInsights])

  /**
   * Tap a nugget chip on an insight: for the owner, locate the exact passage the
   * insight is about (Tier 1 — on-demand, lazy) and deep-link there via `?bm=`;
   * anyone else (or on any failure) just opens the nugget at the top.
   */
  const jumpToNuggetSpot = useCallback(async (insightId: string, nuggetId: string) => {
    if (!isOwner) { router.push(`/nugget/${nuggetId}`); return }
    const key = `${insightId}:${nuggetId}`
    if (!(key in anchorCache.current)) {
      setJumpingKey(key)
      let anchor: AnchorToken | null = null
      try {
        const res = await fetch(`/api/insights/${insightId}/locate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nuggetId }),
        })
        if (res.ok) anchor = (await res.json()).anchor ?? null
      } catch { /* anchor stays null → jump to top */ }
      anchorCache.current[key] = anchor
      setJumpingKey(null)
    }
    const anchor = anchorCache.current[key]
    router.push(anchor ? `/nugget/${nuggetId}?bm=${encodeAnchorToken(anchor)}` : `/nugget/${nuggetId}`)
  }, [isOwner, router])

  /** Owner action: keep or dismiss an insight (optimistic; dismissed disappears). */
  const setInsightStatus = useCallback(async (insightId: string, status: 'kept' | 'dismissed') => {
    setInsights(prev =>
      status === 'dismissed'
        ? prev.filter(i => i.id !== insightId)
        : prev.map(i => (i.id === insightId ? { ...i, status } : i)),
    )
    await fetch(`/api/insights/${insightId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
  }, [])

  if (loading) return (
    <div className="pt-3">
      <p className="text-sm" style={{ color: 'var(--muted)' }}>Lädt…</p>

    </div>
  )

  if (!concept) return (
    <div className="pt-3">
      <p className="text-sm" style={{ color: 'var(--muted)' }}>Konzept nicht gefunden.</p>

    </div>
  )

  const primaryTerm =
    concept.labels.find(l => l.language === 'de')?.term ??
    concept.labels.find(l => l.language === 'en')?.term ??
    concept.labels[0]?.term ?? '?'

  /** Resolve a referenced nugget's display title from this concept's own list. */
  const titleFor = (nuggetId: string): string => {
    const found = concept.nuggets.find(n => n.nugget.id === nuggetId)
    return found ? (found.nugget.title || fallbackTitle(found.nugget.contentHtml)) : 'Nugget'
  }

  return (
    <>
      <header className="pt-3 pb-6">
        <button
          onClick={() => router.back()}
          className="text-xs mb-4 flex items-center gap-1"
          style={{ color: 'var(--muted)' }}
        >
          ← Zurück
        </button>

        <div className="flex items-center justify-between gap-3 mb-2">
          <h1 className="text-3xl">
            {primaryTerm}
          </h1>
          {/* Entry into the ego-network view, focused on this concept. */}
          <Link
            href={`/graph?type=concept&id=${concept.id}`}
            className="text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5 flex-shrink-0"
            style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}
          >
            <Waypoints size={13} />
            <span>Netz</span>
          </Link>
        </div>
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

      {/* Nugget list — each row shows the edge reading (what THIS nugget says
          about the concept) beneath the title; tap a row to open the single view */}
      <div className="flex flex-col gap-2">
        {concept.nuggets.map(({ nugget, note }) => (
          <Link
            key={nugget.id}
            href={`/nugget/${nugget.id}`}
            className="flex flex-col gap-1 px-5 py-2.5 rounded-2xl border transition-all active:scale-[0.99]"
            style={{
              background: 'var(--surface)',
              borderColor: 'var(--border)',
              boxShadow: '0 2px 12px rgba(26,23,20,0.06)',
            }}
          >
            <span className="flex items-center gap-2">
              {nugget.domain && (
                <span
                  className="inline-flex items-center text-xs px-2 py-1 rounded-full flex-shrink-0"
                  style={{ background: 'var(--warm)', color: 'var(--muted)' }}
                >
                  <DomainIcon slug={nugget.domain.slug} icon={nugget.domain.icon} color={nugget.domain.color} size={13} colored />
                </span>
              )}
              <span className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>
                {nugget.title || fallbackTitle(nugget.contentHtml)}
              </span>
            </span>
            {note && (
              <span className="text-xs line-clamp-2" style={{ color: 'var(--muted)', lineHeight: '1.5' }}>
                {note}
              </span>
            )}
          </Link>
        ))}
      </div>

      {/* Denkanstöße — the graph reasoning ABOUT the material (tensions between how
          different nuggets read this concept), not just showing that links exist.
          Fed by lib/insights.ts from the distilled edge-notes, never nugget bodies. */}
      <div className="mt-10">
        <div className="flex items-center justify-between gap-3 mb-4">
          <p className="text-xs tracking-widest uppercase flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
            <Lightbulb size={13} />
            Denkanstöße
          </p>
          {isOwner && (
            <button
              onClick={generateInsights}
              disabled={generating}
              className="text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 flex-shrink-0 disabled:opacity-50"
              style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}
            >
              <Sparkles size={13} />
              {generating ? 'Denke nach…' : insights.length > 0 ? 'Neu suchen' : 'Spannungen suchen'}
            </button>
          )}
        </div>

        {insightError && (
          <p className="text-xs mb-3" style={{ color: 'var(--act-delete, #c0392b)' }}>{insightError}</p>
        )}

        {insights.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--muted)', lineHeight: '1.6' }}>
            {hasGenerated
              ? 'Keine Spannungen gefunden — die Lesarten dieses Konzepts sind stimmig.'
              : isOwner
                ? 'Noch keine Denkanstöße. Lass die KI nach Spannungen zwischen den Lesarten dieses Konzepts suchen.'
                : 'Noch keine Denkanstöße für dieses Konzept.'}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {insights.map(ins => (
              <div
                key={ins.id}
                className="px-5 py-4 rounded-2xl border"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: '0 2px 12px rgba(26,23,20,0.06)' }}
              >
                <p className="text-sm font-medium mb-2" style={{ color: 'var(--ink)', lineHeight: '1.5' }}>
                  {ins.title}
                </p>
                <div
                  className="annotation-body text-xs mb-3"
                  style={{ color: 'var(--muted)', lineHeight: '1.6' }}
                  dangerouslySetInnerHTML={{ __html: commentMarkdownToHtml(ins.body) }}
                />
                {ins.refs.nuggetIds.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {ins.refs.nuggetIds.map(nid => {
                      const busy = jumpingKey === `${ins.id}:${nid}`
                      return (
                        <button
                          key={nid}
                          onClick={() => jumpToNuggetSpot(ins.id, nid)}
                          disabled={busy}
                          title={isOwner ? 'Zur betreffenden Stelle springen' : undefined}
                          className="text-xs px-2.5 py-1 rounded-full disabled:opacity-60"
                          style={{ background: 'var(--warm)', color: 'var(--muted)' }}
                        >
                          {busy ? 'springe …' : titleFor(nid)}
                        </button>
                      )
                    })}
                  </div>
                )}
                {isOwner && (
                  <div className="flex items-center gap-4 mt-1">
                    {ins.status === 'kept' ? (
                      <span className="text-xs flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                        <Check size={12} /> behalten
                      </span>
                    ) : (
                      <button onClick={() => setInsightStatus(ins.id, 'kept')} className="text-xs flex items-center gap-1" style={{ color: 'var(--muted)' }}>
                        <Check size={12} /> Behalten
                      </button>
                    )}
                    <button onClick={() => setInsightStatus(ins.id, 'dismissed')} className="text-xs flex items-center gap-1" style={{ color: 'var(--muted)' }}>
                      <X size={12} /> Verwerfen
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Related concepts — proximity derived from shared nuggets (lib/graph.ts),
          never a stored edge. The count shows WHY they are close. */}
      {related.length > 0 && (
        <>
          <p className="text-xs tracking-widest uppercase mt-10 mb-4" style={{ color: 'var(--muted)' }}>
            Verwandte Konzepte
          </p>
          <div className="flex flex-wrap gap-2">
            {related.map(r => (
              <Link
                key={r.id}
                href={`/concepts/${r.id}`}
                className="text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5"
                style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}
              >
                <span>{r.term}</span>
                <span style={{ opacity: 0.6 }} title="gemeinsame Nuggets">{r.sharedNuggets}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  )
}
