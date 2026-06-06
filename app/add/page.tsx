'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { marked } from 'marked'

interface Domain {
  id: string
  name: string
  slug: string
  icon: string | null
}

export default function AddPage() {
  const router = useRouter()
  const [content, setContent]         = useState('')
  const [preview, setPreview]         = useState(false)
  const [domains, setDomains]         = useState<Domain[]>([])
  const [domainId, setDomainId]       = useState<string>('')
  const [sourceUrl, setSourceUrl]     = useState('')
  const [sourceLabel, setSourceLabel] = useState('')
  const [aiChatUrl, setAiChatUrl]     = useState('')
  const [tags, setTags]               = useState('')
  const [saving, setSaving]           = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/domains')
      .then(r => r.json())
      .then((data: Domain[]) => {
        setDomains(data)
        const books = data.find(d => d.slug === 'books')
        if (books) setDomainId(books.id)
      })
      .catch(() => {})
  }, [])

  const handleFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
        const doc = new DOMParser().parseFromString(text, 'text/html')
        setContent(doc.body.innerText.trim())
      } else {
        setContent(text)
      }
    }
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }

  const handleSave = async () => {
    if (!content.trim()) return
    setSaving(true)
    await fetch('/api/nuggets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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

  return (
    <>
      <header className="pt-10 pb-6">
        <h1 className="text-3xl" style={{ fontFamily: 'Playfair Display, serif' }}>
          Neuer Nugget
        </h1>
      </header>

      <div className="flex flex-col gap-4">
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
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.txt,.html,.htm"
            onChange={handleFileLoad}
            style={{ display: 'none' }}
          />
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <label className="text-xs tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
                Inhalt *
              </label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs px-2 py-0.5 rounded-lg"
                style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
              >
                ↑ Datei laden
              </button>
            </div>
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
              placeholder="Markdown hier schreiben…"
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

        {/* Buttons */}
        <div className="flex gap-3 mt-2">
          <button
            onClick={() => router.back()}
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
            {saving ? 'Speichert…' : 'Nugget speichern'}
          </button>
        </div>
      </div>


    </>
  )
}
