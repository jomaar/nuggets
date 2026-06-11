'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { marked } from 'marked'
import NuggetEditor from '@/components/NuggetEditor'
import DomainChips from '@/components/DomainChips'
import TextStatsBar from '@/components/TextStatsBar'
import { stripImportBallast } from '@/lib/content'
import { countHtml } from '@/lib/textStats'

interface Domain {
  id: string
  name: string
  slug: string
  icon: string | null
  color: string | null
}

export default function EditPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()

  const [title, setTitle]             = useState('')
  const [content, setContent]         = useState('')  // canonical HTML
  const [domains, setDomains]         = useState<Domain[]>([])
  const [domainId, setDomainId]       = useState<string>('')
  const [sourceUrl, setSourceUrl]     = useState('')
  const [sourceLabel, setSourceLabel] = useState('')
  const [aiChatUrl, setAiChatUrl]     = useState('')
  const [tags, setTags]               = useState('')
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editorBoxRef = useRef<HTMLDivElement>(null)

  const loadNugget = useCallback(async () => {
    const [nuggetRes, domainsRes] = await Promise.all([
      fetch(`/api/nuggets/${id}`),
      fetch('/api/domains'),
    ])
    const nugget  = await nuggetRes.json()
    const domList = await domainsRes.json() as Domain[]

    setDomains(domList)
    setTitle(nugget.title || '')
    // Canonical content is HTML; fall back to rendering Markdown for legacy nuggets.
    if (nugget.contentHtml) {
      setContent(nugget.contentHtml)
    } else if (nugget.contentMarkdown) {
      setContent(marked(nugget.contentMarkdown) as string)
    } else {
      setContent(nugget.contentPlain || '')
    }
    setDomainId(nugget.domainId || '')
    setSourceUrl(nugget.sourceUrl || '')
    setSourceLabel(nugget.sourceLabel || '')
    setAiChatUrl(nugget.aiChatUrl || '')
    setTags(JSON.parse(nugget.tags || '[]').join(', '))
    setLoading(false)
  }, [id])

  useEffect(() => { loadNugget() }, [loadNugget])

  /**
   * Restore the reading scroll position: if the single view stashed how far the
   * user had scrolled into the content, scroll the editor box to the same depth.
   * The Tiptap editor renders asynchronously and grows the page height, so we
   * keep re-applying the target for a short window until the layout settles.
   */
  useEffect(() => {
    if (loading) return
    const raw = sessionStorage.getItem(`nugget-edit-scroll-${id}`)
    if (raw === null) return
    sessionStorage.removeItem(`nugget-edit-scroll-${id}`)
    const offset = Number(raw)
    if (Number.isNaN(offset)) return

    let cancelled = false
    const start = performance.now()
    const tick = () => {
      if (cancelled) return
      const box = editorBoxRef.current
      if (box) {
        const editorTop = box.getBoundingClientRect().top + window.scrollY
        window.scrollTo({ top: Math.max(0, editorTop + offset) })
      }
      if (performance.now() - start < 600) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    return () => { cancelled = true }
  }, [loading, id])

  const handleFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      // Editor works in HTML: keep HTML as-is, render Markdown/plain to HTML.
      if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
        setContent(stripImportBallast(text))
      } else {
        setContent(marked(text) as string)
      }
    }
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }

  const handleSave = async () => {
    if (!content.trim()) return
    setSaving(true)
    await fetch(`/api/nuggets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title:       title,
        contentHtml: content,
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
      {/* Sticky action bar — Abbrechen / Speichern stay reachable while scrolling
          a long nugget, instead of sitting far below the content. */}
      <header
        className="sticky top-0 z-30 -mx-4 px-4 pt-10 pb-3 flex items-center justify-between gap-3"
        style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}
      >
        <h1 className="text-xl" style={{ color: 'var(--ink)' }}>
          Bearbeiten
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/all')}
            className="text-xs px-3 py-1.5 rounded-lg"
            style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !content.trim()}
            className="text-xs px-3 py-1.5 rounded-lg transition-all active:scale-95"
            style={{
              background: content.trim() ? 'var(--accent)' : 'var(--border)',
              color:      content.trim() ? 'white'         : 'var(--muted)',
            }}
          >
            {saving ? 'Speichert…' : 'Speichern'}
          </button>
        </div>
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
            <DomainChips domains={domains} selectedId={domainId} onSelect={setDomainId} />
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
          <div className="flex items-center gap-2 mb-2">
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
          {/* Live length meter — updates as the editor content changes. */}
          <TextStatsBar stats={countHtml(content)} className="mb-1.5" />
          <div ref={editorBoxRef} style={{ ...inputStyle, padding: 0 }}>
            <NuggetEditor value={content} onChange={setContent} />
          </div>
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
      </div>
    </>
  )
}
