'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, X, Zap, HelpCircle, Link2, Layers, type LucideIcon } from 'lucide-react'
import { commentMarkdownToHtml } from '@/lib/content'
import { encodeAnchorToken, type AnchorToken } from '@/lib/bookmarkLink'

/** The insight fields a card needs — the serialized shape from the API. */
export interface InsightCardData {
  id: string
  kind: string
  status: string // "new" | "kept"  (dismissed ones are never rendered)
  title: string
  body: string
  refs: { conceptIds: string[]; nuggetIds: string[] }
}

/** Per-kind presentation: label, icon and the CSS-var names of its rubric colour. */
interface KindMeta {
  label: string
  Icon: LucideIcon
  colorVar: string
  washVar: string
}

const KIND_META: Record<string, KindMeta> = {
  tension:  { label: 'Spannung',     Icon: Zap,        colorVar: '--insight-tension',  washVar: '--insight-tension-wash' },
  question: { label: 'Offene Frage', Icon: HelpCircle, colorVar: '--insight-question', washVar: '--insight-question-wash' },
  bridge:   { label: 'Brücke',       Icon: Link2,      colorVar: '--insight-bridge',   washVar: '--insight-bridge-wash' },
  theme:    { label: 'Thema',        Icon: Layers,     colorVar: '--insight-theme',    washVar: '--insight-theme-wash' },
}

/** Fallback for an unknown kind (should not happen — the API whitelists kinds). */
const DEFAULT_META = KIND_META.tension

interface InsightCardProps {
  insight: InsightCardData
  isOwner: boolean
  /** Resolve a referenced nugget's display title (from the page's own data). */
  nuggetTitle: (id: string) => string
  /** Resolve a bridged/theme concept's display term (from the page's own data). */
  conceptTerm: (id: string) => string
  /** Feed-only: the concept this insight lives on, rendered as a "auf: …" link. */
  anchorConcept?: { id: string; term: string } | null
  /** Parent updates its list on keep/dismiss (dismiss removes, keep flips status). */
  onStatusChange: (id: string, status: 'kept' | 'dismissed') => void
}

/**
 * One "Denkanstoß" card, shared by the concept panel and the /concepts feed.
 *
 * Self-contained: it owns the on-demand jump-to-passage (Tier 1 — locate the exact
 * spot via the AI locate route, deep-link there with `?bm=`; anyone but the owner,
 * or any failure, just opens the nugget top) and the keep/dismiss mutations. The
 * parent stays the source of truth for the list — the card only calls
 * `onStatusChange` so the parent can update optimistically. Colour comes from the
 * per-kind rubric CSS vars (coloured left edge + badge).
 */
export default function InsightCard({
  insight,
  isOwner,
  nuggetTitle,
  conceptTerm,
  anchorConcept,
  onStatusChange,
}: InsightCardProps) {
  const router = useRouter()
  const meta = KIND_META[insight.kind] ?? DEFAULT_META
  const { Icon } = meta

  const [jumpingId, setJumpingId] = useState<string | null>(null)
  // Per-card cache of located anchors (nuggetId → anchor|null), so tapping the
  // same chip twice doesn't re-spend an AI call.
  const anchorCache = useRef<Record<string, AnchorToken | null>>({})

  /**
   * Tap a nugget chip: for the owner, locate the exact passage this insight is
   * about and deep-link there via `?bm=`; anyone else (or on any failure) just
   * opens the nugget at the top.
   */
  const jumpToNuggetSpot = async (nuggetId: string) => {
    if (!isOwner) { router.push(`/nugget/${nuggetId}`); return }
    if (!(nuggetId in anchorCache.current)) {
      setJumpingId(nuggetId)
      let anchor: AnchorToken | null = null
      try {
        const res = await fetch(`/api/insights/${insight.id}/locate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nuggetId }),
        })
        if (res.ok) anchor = (await res.json()).anchor ?? null
      } catch { /* anchor stays null → jump to top */ }
      anchorCache.current[nuggetId] = anchor
      setJumpingId(null)
    }
    const anchor = anchorCache.current[nuggetId]
    router.push(anchor ? `/nugget/${nuggetId}?bm=${encodeAnchorToken(anchor)}` : `/nugget/${nuggetId}`)
  }

  /** Owner action: keep or dismiss (optimistic — the parent applies the change). */
  const setStatus = async (status: 'kept' | 'dismissed') => {
    onStatusChange(insight.id, status)
    await fetch(`/api/insights/${insight.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
  }

  return (
    <div
      className="px-5 py-4 rounded-2xl border"
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--border)',
        borderLeft: `3px solid var(${meta.colorVar})`,
        boxShadow: '0 2px 12px rgba(26,23,20,0.06)',
      }}
    >
      {/* Kind badge — rubric colour + wash, so the type reads at a glance. */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span
          className="text-[10px] tracking-widest uppercase inline-flex items-center gap-1 px-1.5 py-0.5 rounded"
          style={{ color: `var(${meta.colorVar})`, background: `var(${meta.washVar})` }}
        >
          <Icon size={11} />
          {meta.label}
        </span>
        {/* Feed context: which concept this insight belongs to. */}
        {anchorConcept && (
          <Link
            href={`/concepts/${anchorConcept.id}`}
            className="text-[10px] truncate"
            style={{ color: 'var(--muted)' }}
            title={`Konzept: ${anchorConcept.term}`}
          >
            auf: <span style={{ color: 'var(--accent)' }}>{anchorConcept.term}</span>
          </Link>
        )}
      </div>

      <p className="text-sm font-medium mb-2" style={{ color: 'var(--ink)', lineHeight: '1.5' }}>
        {insight.title}
      </p>
      <div
        className="annotation-body text-xs mb-3"
        style={{ color: 'var(--muted)', lineHeight: '1.6' }}
        dangerouslySetInnerHTML={{ __html: commentMarkdownToHtml(insight.body) }}
      />

      {/* Nugget jump chips — Tier-1 locate on tap (owner). */}
      {insight.refs.nuggetIds.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {insight.refs.nuggetIds.map(nid => {
            const busy = jumpingId === nid
            return (
              <button
                key={nid}
                onClick={() => jumpToNuggetSpot(nid)}
                disabled={busy}
                title={isOwner ? 'Zur betreffenden Stelle springen' : undefined}
                className="text-xs px-2.5 py-1 rounded-full disabled:opacity-60"
                style={{ background: 'var(--warm)', color: 'var(--muted)' }}
              >
                {busy ? 'springe …' : nuggetTitle(nid)}
              </button>
            )
          })}
        </div>
      )}

      {/* Bridged / theme concept chips — jump to that concept's page. */}
      {insight.refs.conceptIds.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {insight.refs.conceptIds.map(cid => (
            <Link
              key={cid}
              href={`/concepts/${cid}`}
              className="text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5"
              style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}
            >
              <Link2 size={12} />
              <span>{conceptTerm(cid)}</span>
            </Link>
          ))}
        </div>
      )}

      {isOwner && (
        <div className="flex items-center gap-4 mt-1">
          {insight.status === 'kept' ? (
            <span className="text-xs flex items-center gap-1" style={{ color: 'var(--accent)' }}>
              <Check size={12} /> behalten
            </span>
          ) : (
            <button onClick={() => setStatus('kept')} className="text-xs flex items-center gap-1" style={{ color: 'var(--muted)' }}>
              <Check size={12} /> Behalten
            </button>
          )}
          <button onClick={() => setStatus('dismissed')} className="text-xs flex items-center gap-1" style={{ color: 'var(--muted)' }}>
            <X size={12} /> Verwerfen
          </button>
        </div>
      )}
    </div>
  )
}
