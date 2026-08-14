'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X, FileText, RefreshCw } from 'lucide-react'

interface GoogleDoc {
  id: string
  name: string
  modifiedTime: string
  webViewLink: string
}

export interface PickedGoogleDoc {
  title: string
  markdown: string
  webViewLink: string
  truncated: boolean
}

interface Props {
  onClose: () => void
  onPicked: (doc: PickedGoogleDoc) => void
}

/**
 * Picks a Google Doc from the owner's Drive and hands back its Markdown.
 *
 * Exists for the phone: on the Mac a Doc can be downloaded as Markdown and fed
 * through the ordinary file picker, but iOS offers no such export — so the doc
 * list has to live inside the app (see lib/googleDrive.ts).
 *
 * Visual pattern is the existing concept/scheme import dialogs (centred sheet
 * over a dimmed backdrop, tap-outside closes). Unlike those, the list is NOT
 * client-filtered from one payload: Drive holds far more documents than are
 * worth shipping, so the search term goes to the API, debounced.
 */
export default function GoogleDocPicker({ onClose, onPicked }: Props) {
  const [query, setQuery]     = useState('')
  const [docs, setDocs]       = useState<GoogleDoc[] | null>(null)
  const [error, setError]     = useState('')
  // Set when the grant is gone (409) — then the only useful action is
  // reconnecting, so the dialog shows that instead of the list.
  const [reconnect, setReconnect] = useState(false)
  const [loadingId, setLoadingId] = useState('')
  const requestRef = useRef(0)

  const load = useCallback(async (term: string) => {
    const ticket = ++requestRef.current
    setError('')
    setDocs(null)
    try {
      const res  = await fetch(`/api/google/docs?q=${encodeURIComponent(term)}`)
      const data = await res.json()
      // A slower earlier request must not overwrite a newer result.
      if (ticket !== requestRef.current) return
      if (!res.ok) {
        setReconnect(res.status === 409)
        setError(data?.error ?? 'Google Drive antwortet nicht.')
        setDocs([])
        return
      }
      setDocs(data.docs ?? [])
    } catch {
      if (ticket !== requestRef.current) return
      setError('Netzwerkfehler beim Laden der Dokumente.')
      setDocs([])
    }
  }, [])

  // Debounced search; also does the initial (empty-term) load.
  useEffect(() => {
    const timer = setTimeout(() => load(query), query ? 350 : 0)
    return () => clearTimeout(timer)
  }, [query, load])

  const pick = async (doc: GoogleDoc) => {
    setLoadingId(doc.id)
    setError('')
    try {
      const res  = await fetch(`/api/google/docs/${doc.id}`)
      const data = await res.json()
      if (!res.ok) {
        setReconnect(res.status === 409)
        setError(data?.error ?? 'Dokument konnte nicht geladen werden.')
        return
      }
      onPicked({
        title:       data.title ?? doc.name,
        markdown:    data.markdown ?? '',
        webViewLink: data.webViewLink ?? doc.webViewLink,
        truncated:   !!data.truncated,
      })
    } catch {
      setError('Netzwerkfehler beim Laden des Dokuments.')
    } finally {
      setLoadingId('')
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(28,28,30,0.4)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden flex flex-col"
        style={{ background: 'var(--surface)', maxHeight: '75vh', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <h2 className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            Google Doc auswählen
          </h2>
          <button onClick={onClose} aria-label="Schließen" style={{ color: 'var(--muted)' }}>
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-3 py-3 flex flex-col gap-2" style={{ overscrollBehavior: 'contain' }}>
          {reconnect ? (
            <>
              <p className="text-sm" style={{ color: 'var(--ink)' }}>{error}</p>
              <a
                href="/api/google/connect"
                className="text-sm text-center px-3 py-2.5 rounded-lg"
                style={{ background: 'var(--accent)', color: 'white' }}
              >
                Neu verbinden
              </a>
            </>
          ) : (
            <>
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Dokument suchen…"
                className="text-sm px-3 py-2 rounded-lg flex-shrink-0"
                style={{ background: 'var(--warm)', color: 'var(--ink)', border: '1px solid var(--border)' }}
                autoFocus
              />

              {error && <p className="text-sm px-1" style={{ color: 'var(--act-delete, #dc2626)' }}>{error}</p>}

              {docs === null ? (
                <p className="text-sm text-center py-6" style={{ color: 'var(--muted)' }}>Lädt…</p>
              ) : docs.length === 0 ? (
                !error && (
                  <p className="text-sm text-center py-6" style={{ color: 'var(--muted)' }}>
                    {query.trim() ? 'Kein Treffer.' : 'Keine Google Docs gefunden.'}
                  </p>
                )
              ) : (
                docs.map(doc => (
                  <button
                    key={doc.id}
                    onClick={() => pick(doc)}
                    disabled={!!loadingId}
                    className="text-left px-3 py-2.5 rounded-lg flex items-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50"
                    style={{ background: 'var(--warm)' }}
                  >
                    {loadingId === doc.id
                      ? <RefreshCw size={15} className="flex-shrink-0 animate-spin" style={{ color: 'var(--muted)' }} />
                      : <FileText  size={15} className="flex-shrink-0" style={{ color: 'var(--muted)' }} />}
                    <span className="flex flex-col min-w-0">
                      <span className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>
                        {doc.name}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>
                        {formatDate(doc.modifiedTime)}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** Drive returns RFC 3339; the list only needs the day. */
function formatDate(iso: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })
}
