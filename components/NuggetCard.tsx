'use client'

import { useState } from 'react'

interface NuggetCardProps {
  id: string
  contentHtml: string
  sourceUrl?: string | null
  sourceLabel?: string | null
  aiChatUrl?: string | null
  tags: string[]
  nextReview?: Date | null
  onReview?: (id: string, rating: 'again' | 'hard' | 'easy') => void
  showReviewButtons?: boolean
}

export default function NuggetCard({
  id, contentHtml, sourceUrl, sourceLabel, aiChatUrl,
  tags, onReview, showReviewButtons = false
}: NuggetCardProps) {
  const [reviewed, setReviewed] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleReview = async (rating: 'again' | 'hard' | 'easy') => {
    if (!onReview || loading) return
    setLoading(true)
    await onReview(id, rating)
    setReviewed(true)
    setLoading(false)
  }

  return (
    <article
      className="rounded-2xl border p-6 mb-5 transition-all"
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--border)',
        boxShadow: '0 2px 12px rgba(26,23,20,0.06)',
      }}
    >
      {/* Content */}
      <div
        className="nugget-content"
        dangerouslySetInnerHTML={{ __html: contentHtml }}
      />

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-4">
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

      {/* Source & AI Chat links */}
      <div className="flex gap-4 mt-4 flex-wrap">
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs flex items-center gap-1.5"
            style={{ color: 'var(--accent-light)' }}
          >
            <span>↗</span>
            <span>{sourceLabel || 'Quelle'}</span>
          </a>
        )}
        {aiChatUrl && (
          <a
            href={aiChatUrl}
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

      {/* Review buttons */}
      {showReviewButtons && !reviewed && (
        <div className="flex gap-3 mt-5 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => handleReview('again')}
            disabled={loading}
            className="flex-1 py-2 rounded-xl text-sm font-medium transition-all active:scale-95"
            style={{ background: 'var(--warm)', color: 'var(--muted)' }}
          >
            Nochmal
          </button>
          <button
            onClick={() => handleReview('hard')}
            disabled={loading}
            className="flex-1 py-2 rounded-xl text-sm font-medium transition-all active:scale-95"
            style={{ background: '#f0e8d8', color: 'var(--accent)' }}
          >
            Schwer
          </button>
          <button
            onClick={() => handleReview('easy')}
            disabled={loading}
            className="flex-1 py-2 rounded-xl text-sm font-medium transition-all active:scale-95"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            Leicht ✓
          </button>
        </div>
      )}

      {reviewed && (
        <p className="text-xs mt-4 text-center" style={{ color: 'var(--muted)' }}>
          ✓ Bewertet – bis zum nächsten Mal
        </p>
      )}
    </article>
  )
}
