'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Wrench } from 'lucide-react'
import { useOwner } from '@/components/OwnerContext'
import { stashToolsHandoff } from '@/lib/toolsHandoff'

/**
 * Werkzeuge — small owner-only utilities that are not part of reading or
 * writing a nugget, but feed it. First (and so far only) tool: PDF → Markdown,
 * converted server-side by python/pdf_to_markdown.py (pymupdf4llm).
 *
 * Deliberately its own route rather than a sixth nav tab: it is a workbench you
 * visit on purpose, reached from the admin page — the same reasoning that keeps
 * Denkspuren and the Insights feed off the BottomNav.
 *
 * Adding a tool = another <section> below, plus its own /api/tools/… route.
 */

interface PdfResult {
  markdown: string
  pages: number
  chars: number
  truncated: boolean
  title: string
  filename: string
}

type ToolchainStatus = {
  ok: boolean
  error?: string
  packages?: Record<string, string>
  /** The "Naheliegendes" embedding daemon (python/embed_server.py) — a separate, always-on process, reported independently of the PDF toolchain's `ok`. */
  embed?: { ok: boolean; model?: string; dim?: number; error?: string }
}

/**
 * A PDF's metadata title is as often the authoring tool's leftover as a real
 * title — "Microsoft Word - Kapitel3.docx" is a filename wearing a title's hat.
 * Returns '' for those so the caller falls back to the actual filename.
 */
function usableTitle(title: string): string {
  const trimmed = title.trim()
  if (!trimmed) return ''
  if (/^microsoft word\s*-/i.test(trimmed)) return ''
  if (/\.(docx?|pdf|pages|odt|rtf|tex|indd)$/i.test(trimmed)) return ''
  return trimmed
}

