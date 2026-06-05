'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { marked } from 'marked'

interface Domain {
  id: string
  name: string
  slug: string
  icon: string | null
}

export default function EditPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()

  const [title, setTitle]             = useState('')
  const [content, setContent]         = useState('')
  const [preview, setPreview]         = useState(false)
  const [domains, setDomains]         = useState<Domain[]>([])
  const [domainId, setDomainId]       = useState<string>('')
  const [sourceUrl, setSourceUrl]     = useState('')
  const [sourceLabel, setSourceLabel] = useState('')
  const [aiChatUrl, setAiChatUrl]     = useState('')
  const [tags, setTags]               = useState('')
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)

  const loadNugget = useCallback(async () => {
    const [nuggetRes, domainsRes] = await Promise.all([
      fetch(`/api/nuggets/${id}`),
      fetch('/api/domains'),
    ])
    const nugget  = await nuggetRes.json()
    const domList = await domainsRes.json() as Domain[]

    setDomains(domList)
    setTitle(nugget.title || '')
    setContent(nugget.contentMarkdown || nugget.contentPlain || '')
    setDomainId(nugget.domainId || '')
    setSourceUrl(nugget.sourceUrl || '')
    setSourceLabel(nugget.sourceLabel || '')
    setAiChatUrl(nugget.aiChatUrl || '')
    setTags(JSON.parse(nugget.tags || '[]').join(', '))
    setLoading(false)
  }, [id])

  useEffect(() => { loadNugget() }, [loadNugget])

  const handleSave = async () => {
    if (!content.trim()) return
    setSaving(true)
    await fetch(`/api/nuggets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title:       title,
        contentMarkdown: content,
        domainId:    domainId    || null,
        sourceUrl:   sourceUrl   || null,
        sourceLabel: sourceLabel || null,
        aiChatUrl:   aiChatUrl   || null,
        tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      }),
    })
    setSaving(false)
    router.push('/all')
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

  if (loading) {
    return (
      <div className="pt-10">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Lädt…</p>

      </div>
    )
  }

  return (
    <>
      <header className="pt-10 pb-6">
        <h1 className="text-3xl" style={{ fontFamily: 'Playfair Display, serif' }}>
          Nugget bearbeiten
        </h1>
      </header>

      <div className="flex flex-col gap-4">
        {/* Title */}
        <div>
          <label className="text-xs tracking-widest uppercase mb-2 block" style={{ color: 'var(--muted)' }}>
            Titel <span style={{ opacity: 0.5 }}>(leer = wird von KI generiert)</span>
          </label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Kurzer, aussagekräftiger Titel…"
            style={inputStyle}
          />
        </div>

        {/* Domain selector */}
        {domains.length > 0 && (
          <div>
            <label className="text-xs tracking-widest uppercase mb-2 block" style={{ color: 'var(--muted)' }}>
              Domain
            </label>
            <div className="flex gap-2 flex-wrap">
              {domains.map(d => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDomainId(d.id)}
                  className="px-3 py-1.5 rounded-full text-sm transition-all"
                  style={{
                    background: domainId === d.id ? 'var(--accent)' : 'var(--surface)',
                    color:      domainId === d.id ? 'white'         : 'var(--muted)',
                    border: `1px solid ${domainId === d.id ? 'var(--accent)' : 'var(--border)'}`,
                  }}
                >
                  {d.icon} {d.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Content with Edit / Preview toggle */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
              Inhalt *
            </label>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setPreview(false)}
                className="text-xs px-3 py-1 rounded-lg transition-all"
                style={{
                  background: !preview ? 'var(--accent)' : 'transparent',
                  color:      !preview ? 'white'         : 'var(--muted)',
                  border: `1px solid ${!preview ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                Schreiben
              </button>
              <button
                type="button"
                onClick={() => setPreview(true)}
                className="text-xs px-3 py-1 rounded-lg transition-all"
                style={{
                  background: preview ? 'var(--accent)' : 'transparent',
                  color:      preview ? 'white'         : 'var(--muted)',
                  border: `1px solid ${preview ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                Vorschau
              </button>
            </div>
          </div>
          {!preview ? (
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={8}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: '1.6' }}
            />
          ) : (
            <div
              className="nugget-content"
              style={{ ...inputStyle, minHeight: '12rem' }}
              dangerouslySetInnerHTML={{ __html: marked(content) as string }}
            />
          )}
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
            placeholder="https://claude.ai/chat/…"
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
            placeholder="Philosophie, Lernen…"
            style={inputStyle}
          />
        </div>

        {/* Buttons */}
        <div className="flex gap-3 mt-2">
          <button
            onClick={() => router.push('/all')}
            className="flex-1 py-4 rounded-2xl text-base font-medium"
            style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !content.trim()}
            className="flex-1 py-4 rounded-2xl text-base font-medium transition-all active:scale-95"
            style={{
              background: content.trim() ? 'var(--accent)' : 'var(--border)',
              color:      content.trim() ? 'white'         : 'var(--muted)',
            }}
          >
            {saving ? 'Speichert…' : 'Änderungen speichern'}
          </button>
        </div>
      </div>


    </>
  )
}
