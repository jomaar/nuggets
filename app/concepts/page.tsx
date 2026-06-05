'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

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
  const [concepts, setConcepts]     = useState<Concept[]>([])
  const [search, setSearch]         = useState('')
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    fetch('/api/concepts')
      .then(r => r.json())
      .then((data: Concept[]) => { setConcepts(data); setLoading(false) })
      .catch(() => setLoading(false))
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

  return (
    <>
      <header className="pt-10 pb-6">
        <h1 className="text-3xl mb-1" style={{ fontFamily: 'Playfair Display, serif' }}>
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


    </>
  )
}
