'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'

export default function AddPage() {
  const router = useRouter()
  const [content, setContent]         = useState('')
  const [sourceUrl, setSourceUrl]     = useState('')
  const [sourceLabel, setSourceLabel] = useState('')
  const [aiChatUrl, setAiChatUrl]     = useState('')
  const [tags, setTags]               = useState('')
  const [saving, setSaving]           = useState(false)

  const handleSave = async () => {
    if (!content.trim()) return
    setSaving(true)
    await fetch('/api/nuggets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        sourceUrl:   sourceUrl   || null,
        sourceLabel: sourceLabel || null,
        aiChatUrl:   aiChatUrl   || null,
        tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      }),
    })
    setSaving(false)
    router.push('/')
  }

  const inputStyle = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '0.75rem 1rem',
    width: '100%',
    fontSize: '0.9rem',
    color: 'var(--ink)',
    fontFamily: 'DM Sans, sans-serif',
    outline: 'none',
  }

  return (
    <>
      <header className="pt-10 pb-6">
        <h1 className="text-3xl" style={{ fontFamily: 'Playfair Display, serif' }}>
          Neuer Nugget
        </h1>
      </header>

      <div className="flex flex-col gap-4">
        {/* Main content */}
        <div>
          <label className="text-xs tracking-widest uppercase mb-2 block" style={{ color: 'var(--muted)' }}>
            Inhalt *
          </label>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Text, Markdown oder HTML einfügen…"
            rows={6}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: '1.6' }}
          />
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
            Markdown wird automatisch formatiert.
          </p>
        </div>

        {/* Source */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs tracking-widest uppercase mb-2 block" style={{ color: 'var(--muted)' }}>
              Quell-URL
            </label>
            <input
              value={sourceUrl}
              onChange={e => setSourceUrl(e.target.value)}
              placeholder="https://…"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="text-xs tracking-widest uppercase mb-2 block" style={{ color: 'var(--muted)' }}>
              Bezeichnung
            </label>
            <input
              value={sourceLabel}
              onChange={e => setSourceLabel(e.target.value)}
              placeholder="YouTube, Buch…"
              style={inputStyle}
            />
          </div>
        </div>

        {/* AI Chat */}
        <div>
          <label className="text-xs tracking-widest uppercase mb-2 block" style={{ color: 'var(--muted)' }}>
            KI-Chat URL
          </label>
          <input
            value={aiChatUrl}
            onChange={e => setAiChatUrl(e.target.value)}
            placeholder="https://claude.ai/chat/… oder ChatGPT-Link"
            style={inputStyle}
          />
        </div>

        {/* Tags */}
        <div>
          <label className="text-xs tracking-widest uppercase mb-2 block" style={{ color: 'var(--muted)' }}>
            Tags (kommagetrennt)
          </label>
          <input
            value={tags}
            onChange={e => setTags(e.target.value)}
            placeholder="Philosophie, Lernen, Technik…"
            style={inputStyle}
          />
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving || !content.trim()}
          className="w-full py-4 rounded-2xl text-base font-medium transition-all active:scale-95 mt-2"
          style={{
            background: content.trim() ? 'var(--accent)' : 'var(--border)',
            color: content.trim() ? 'white' : 'var(--muted)',
          }}
        >
          {saving ? 'Speichert…' : 'Nugget speichern'}
        </button>
      </div>

      <BottomNav />
    </>
  )
}