export default function ToolsPage() {
  const router = useRouter()
  const { isOwner } = useOwner()

  const [status, setStatus]     = useState<ToolchainStatus | null>(null)
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState('')
  const [result, setResult]     = useState<PdfResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Ask once whether the Python side is actually installed — a server that was
  // never set up should say so here, not by failing the first upload.
  useEffect(() => {
    if (!isOwner) return
    fetch('/api/tools/status')
      .then(r => (r.ok ? r.json() : { ok: false, error: 'Status nicht verfügbar.' }))
      .then(setStatus)
      .catch(() => setStatus({ ok: false, error: 'Netzwerkfehler beim Prüfen.' }))
  }, [isOwner])

  const handlePdf = useCallback(async (file: File) => {
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/tools/pdf-to-markdown', { method: 'POST', body })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || 'Die Umwandlung ist fehlgeschlagen.')
        return
      }
      setResult(data as PdfResult)
    } catch {
      setError('Netzwerkfehler — bitte erneut versuchen.')
    } finally {
      setBusy(false)
    }
  }, [])

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Reset first: picking the same file twice must re-trigger onChange.
    e.target.value = ''
    if (file) handlePdf(file)
  }

  /**
   * Hand the Markdown to the new-nugget form: a real metadata title wins, the
   * filename is the fallback. Both only ever land in fields still empty there.
   */
  const takeToNugget = () => {
    if (!result) return
    const base = result.filename.replace(/\.pdf$/i, '').trim()
    stashToolsHandoff({
      markdown:    result.markdown,
      title:       usableTitle(result.title) || base,
      sourceLabel: base,
      truncated:   result.truncated,
      kind:        'PDF',
    })
    router.push('/add')
  }

  // No non-owner branch: proxy.ts redirects /tools to /login the same way it
  // guards /add, /edit and /admin. isOwner only gates the status fetch below.

  return (
    <>
      <header className="pt-3 pb-6">
        <h1 className="text-3xl flex items-center gap-2">
          <Wrench size={26} style={{ color: 'var(--muted)' }} />
          Werkzeuge
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
          Kleine Helfer rund um die Notizen — laufen auf dem Server, nicht auf dem Gerät.
        </p>
      </header>

      {/* Toolchain heartbeat — only shown when something is wrong; a working
          setup needs no reassurance and would just cost a line. */}
      {status && !status.ok && (
        <div
          className="p-4 rounded-2xl mb-6 text-sm"
          style={{ background: 'var(--surface)', border: '1px solid var(--act-delete, #c0392b)', color: 'var(--ink)' }}
        >
          ⚠️ {status.error || 'Python-Werkzeuge sind nicht einsatzbereit.'}
        </div>
      )}
      {/* Separate from the PDF-toolchain banner above — the embedding daemon
          behind "Naheliegendes" is an unrelated process, so its own crash
          shouldn't read as "PDF-Werkzeuge kaputt" or vice versa. */}
      {status?.embed && !status.embed.ok && (
        <div
          className="p-4 rounded-2xl mb-6 text-sm"
          style={{ background: 'var(--surface)', border: '1px solid var(--act-delete, #c0392b)', color: 'var(--ink)' }}
        >
          ⚠️ Embedding-Dienst (Naheliegendes) nicht erreichbar{status.embed.error ? `: ${status.embed.error}` : '.'}
        </div>
      )}

      <div className="flex flex-col gap-6">
        {/* ── Tool 1: PDF → Markdown ─────────────────────────────────────── */}
        <section
          className="p-4 rounded-2xl"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-start gap-3">
            <FileText size={20} className="shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
            <div className="min-w-0">
              <h2 className="text-base">PDF → Markdown</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                Liest den Text eines PDFs als strukturiertes Markdown aus — Überschriften,
                Listen und Tabellen bleiben erhalten. Bilder werden bewusst weggelassen.
              </p>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handlePick}
            style={{ display: 'none' }}
          />

          <div className="flex items-center gap-3 mt-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="px-4 py-2.5 rounded-xl text-sm transition-all active:scale-95"
              style={{ background: 'var(--accent)', color: 'white', opacity: busy ? 0.6 : 1 }}
            >
              {busy ? 'Wandelt um…' : result ? 'Anderes PDF' : 'PDF auswählen'}
            </button>
            {busy && (
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                Große Dokumente können einen Moment dauern.
              </span>
            )}
          </div>

          {error && (
            <p className="text-sm mt-3" style={{ color: 'var(--act-delete, #c0392b)' }}>
              {error}
            </p>
          )}

          {result && (
            <div className="mt-4">
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                <strong style={{ color: 'var(--ink)' }}>{result.filename}</strong> ·{' '}
                {result.pages} {result.pages === 1 ? 'Seite' : 'Seiten'} ·{' '}
                {result.chars.toLocaleString('de-DE')} Zeichen
                {result.truncated && ' · gekürzt'}
              </p>

              {result.chars === 0 ? (
                <p className="text-sm mt-3" style={{ color: 'var(--ink)' }}>
                  Das PDF enthält keinen auslesbaren Text — vermutlich ein Scan ohne OCR.
                </p>
              ) : (
                <>
                  <pre
                    className="mt-3 p-3 rounded-xl text-xs overflow-auto"
                    style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      color: 'var(--ink)',
                      maxHeight: '45vh',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      lineHeight: 1.5,
                    }}
                  >
                    {result.markdown}
                  </pre>

                  <button
                    type="button"
                    onClick={takeToNugget}
                    className="w-full mt-3 py-3 rounded-xl text-sm font-medium transition-all active:scale-95"
                    style={{ background: 'var(--accent)', color: 'white' }}
                  >
                    Als Nugget übernehmen
                  </button>
                  <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
                    Öffnet „Neu“ mit vorbefülltem Inhalt — Domain, KI-Überarbeitung und
                    Hinweis wählst du dort wie gewohnt.
                  </p>
                </>
              )}
            </div>
          )}
        </section>

        {/* Next tool goes here: its own <section>, its own /api/tools/… route. */}
      </div>
    </>
  )
}
