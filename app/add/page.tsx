'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { marked } from 'marked'
import TurndownService from 'turndown'
import { stripImportBallast } from '@/lib/content'
import { detectBibleText, convertBibleText, type BibleConversion } from '@/lib/bible'
import { countPlainText } from '@/lib/textStats'
import DomainChips from '@/components/DomainChips'
import TextStatsBar from '@/components/TextStatsBar'
import { getLastDomainSlug, setLastDomainSlug } from '@/lib/lastDomain'

interface Domain {
  id: string
  name: string
  slug: string
  icon: string | null
  color: string | null
}

/**
 * Soft warning threshold (characters). Above this the content is long enough
 * that the AI revision gets noticeably slower and more expensive — we nudge
 * the user but never block. The hard cap lives server-side (/api/extract).
 */
const WARN_CHARS = 20_000

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
  const [reviseContent, setReviseContent] = useState(true)
  const [aiHint, setAiHint]           = useState('')
  const [title, setTitle]             = useState('')
  // Result of a Bible conversion; non-null also suppresses re-detection.
  const [bibleConverted, setBibleConverted] = useState<BibleConversion | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [saving, setSaving]           = useState(false)
  const [extracting, setExtracting]   = useState(false)
  const [extractError, setExtractError] = useState('')
  const [saveError, setSaveError]     = useState('')
  // Set when the nugget itself saved fine but the AI call (title/tags/concepts)
  // failed — e.g. an invalid or spend-limit-disabled API key. Without this the
  // save looked identical to a fully successful one, so a failure went unnoticed
  // until someone wondered why a nugget never showed up in the knowledge graph.
  const [aiWarning, setAiWarning]     = useState<{ message: string; nuggetId: string } | null>(null)
  // Set when extraction succeeded but a new concept's label matches a known
  // naming anti-pattern (e.g. "X (Author)") — non-blocking (nugget + concepts
  // are already saved), unlike aiWarning which means extraction failed.
  const [conceptWarning, setConceptWarning] = useState<{ message: string; nuggetId: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Default the domain picker to the last domain worked in (shared with
  // app/all's filter, see lib/lastDomain.ts). If the last state was "Alle"
  // (no domain), fall back to "Glaube & Bibel".
  useEffect(() => {
    fetch('/api/domains')
      .then(r => r.json())
      .then((data: Domain[]) => {
        setDomains(data)
        const lastSlug = getLastDomainSlug()
        const fallback = data.find(d => d.slug === (lastSlug || 'faith'))
        if (fallback) setDomainId(fallback.id)
      })
      .catch(() => {})
  }, [])

  // Quick-add via iOS Shortcut / Share Sheet: the shortcut opens
  // /add?…. We pre-fill the content field so the user lands in the form
  // ready to review & save (the deliberate domain + AI-hint dialog stays
  // intact). Three params are accepted:
  //   • ?q=…    — the smart single param the Shortcut uses. We sniff its
  //              shape: an http(s) value is treated as a link, anything
  //              else as text. This keeps the iOS Shortcut branch-free.
  //   • ?url=…  — explicit link  (back-compat / power users)
  //   • ?text=… — explicit text  (back-compat / power users)
  // Resolution: text becomes the content body; an accompanying url then
  // pre-fills the source field. A lone url drops into BOTH the content
  // field (so «Text aus Link» can resolve it) and the source field.
  // Read from window.location rather than useSearchParams() to avoid the
  // App-Router Suspense-boundary requirement on this client page.
  useEffect(() => {
    const params       = new URLSearchParams(window.location.search)
    let   resolvedText = params.get('text')?.trim()
    let   resolvedUrl  = params.get('url')?.trim()
    const sharedQuery  = params.get('q')?.trim()
    if (!resolvedText && !resolvedUrl && sharedQuery) {
      if (/^https?:\/\//i.test(sharedQuery)) resolvedUrl = sharedQuery
      else                                   resolvedText = sharedQuery
    }
    if (resolvedText) {
      setContent(resolvedText)
      if (resolvedUrl) setSourceUrl(resolvedUrl)
    } else if (resolvedUrl) {
      setContent(resolvedUrl)
      setSourceUrl(resolvedUrl)
    }
  }, [])

  const handleDomainSelect = (id: string) => {
    setDomainId(id)
    setLastDomainSlug(domains.find(d => d.id === id)?.slug ?? '')
  }

  const handleFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
        const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' })
        setContent(td.turndown(stripImportBallast(text)))
      } else {
        setContent(text)
      }
    }
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }

  // Treat the content field as a link and replace it with the resolved text.
  // The fetch runs server-side (/api/extract) so it has real network access;
  // for now only YouTube transcripts are supported. On success we also
  // pre-fill the source fields (if still empty) as a convenience.
  const handleExtractFromLink = async () => {
    const url = content.trim()
    if (!url) {
      setExtractError('Erst einen Link ins Inhalt-Feld einfügen.')
      return
    }
    setExtracting(true)
    setExtractError('')
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (!res.ok) {
        setExtractError(data?.error || 'Konnte den Text nicht laden.')
        return
      }
      setContent(data.text)
      if (!sourceUrl) setSourceUrl(url)
      if (!sourceLabel && data.source === 'youtube') setSourceLabel('YouTube')
      if (data.truncated) {
        setExtractError('Der Text war sehr lang und wurde gekürzt. Bitte prüfen.')
      }
    } catch {
      setExtractError('Netzwerkfehler — bitte erneut versuchen.')
    } finally {
      setExtracting(false)
    }
  }

  const handleSave = async () => {
    if (!content.trim()) return
    setSaving(true)
    setSaveError('')
    try {
      const res = await fetch('/api/nuggets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentMarkdown: content,
          title: title.trim() || undefined,
          domainId:    domainId    || null,
          sourceUrl:   sourceUrl   || null,
          sourceLabel: sourceLabel || null,
          aiChatUrl:   aiChatUrl   || null,
          tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
          reviseContent,
          aiHint: aiHint.trim() || null,
        }),
      })
      // Stay on the freshly created nugget's read view so the user can see how
      // the AI revised the content (and adjust it if needed), instead of bouncing
      // to the «alle» list. Fall back to the list if the response lacks an id.
      if (res.ok) {
        const created = await res.json()
        if (created?.aiWarning && created?.id) {
          setShowConfirm(false)
          setAiWarning({ message: created.aiWarning, nuggetId: created.id })
          return
        }
        if (created?.conceptWarning && created?.id) {
          setShowConfirm(false)
          setConceptWarning({ message: created.conceptWarning, nuggetId: created.id })
          return
        }
        if (created?.id) {
          router.push(`/nugget/${created.id}`)
          return
        }
        router.push('/all')
        return
      }
      setSaveError('Speichern fehlgeschlagen — bitte erneut versuchen.')
    } catch {
      // Without this, any thrown fetch (timeout, network drop, aborted request
      // on a long AI revision) would leave the dialog stuck on «Speichert…»
      // forever with no feedback.
      setSaveError('Netzwerkfehler beim Speichern — bitte erneut versuchen.')
    } finally {
      // Always reset so the button never sticks; navigation has already
      // returned above on success, so this only runs on error/stay.
      setSaving(false)
    }
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

  const stats = countPlainText(content)
  const tooLong = stats.chars > WARN_CHARS

  // Raw Bible book detection (translation header + inline verse numbers).
  // Cheap line scan, skipped for short inputs and after a conversion.
  const bible = useMemo(
    () => (bibleConverted ? null : detectBibleText(content)),
    [content, bibleConverted]
  )

  // Convert to scroll-style flow text with <sup data-verse> markers. AI revision
  // must go off: the LLM's rewrite overwrites contentHtml and would drop the
  // markers (lib/concepts.ts).
  const handleBibleConvert = () => {
    const res = convertBibleText(content)
    setContent(res.body)
    setTitle(res.title)
    if (res.sourceLabel && !sourceLabel) setSourceLabel(res.sourceLabel)
    setReviseContent(false)
    setBibleConverted(res)
  }

  return (
    <>
      <header className="pt-3 pb-6">
        <h1 className="text-3xl">
          Neuer Nugget
        </h1>
      </header>

      <div className="flex flex-col gap-4">
        {/* Domain selector — adaptive chips (icon-only → +short → +full name) */}
        {domains.length > 0 && (
          <div>
            <label className="text-xs tracking-widest uppercase mb-2 block" style={{ color: 'var(--muted)' }}>
              Domain
            </label>
            <DomainChips domains={domains} selectedId={domainId} onSelect={handleDomainSelect} />
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
              <button
                type="button"
                onClick={handleExtractFromLink}
                disabled={extracting}
                className="text-xs px-2 py-0.5 rounded-lg transition-all"
                style={{ color: 'var(--muted)', border: '1px solid var(--border)', opacity: extracting ? 0.6 : 1 }}
              >
                {extracting ? '⏳ Lädt…' : '⥥ Text aus Link'}
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
          {/* Live length meter above the field — turns accent once the soft
              threshold is exceeded. */}
          <TextStatsBar stats={stats} warn={tooLong} className="mb-1.5" />
          {bible && (
            <div
              className="mb-2 p-3 rounded-xl flex items-center justify-between gap-3"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <p className="text-xs" style={{ color: 'var(--ink)' }}>
                📖 <strong>Bibelbuch erkannt</strong>
                {bible.title ? `: ${bible.title}` : ''}
                {bible.translation ? ` (${bible.translation})` : ''} — als Fließtext
                mit Versmarkern übernehmen?
              </p>
              <button
                type="button"
                onClick={handleBibleConvert}
                className="text-xs px-3 py-1 rounded-lg shrink-0 transition-all active:scale-95"
                style={{ background: 'var(--accent)', color: 'white' }}
              >
                Umwandeln
              </button>
            </div>
          )}
          {bibleConverted && (
            <p className="text-xs mb-2" style={{ color: 'var(--muted)' }}>
              📖 Umgewandelt: {bibleConverted.title || 'Bibelbuch'} ·{' '}
              {bibleConverted.chapterCount} Kapitel · {bibleConverted.verseCount} Verse.
              Die ✨ KI-Überarbeitung wurde deaktiviert, damit die Versmarker erhalten bleiben.
            </p>
          )}
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
          {extractError && (
            <p className="text-xs mt-2" style={{ color: 'var(--accent)' }}>
              {extractError}
            </p>
          )}
          {tooLong && !extractError && (
            <p className="text-xs mt-2" style={{ color: 'var(--accent)' }}>
              ⚠️ Sehr langer Inhalt — die ✨ KI-Überarbeitung wird langsamer und teurer.
              Erwäge, vorab zu kürzen oder im KI-Hinweis ein Wortlimit zu setzen.
            </p>
          )}
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              ✨ KI-Überarbeitung <span style={{ opacity: 0.5 }}>(Struktur, Redundanz, Kürzung)</span>
            </span>
            <button
              type="button"
              onClick={() => setReviseContent(v => !v)}
              className="text-xs px-3 py-1 rounded-lg transition-all"
              style={{
                background: reviseContent ? 'var(--accent)' : 'transparent',
                color:      reviseContent ? 'white'         : 'var(--muted)',
                border: `1px solid ${reviseContent ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              {reviseContent ? 'An' : 'Aus'}
            </button>
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

        {/* Buttons — kept compact (same scale as the Schreiben/Vorschau toggles
            above) and right-aligned, rather than full-width blocks. */}
        <div className="flex gap-2 justify-end mt-2">
          <button
            onClick={() => router.back()}
            className="text-xs px-3 py-1.5 rounded-lg transition-all"
            style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}
          >
            Abbrechen
          </button>
          <button
            onClick={() => setShowConfirm(true)}
            disabled={saving || !content.trim()}
            className="text-xs px-3 py-1.5 rounded-lg transition-all active:scale-95"
            style={{
              background: content.trim() ? 'var(--accent)' : 'var(--border)',
              color:      content.trim() ? 'white'         : 'var(--muted)',
            }}
          >
            Nugget speichern
          </button>
        </div>
      </div>

      {/* Pre-save confirmation dialog: forces a deliberate domain choice (easy to
          miss in the form above) and offers an optional per-note AI instruction
          (Phase 5c — steers how the content gets revised/condensed/filtered). */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => !saving && setShowConfirm(false)}
        >
          <div
            className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6 flex flex-col gap-5"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-xl">Vor dem Speichern</h2>

            {/* Domain — deliberate confirmation, names always shown */}
            <div>
              <label className="text-xs tracking-widest uppercase mb-2 block" style={{ color: 'var(--muted)' }}>
                Domain
              </label>
              <DomainChips domains={domains} selectedId={domainId} onSelect={handleDomainSelect} variant="full" />
            </div>

            {/* Per-note AI instruction (Phase 5c) */}
            <div>
              <label className="text-xs tracking-widest uppercase mb-2 block" style={{ color: 'var(--muted)' }}>
                Hinweis an die KI <span style={{ textTransform: 'none', letterSpacing: 0, opacity: 0.6 }}>(optional)</span>
              </label>
              <textarea
                value={aiHint}
                onChange={e => setAiHint(e.target.value)}
                placeholder={'z. B. „Auf 200 Wörter kürzen", „Nur die Kernargumente, Anekdoten weglassen"…'}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', lineHeight: '1.6' }}
              />
              <p className="text-xs mt-1.5" style={{ color: 'var(--muted)', opacity: reviseContent ? 0.7 : 1 }}>
                {reviseContent
                  ? 'Steuert, wie die ✨ KI-Überarbeitung formatiert / filtert. Wird nicht gespeichert.'
                  : '⚠️ Wirkt nur mit ✨ KI-Überarbeitung — die ist gerade aus.'}
              </p>
            </div>

            {saveError && (
              <p className="text-xs" style={{ color: 'var(--accent)' }}>
                {saveError}
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-3 mt-1">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={saving}
                className="flex-1 py-3 rounded-xl text-base font-medium"
                style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}
              >
                Zurück
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-3 rounded-xl text-base font-medium transition-all active:scale-95"
                style={{ background: 'var(--accent)', color: 'white' }}
              >
                {saving ? 'Speichert…' : 'Jetzt speichern'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI failure warning: the nugget itself is saved (see handleSave), but
          without this dialog that success looked identical to a fully working
          save — title/tags/concepts silently never got extracted. */}
      {aiWarning && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.45)' }}
        >
          <div
            className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6 flex flex-col gap-4"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
          >
            <h2 className="text-xl">⚠️ KI-Verarbeitung fehlgeschlagen</h2>
            <p className="text-sm" style={{ color: 'var(--ink)' }}>
              Der Nugget wurde gespeichert, aber Titel, Tags und die Einbindung ins
              Wissensnetz (Konzepte) konnten nicht automatisch ermittelt werden:
            </p>
            <p className="text-sm font-medium" style={{ color: 'var(--accent)' }}>
              {aiWarning.message}
            </p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Titel/Tags lassen sich manuell nachtragen; die Konzept-Verknüpfung kann
              später nachgeholt werden, sobald die Ursache behoben ist.
            </p>
            <button
              onClick={() => router.push(`/nugget/${aiWarning.nuggetId}`)}
              className="py-3 rounded-xl text-base font-medium transition-all active:scale-95"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              Verstanden, zum Nugget
            </button>
          </div>
        </div>
      )}

      {/* Soft, non-blocking notice: extraction succeeded, but a new concept's
          label matches a known naming anti-pattern (e.g. "X (Author)") and may
          need a manual rename — unlike aiWarning above, this never blocked saving. */}
      {conceptWarning && (
        <div
          className="fixed left-4 right-4 bottom-4 sm:left-auto sm:right-4 sm:max-w-sm z-50 rounded-xl p-4 flex flex-col gap-2"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Konzept-Hinweis</p>
            <button onClick={() => setConceptWarning(null)} aria-label="Schließen" style={{ color: 'var(--muted)' }}>×</button>
          </div>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>{conceptWarning.message}</p>
          <button
            onClick={() => router.push(`/nugget/${conceptWarning.nuggetId}`)}
            className="text-xs self-start"
            style={{ color: 'var(--accent-light)' }}
          >
            Zum Nugget →
          </button>
        </div>
      )}
    </>
  )
}
