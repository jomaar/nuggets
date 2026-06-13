'use client'

import { useState } from 'react'
import { X, Sparkles } from 'lucide-react'

/**
 * Quick-action presets — each fills the prompt field with a ready instruction
 * the user can still edit before sending. Mirrors the TODO-7 action idea.
 */
const PRESETS: { label: string; prompt: string }[] = [
  { label: 'Kürzen',        prompt: 'Kürze den Text deutlich, ohne wichtige Aussagen zu verlieren.' },
  { label: 'Vereinfachen',  prompt: 'Formuliere den Text einfacher und verständlicher.' },
  { label: 'Grammatik',     prompt: 'Korrigiere Grammatik, Rechtschreibung und Zeichensetzung; lasse den Inhalt unverändert.' },
  { label: 'Umformulieren', prompt: 'Formuliere den Text um — gleiche Bedeutung, anderer Wortlaut.' },
]

interface AiReworkPopupProps {
  /** The selected passage that will be reworked and (on accept) replaced. */
  selectedText: string
  /** Close without changing the document. */
  onClose: () => void
  /** Accept: replace the selection with this reworked text. */
  onReplace: (newText: string) => void
}

/**
 * Modal popup to rework a selected passage with the AI (PLAN.md TODO 7, edit-view
 * variant). The user writes an instruction (or picks a preset), sends it to
 * /api/rework, reviews the returned text, and either re-sends with a tweaked
 * prompt, discards, or replaces the selection in the editor. The popup never
 * mutates the document itself — replacing is the parent's job via onReplace, so
 * the editor stays the single source of truth for the content.
 */
export default function AiReworkPopup({ selectedText, onClose, onReplace }: AiReworkPopupProps) {
  const [prompt, setPrompt]   = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<string | null>(null)
  const [error, setError]     = useState<string | null>(null)

  /** Send the selection + instruction to the AI and show the returned text. */
  const send = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/rework', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: selectedText, prompt }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Fehler')
      setResult(data.result as string)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'KI-Anfrage fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  const boxStyle = {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: '10px',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(28,28,30,0.4)' }}
      onClick={() => !loading && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden flex flex-col"
        style={{ background: 'var(--surface)', maxHeight: '85vh', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <h2 className="text-sm font-medium flex items-center gap-1.5" style={{ color: 'var(--ink)' }}>
            <Sparkles size={15} style={{ color: 'var(--accent)' }} />
            Mit KI überarbeiten
          </h2>
          <button onClick={onClose} aria-label="Schließen" style={{ color: 'var(--muted)' }}>
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-4 flex flex-col gap-4" style={{ overscrollBehavior: 'contain' }}>
          {/* The passage being reworked — so the user sees what they selected. */}
          <div>
            <p className="text-xs tracking-widest uppercase mb-1.5" style={{ color: 'var(--muted)' }}>
              Markierter Text
            </p>
            <p className="text-sm px-3 py-2 max-h-28 overflow-y-auto" style={{ ...boxStyle, color: 'var(--muted)' }}>
              {selectedText}
            </p>
          </div>

          {/* Quick actions — fill the prompt field, still editable. */}
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(p => (
              <button
                key={p.label}
                type="button"
                onClick={() => setPrompt(p.prompt)}
                className="text-xs px-2.5 py-1 rounded-full"
                style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Free-text instruction. */}
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Anweisung an die KI – z. B. kürzer und sachlicher…"
            rows={3}
            className="w-full text-sm px-3 py-2 outline-none resize-none"
            style={{ ...boxStyle, color: 'var(--ink)' }}
          />

          {error && (
            <p className="text-sm" style={{ color: '#c0392b' }}>{error}</p>
          )}

          {/* The reworked result, once it arrives. */}
          {result !== null && (
            <div>
              <p className="text-xs tracking-widest uppercase mb-1.5" style={{ color: 'var(--muted)' }}>
                Vorschlag
              </p>
              <p className="text-sm px-3 py-2 max-h-48 overflow-y-auto whitespace-pre-wrap" style={{ ...boxStyle, color: 'var(--ink)' }}>
                {result}
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div
          className="flex items-center justify-end gap-2 px-4 py-3 flex-shrink-0"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded-lg"
            style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
          >
            Abbrechen
          </button>
          <button
            onClick={send}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-50"
            style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}
          >
            {loading ? 'KI denkt…' : result === null ? 'Senden' : 'Erneut senden'}
          </button>
          {result !== null && (
            <button
              onClick={() => onReplace(result)}
              disabled={loading}
              className="text-xs px-3 py-1.5 rounded-lg transition-all active:scale-95 disabled:opacity-50"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              Ersetzen
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
