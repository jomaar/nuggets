'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { marked } from 'marked'
import { Maximize2, Minimize2 } from 'lucide-react'
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
  const [dirty, setDirty]             = useState(false)   // unsaved edits since load/save
  const [savedFlash, setSavedFlash]   = useState(false)   // brief "Gespeichert ✓" confirmation
  const [focus, setFocus]             = useState(false)   // hide metadata fields, maximize editor
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editorBoxRef = useRef<HTMLDivElement>(null)
  // Snapshot of the last persisted field values. `dirty` is derived by comparing the
  // live fields to this; updated on load and after every successful save. The content
  // entry is corrected to Tiptap's normalized HTML via the editor's onReady callback,
  // so mount-time re-serialization doesn't count as an edit.
  const baselineRef = useRef({
    title: '', content: '', domainId: '', sourceUrl: '', sourceLabel: '', aiChatUrl: '', tags: '',
  })
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const loadNugget = useCallback(async () => {
    const [nuggetRes, domainsRes] = await Promise.all([
      fetch(`/api/nuggets/${id}`),
      fetch('/api/domains'),
    ])
    const nugget  = await nuggetRes.json()
    const domList = await domainsRes.json() as Domain[]

    // Canonical content is HTML; fall back to rendering Markdown for legacy nuggets.
    const initialContent = nugget.contentHtml
      ? nugget.contentHtml
      : nugget.contentMarkdown
        ? (marked(nugget.contentMarkdown) as string)
        : (nugget.contentPlain || '')
    const initial = {
      title:       nugget.title || '',
      content:     initialContent,
      domainId:    nugget.domainId || '',
      sourceUrl:   nugget.sourceUrl || '',
      sourceLabel: nugget.sourceLabel || '',
      aiChatUrl:   nugget.aiChatUrl || '',
      tags:        JSON.parse(nugget.tags || '[]').join(', '),
    }
    baselineRef.current = { ...initial }

    setDomains(domList)
    setTitle(initial.title)
    setContent(initial.content)
    setDomainId(initial.domainId)
    setSourceUrl(initial.sourceUrl)
    setSourceLabel(initial.sourceLabel)
    setAiChatUrl(initial.aiChatUrl)
    setTags(initial.tags)
    setLoading(false)
  }, [id])

  /**
   * Recompute the dirty flag whenever a field changes: compare the live values to the
   * last-persisted baseline. Skipped while loading so the initial field hydration doesn't
   * register as an edit.
   */
  useEffect(() => {
    if (loading) return
    const b = baselineRef.current
    setDirty(
      title       !== b.title       ||
      content     !== b.content     ||
      domainId    !== b.domainId    ||
      sourceUrl   !== b.sourceUrl   ||
      sourceLabel !== b.sourceLabel ||
      aiChatUrl   !== b.aiChatUrl   ||
      tags        !== b.tags,
    )
  }, [loading, title, content, domainId, sourceUrl, sourceLabel, aiChatUrl, tags])

  /**
   * Warn before a full page unload (reload / tab close / external navigation) while
   * there are unsaved changes. Client-side navigation (BottomNav links) is handled
   * separately by the capture-phase click interceptor below.
   */
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  /**
   * Intercept in-app navigation (Next.js <Link>, e.g. the BottomNav) while there are
   * unsaved changes and confirm before leaving. App Router has no built-in navigation
   * guard, so we catch the anchor click in the capture phase and cancel it if declined.
   * Links inside the editor content are left to Tiptap (they don't navigate here).
   */
  useEffect(() => {
    if (!dirty) return
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const anchor = (e.target as HTMLElement)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!anchor || anchor.closest('.tiptap-editor')) return
      const href = anchor.getAttribute('href') || ''
      if (!href || href.startsWith('#') || anchor.target === '_blank') return
      if (!confirm('Ungespeicherte Änderungen verwerfen?')) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [dirty])

  // Clear the pending "saved" flash timer on unmount.
  useEffect(() => () => clearTimeout(savedTimerRef.current), [])

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

  /**
   * Persist the nugget but STAY in edit mode — the user keeps reading/editing and
   * leaves via the nav whenever they want. Resets the dirty baseline to the just-saved
   * values and shows a brief confirmation instead of navigating away.
   */
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
    baselineRef.current = { title, content, domainId, sourceUrl, sourceLabel, aiChatUrl, tags }
    setDirty(false)
    setSavedFlash(true)
    clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setSavedFlash(false), 2000)
  }

  /** Leave the edit view (Abbrechen), confirming first if there are unsaved changes. */
  const handleLeave = () => {
    if (dirty && !confirm('Ungespeicherte Änderungen verwerfen?')) return
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
          {savedFlash && (
            <span className="text-xs" style={{ color: 'var(--accent)' }}>
              Gespeichert ✓
            </span>
          )}
          {/* Focus mode: hide the metadata fields and maximize the text editor. */}
          <button
            onClick={() => setFocus(f => !f)}
            className="p-1.5 rounded-lg transition-colors active:scale-95"
            style={{
              background: focus ? 'var(--accent)' : 'var(--surface)',
              color:      focus ? 'white'         : 'var(--muted)',
              border: '1px solid var(--border)',
            }}
            aria-label={focus ? 'Focus-Modus beenden' : 'Focus-Modus'}
            title={focus ? 'Focus-Modus beenden' : 'Focus-Modus'}
          >
            {focus ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button
            onClick={handleLeave}
            className="text-xs px-3 py-1.5 rounded-lg"
            style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}
          >
            {dirty ? 'Abbrechen' : 'Schließen'}
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
        {/* Title — hidden in focus mode */}
        {!focus && (
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
        )}

        {/* Domain selector — hidden in focus mode */}
        {!focus && domains.length > 0 && (
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
          {/* Label + file-load row — hidden in focus mode to free up space */}
          {!focus && (
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
          )}
          {/* Live length meter — updates as the editor content changes. */}
          <TextStatsBar stats={countHtml(content)} className="mb-1.5" />
          <div
            ref={editorBoxRef}
            className={focus ? 'edit-focus-box' : undefined}
            style={{ ...inputStyle, padding: 0 }}
          >
            <NuggetEditor
              value={content}
              onChange={setContent}
              // Adopt Tiptap's normalized serialization as the content baseline AND the
              // live value, so mount-time re-serialization isn't mistaken for an edit.
              onReady={(html) => { baselineRef.current.content = html; setContent(html) }}
              enableAiRework
            />
          </div>
        </div>

        {/* Source / AI-Chat / Tags — all hidden in focus mode */}
        {!focus && (
        <>
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
        </>
        )}
      </div>
    </>
  )
}
