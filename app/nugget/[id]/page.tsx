'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import NuggetEditor from '@/components/NuggetEditor'
import { useHighlightSave } from '@/components/useHighlightSave'

interface Domain {
  id: string
  name: string
  slug: string
  icon: string | null
}

interface ConceptLabel {
  language: string
  term: string
}

interface Concept {
  id: string
  description: string
  labels: ConceptLabel[]
  _count: { nuggets: number }
}

interface NuggetConceptEntry {
  relevance: number
  note: string | null
  concept: Concept
}

interface Review {
  nextReview: string
  intervalDays: number
  repetitions: number
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
  reviews: Review[]
  createdAt: string
}

/** Returns the best display label: German → English → first available. */
function primaryLabel(labels: ConceptLabel[]): string {
  return (
    labels.find(l => l.language === 'de')?.term ??
    labels.find(l => l.language === 'en')?.term ??
    labels[0]?.term ?? '?'
  )
}

/** Formats an ISO date as a short German date (e.g. 9. Juni 2026). */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

/**
 * Read-only Tiptap reading view with debounced highlight persistence.
 * Mounted only once the nugget is loaded so the highlight hook is seeded with
 * the real initial HTML (its baseline is captured at first render).
 */
function NuggetReader({ id, contentHtml }: { id: string; contentHtml: string }) {
  const { html, handleContentChange, handleEditorReady } = useHighlightSave(id, contentHtml)
  return (
    <NuggetEditor
      value={html}
      editable={false}
      onChange={handleContentChange}
      onReady={handleEditorReady}
    />
  )
}

export default function NuggetDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()

  const [nugget, setNugget]   = useState<Nugget | null>(null)
  const [loading, setLoading] = useState(true)
  const [isOwner, setIsOwner] = useState(false)
  const [infoOpen, setInfoOpen]       = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/nuggets/${id}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setNugget(await res.json())
    } catch (e) {
      console.error('Fehler beim Laden:', e)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
    fetch('/api/auth/me')
      .then(r => r.json())
      .then((d: { isOwner: boolean }) => setIsOwner(d.isOwner))
      .catch(() => {})
  }, [load])

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    await fetch(`/api/nuggets/${id}`, { method: 'DELETE' })
    router.push('/all')
  }

  if (loading) {
    return (
      <div className="pt-10">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Lädt…</p>
      </div>
    )
  }

  if (!nugget) {
    return (
      <div className="pt-10">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Nugget nicht gefunden.</p>
        <Link href="/all" className="text-sm" style={{ color: 'var(--accent)' }}>← Zurück</Link>
      </div>
    )
  }

  const tags = JSON.parse(nugget.tags || '[]') as string[]
  // Most-connected concepts first (how many other nuggets share each concept).
  const concepts = [...nugget.concepts].sort(
    (a, b) => b.concept._count.nuggets - a.concept._count.nuggets,
  )
  const latestReview = nugget.reviews[0]

  return (
    <>
      {/* Top action bar — back + edit/delete reachable without scrolling */}
      <header className="pt-10 pb-4">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => router.back()}
            className="text-sm px-3 py-1 rounded-lg"
            style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
          >
            ← Zurück
          </button>
          {isOwner && (
            <div className="flex items-center gap-2">
              {!confirmDelete && (
                <Link
                  href={`/edit/${nugget.id}`}
                  className="text-xs px-3 py-1 rounded-lg"
                  style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
                >
                  Bearbeiten
                </Link>
              )}
              <button
                onClick={handleDelete}
                className="text-xs px-3 py-1 rounded-lg"
                style={{
                  background: confirmDelete ? '#c0392b' : 'transparent',
                  color: confirmDelete ? 'white' : 'var(--muted)',
                  border: `1px solid ${confirmDelete ? '#c0392b' : 'var(--border)'}`,
                }}
              >
                {confirmDelete ? 'Wirklich löschen?' : 'Löschen'}
              </button>
              {confirmDelete && (
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs px-3 py-1 rounded-lg"
                  style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
                >
                  Abbrechen
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {nugget.domain && (
            <span
              className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
              style={{ background: 'var(--warm)', color: 'var(--muted)' }}
            >
              {nugget.domain.icon} {nugget.domain.name}
            </span>
          )}
        </div>
        {nugget.title && (
          <h1 className="text-2xl mt-2" style={{ color: 'var(--ink)' }}>
            {nugget.title}
          </h1>
        )}
      </header>

      {/* Content in focus */}
      <NuggetReader id={nugget.id} contentHtml={nugget.contentHtml} />

      {/* Collapsible info box — status, links & concepts hidden by default */}
      <div className="mt-6">
        <button
          onClick={() => setInfoOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}
        >
          <span>Details &amp; Konzepte</span>
          <span
            className="text-xs transition-transform"
            style={{ transform: infoOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            ▾
          </span>
        </button>

        {infoOpen && (
          <div
            className="mt-2 px-4 py-4 rounded-xl flex flex-col gap-5"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            {/* Status */}
            <div>
              <h2 className="text-xs tracking-widest uppercase mb-2" style={{ color: 'var(--muted)' }}>
                Status
              </h2>
              <p className="text-sm" style={{ color: 'var(--ink)' }}>
                Erstellt: {formatDate(nugget.createdAt)}
              </p>
              {latestReview ? (
                <p className="text-sm" style={{ color: 'var(--ink)' }}>
                  Nächste Wiederholung: {formatDate(latestReview.nextReview)}
                  {' · '}Intervall {Math.round(latestReview.intervalDays)} T
                  {' · '}{latestReview.repetitions}× wiederholt
                </p>
              ) : (
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  Noch nicht wiederholt.
                </p>
              )}
            </div>

            {/* Links */}
            {(nugget.sourceUrl || nugget.aiChatUrl) && (
              <div className="flex gap-4 flex-wrap">
                {nugget.sourceUrl && (
                  <a
                    href={nugget.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs flex items-center gap-1.5"
                    style={{ color: 'var(--accent-light)' }}
                  >
                    <span>↗</span>
                    <span>{nugget.sourceLabel || 'Quelle'}</span>
                  </a>
                )}
                {nugget.aiChatUrl && (
                  <a
                    href={nugget.aiChatUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs flex items-center gap-1.5"
                    style={{ color: 'var(--accent)' }}
                  >
                    <span>✦</span>
                    <span>KI-Chat öffnen</span>
                  </a>
                )}
              </div>
            )}

            {/* Tags */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map(tag => (
                  <span
                    key={tag}
                    className="text-xs px-2.5 py-1 rounded-full"
                    style={{ background: 'var(--warm)', color: 'var(--muted)' }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Concepts — sorted by how many nuggets share them */}
            {concepts.length > 0 && (
              <div>
                <h2 className="text-xs tracking-widest uppercase mb-2" style={{ color: 'var(--muted)' }}>
                  Konzepte
                </h2>
                <div className="flex flex-wrap gap-2">
                  {concepts.map(({ concept }) => (
                    <Link
                      key={concept.id}
                      href={`/concepts/${concept.id}`}
                      className="text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5"
                      style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}
                    >
                      <span>{primaryLabel(concept.labels)}</span>
                      <span style={{ opacity: 0.6 }}>{concept._count.nuggets}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
