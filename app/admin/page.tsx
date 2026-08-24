'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ChevronRight, Wrench } from 'lucide-react'
import DomainIcon from '@/components/DomainIcon'

interface DomainPrompt {
  id: string
  name: string
  slug: string
  icon: string | null
  color: string | null
  domainPrompt: string | null
}

type AiHealth = { ok: boolean; error?: string; model?: string }

export default function AdminPage() {
  const [globalAddition, setGlobalAddition] = useState('')
  const [domains, setDomains]               = useState<DomainPrompt[]>([])
  const [domainPrompts, setDomainPrompts]   = useState<Record<string, string>>({})
  const [loading, setLoading]               = useState(true)
  const [saving, setSaving]                 = useState(false)
  const [savedAt, setSavedAt]               = useState<number | null>(null)
  const [aiHealth, setAiHealth]             = useState<AiHealth | null>(null)
  const [checkingAi, setCheckingAi]         = useState(false)

  const checkAiHealth = useCallback(async () => {
    setCheckingAi(true)
    try {
      const res = await fetch('/api/ai/health')
      setAiHealth(await res.json())
    } catch {
      setAiHealth({ ok: false, error: 'Netzwerkfehler beim Prüfen.' })
    } finally {
      setCheckingAi(false)
    }
  }, [])

  useEffect(() => { checkAiHealth() }, [checkAiHealth])

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/prompts')
    if (!res.ok) { setLoading(false); return }
    const data = await res.json() as { globalPromptAddition: string; domains: DomainPrompt[] }
    setGlobalAddition(data.globalPromptAddition || '')
    setDomains(data.domains)
    setDomainPrompts(Object.fromEntries(data.domains.map(d => [d.id, d.domainPrompt || ''])))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    setSaving(true)
    setSavedAt(null)
    await fetch('/api/admin/prompts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ globalPromptAddition: globalAddition, domainPrompts }),
    })
    setSaving(false)
    setSavedAt(Date.now())
  }

  const inputStyle = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '0.75rem 1rem',
    width: '100%',
    fontSize: '0.85rem',
    color: 'var(--ink)',
    fontFamily: 'DM Sans, sans-serif',
    outline: 'none',
    resize: 'vertical' as const,
    lineHeight: '1.6',
  }

  if (loading) {
    return (
      <div className="pt-3">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Lädt…</p>
      </div>
    )
  }

  return (
    <>
      <header className="pt-3 pb-6">
        <h1 className="text-3xl">
          KI-Prompts
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
          Diese Texte werden an den fest im Code definierten Kern-Prompt angehängt —
          der strukturelle Vertrag mit der Konzept-Extraktion bleibt dabei unangetastet.
        </p>
      </header>

      <div className="flex flex-col gap-6">
        {/* Werkzeuge — owner-only utilities that aren't prompt settings; this
            link is their only entry point (no nav tab, see app/tools). */}
        <Link
          href="/tools"
          className="p-4 rounded-2xl flex items-center justify-between gap-3"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <span className="flex items-center gap-2.5 text-sm" style={{ color: 'var(--ink)' }}>
            <Wrench size={16} style={{ color: 'var(--muted)' }} />
            Werkzeuge <span style={{ color: 'var(--muted)' }}>(PDF → Markdown)</span>
          </span>
          <ChevronRight size={16} style={{ color: 'var(--muted)' }} />
        </Link>

        {/* AI heartbeat — a metadata-only call (no token cost), so it catches
            an invalid/spend-limit-disabled API key before it silently breaks
            a nugget save. */}
        <div
          className="p-4 rounded-2xl flex items-center justify-between gap-3"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              style={{
                width: '0.6rem',
                height: '0.6rem',
                borderRadius: '50%',
                display: 'inline-block',
                background: checkingAi
                  ? 'var(--muted)'
                  : aiHealth?.ok
                    ? '#2f9e44'
                    : 'var(--act-delete, #c0392b)',
              }}
            />
            <div>
              <p className="text-sm" style={{ color: 'var(--ink)' }}>
                {checkingAi
                  ? 'Prüfe KI-Verbindung…'
                  : aiHealth?.ok
                    ? `KI erreichbar (${aiHealth.model})`
                    : aiHealth?.error || 'KI-Verbindung fehlgeschlagen'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={checkAiHealth}
            disabled={checkingAi}
            className="text-xs px-3 py-1.5 rounded-lg shrink-0"
            style={{ color: 'var(--muted)', border: '1px solid var(--border)', opacity: checkingAi ? 0.6 : 1 }}
          >
            Jetzt prüfen
          </button>
        </div>

        {/* Global addition */}
        <div>
          <label className="text-xs tracking-widest uppercase mb-2 block" style={{ color: 'var(--muted)' }}>
            Globaler Zusatz <span style={{ opacity: 0.5 }}>(gilt für alle Domains)</span>
          </label>
          <textarea
            value={globalAddition}
            onChange={e => setGlobalAddition(e.target.value)}
            placeholder="z. B. „Sei prägnanter“, „Bevorzuge deutsche Begriffe bei Ambiguität“…"
            rows={4}
            style={inputStyle}
          />
        </div>

        {/* Per-domain prompts */}
        {domains.map(d => (
          <div key={d.id}>
            <label className="inline-flex items-center gap-1.5 text-xs tracking-widest uppercase mb-2" style={{ color: 'var(--muted)' }}>
              <DomainIcon slug={d.slug} icon={d.icon} color={d.color} size={13} colored />
              {d.name}
            </label>
            <textarea
              value={domainPrompts[d.id] ?? ''}
              onChange={e => setDomainPrompts(prev => ({ ...prev, [d.id]: e.target.value }))}
              placeholder={`Zusatz-Anweisungen für ${d.name}…`}
              rows={4}
              style={inputStyle}
            />
          </div>
        ))}

        {/* Save */}
        <div className="flex items-center gap-3 mt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-4 rounded-2xl text-base font-medium transition-all active:scale-95"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            {saving ? 'Speichert…' : 'Speichern'}
          </button>
          {savedAt && !saving && (
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              ✓ Gespeichert
            </span>
          )}
        </div>
      </div>
    </>
  )
}
