'use client'

import { useState, useEffect, useRef, type RefObject } from 'react'
import { Volume2, Play, Pause, Square } from 'lucide-react'
import { stripOriginalLanguageQuotes, type SpeechSegment } from '@/lib/speechText'

const LANG_TAG: Record<SpeechSegment['lang'], string> = { de: 'de-DE', en: 'en-US', la: 'la' }

type Status = 'idle' | 'loading' | 'playing' | 'paused'

/**
 * "Vorlesen" — reads the nugget aloud via the browser's built-in speech
 * synthesis (Web Speech API; free, on-device, no server round trip for
 * playback itself). Per-segment language tagging (de/en/la) comes from a
 * one-time, cached AI pass (lib/speech.ts) so a mixed-language note doesn't
 * get read entirely in one accent. Hebrew/Greek original-language quotes are
 * always skipped, owner or not — iOS has no Biblical-Hebrew/Koine voice, only
 * modern he-IL/el-GR, so reading them would just mispronounce every word (the
 * adjacent "wörtlich: …" gloss already carries the meaning).
 *
 * Owner taps trigger generation on a cache miss (a small one-time AI call,
 * cached on the nugget afterwards). A non-owner, or the owner before ever
 * generating, gets a plain single-voice fallback built from the rendered
 * text — Hebrew/Greek still skipped (free, deterministic), but English/Latin
 * just read with a German accent.
 */
export default function SpeechPlayer({ nuggetId, contentRef, isOwner }: {
  nuggetId: string
  contentRef: RefObject<HTMLDivElement | null>
  isOwner: boolean
}) {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const segmentsRef = useRef<SpeechSegment[] | null>(null)

  // Stop reading if the user navigates away mid-playback.
  useEffect(() => () => { window.speechSynthesis?.cancel() }, [])

  // A same-segment hop to another nugget must stop the PREVIOUS one's reading
  // and forget its cached segments, or a tap on the new nugget would resume
  // reading the old text.
  useEffect(() => {
    window.speechSynthesis?.cancel()
    setStatus('idle')
    setError(null)
    segmentsRef.current = null
  }, [nuggetId])

  const speak = (segments: SpeechSegment[]) => {
    window.speechSynthesis.cancel()
    const real = segments.filter(s => s.text.trim())
    if (real.length === 0) { setStatus('idle'); return }
    real.forEach((seg, i) => {
      const u = new SpeechSynthesisUtterance(seg.text)
      u.lang = LANG_TAG[seg.lang] ?? 'de-DE'
      if (i === real.length - 1) {
        u.onend = () => setStatus('idle')
        u.onerror = () => setStatus('idle')
      }
      window.speechSynthesis.speak(u)
    })
    setStatus('playing')
  }

  const start = async () => {
    setError(null)
    if (segmentsRef.current) { speak(segmentsRef.current); return }
    setStatus('loading')
    try {
      const res = await fetch(`/api/nuggets/${nuggetId}/speech`)
      const cached: { segments: SpeechSegment[] | null } = res.ok ? await res.json() : { segments: null }
      if (cached.segments) {
        segmentsRef.current = cached.segments
        speak(cached.segments)
        return
      }

      if (isOwner) {
        const gen = await fetch(`/api/nuggets/${nuggetId}/speech`, { method: 'POST' })
        if (!gen.ok) {
          const body = await gen.json().catch(() => ({}))
          setError(typeof body.error === 'string' ? body.error : 'Vorlesen fehlgeschlagen.')
          setStatus('idle')
          return
        }
        const { segments }: { segments: SpeechSegment[] } = await gen.json()
        segmentsRef.current = segments
        speak(segments)
        return
      }

      // Non-owner fallback: no AI call, single German voice, Hebrew/Greek
      // still stripped (that part is free and deterministic).
      const text = stripOriginalLanguageQuotes(contentRef.current?.textContent ?? '')
      const fallback: SpeechSegment[] = text.trim() ? [{ text, lang: 'de' }] : []
      segmentsRef.current = fallback
      speak(fallback)
    } catch {
      setError('Vorlesen fehlgeschlagen.')
      setStatus('idle')
    }
  }

  const toggle = () => {
    if (status === 'idle') { start(); return }
    if (status === 'playing') { window.speechSynthesis.pause(); setStatus('paused'); return }
    if (status === 'paused') { window.speechSynthesis.resume(); setStatus('playing') }
  }

  const stop = () => {
    window.speechSynthesis.cancel()
    setStatus('idle')
  }

  const active = status === 'playing' || status === 'paused'

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={status === 'loading'}
        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-60"
        style={{
          background: active ? 'var(--accent)' : 'transparent',
          color:      active ? 'white'         : 'var(--muted)',
          border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        }}
      >
        {status === 'loading' && 'Bereite vor…'}
        {status === 'playing' && (<><Pause size={14} /> Pause</>)}
        {status === 'paused'  && (<><Play size={14} /> Weiter</>)}
        {status === 'idle'    && (<><Volume2 size={14} /> Vorlesen</>)}
      </button>
      {active && (
        <button
          type="button"
          onClick={stop}
          aria-label="Vorlesen stoppen"
          className="flex items-center justify-center w-8 h-8 rounded-lg"
          style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
        >
          <Square size={14} />
        </button>
      )}
      {error && <span className="text-xs" style={{ color: 'var(--act-delete)' }}>{error}</span>}
    </div>
  )
}
