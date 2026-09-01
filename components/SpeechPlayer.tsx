'use client'

import { useState, useEffect, useRef, useCallback, type RefObject } from 'react'
import { Volume2, Play, Pause, Square } from 'lucide-react'
import { stripOriginalLanguageQuotes, type SpeechSegment } from '@/lib/speechText'

const LANG_TAG: Record<SpeechSegment['lang'], string> = { de: 'de-DE', en: 'en-US', la: 'la' }

/** How long to wait after the last scroll event before restarting playback at the new position. */
const SCROLL_RESTART_DELAY = 700

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
 *
 * Starts from where the reader actually is, not the document's start:
 * {@link startOffsetFromScroll} maps the DOM position at the top of the
 * visible reading area (just below the sticky bar) onto a character offset
 * in the concatenated segment text, PROPORTIONALLY — it doesn't try to match
 * exact substrings, since contentPlain (what segments are built from) and the
 * live DOM text aren't guaranteed byte-identical (verse markers, mermaid
 * blocks, …). Being off by a sentence is fine: this picks a sensible start
 * point, it isn't a seek. A manual scroll while actively playing restarts
 * playback at the new position the same way, after a short debounce — real
 * audio scrubbing isn't offered (Web Speech has no seek), so this is the
 * lean substitute: interrupt and resume where you scrolled to.
 */
export default function SpeechPlayer({ nuggetId, nuggetTitle, contentRef, stickyRef, isOwner }: {
  nuggetId: string
  nuggetTitle: string
  contentRef: RefObject<HTMLDivElement | null>
  stickyRef: RefObject<HTMLDivElement | null>
  isOwner: boolean
}) {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const segmentsRef = useRef<SpeechSegment[] | null>(null)
  const statusRef = useRef<Status>('idle')
  useEffect(() => { statusRef.current = status }, [status])

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

  const startOffsetFromScroll = useCallback((segments: SpeechSegment[]): number => {
    const root = contentRef.current
    if (!root) return 0
    const totalLen = segments.reduce((n, s) => n + s.text.length, 0)
    if (totalLen === 0) return 0

    const topY = (stickyRef.current?.getBoundingClientRect().bottom ?? 0) + 4
    const rootRect = root.getBoundingClientRect()
    if (rootRect.top >= topY) return 0 // haven't scrolled into the content yet

    const doc = document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
      caretRangeFromPoint?: (x: number, y: number) => Range | null
    }
    const x = rootRect.left + 16
    let node: Node | null = null
    let nodeOffset = 0
    if (typeof doc.caretPositionFromPoint === 'function') {
      const pos = doc.caretPositionFromPoint(x, topY)
      node = pos?.offsetNode ?? null
      nodeOffset = pos?.offset ?? 0
    } else if (typeof doc.caretRangeFromPoint === 'function') {
      const range = doc.caretRangeFromPoint(x, topY)
      node = range?.startContainer ?? null
      nodeOffset = range?.startOffset ?? 0
    }
    if (!node || !root.contains(node)) return 0

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let domOffset = 0
    let found = false
    let n: Node | null
    while ((n = walker.nextNode())) {
      if (n === node) { domOffset += nodeOffset; found = true; break }
      domOffset += n.textContent?.length ?? 0
    }
    if (!found) return 0

    const domTotalLen = root.textContent?.length || 1
    const fraction = Math.min(1, Math.max(0, domOffset / domTotalLen))
    return Math.round(fraction * totalLen)
  }, [contentRef, stickyRef])

  const speak = useCallback((segments: SpeechSegment[], fromOffset = 0) => {
    window.speechSynthesis.cancel()
    let cursor = 0
    const queue: SpeechSegment[] = []
    for (const seg of segments) {
      const segEnd = cursor + seg.text.length
      if (segEnd > fromOffset) {
        const localStart = Math.max(0, fromOffset - cursor)
        queue.push({ text: seg.text.slice(localStart), lang: seg.lang })
      }
      cursor = segEnd
    }
    const real = queue.filter(s => s.text.trim())
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
  }, [])

  const start = useCallback(async () => {
    setError(null)
    if (segmentsRef.current) { speak(segmentsRef.current, startOffsetFromScroll(segmentsRef.current)); return }
    setStatus('loading')
    try {
      const res = await fetch(`/api/nuggets/${nuggetId}/speech`)
      const cached: { segments: SpeechSegment[] | null } = res.ok ? await res.json() : { segments: null }
      if (cached.segments) {
        segmentsRef.current = cached.segments
        speak(cached.segments, startOffsetFromScroll(cached.segments))
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
        speak(segments, startOffsetFromScroll(segments))
        return
      }

      // Non-owner fallback: no AI call, single German voice, Hebrew/Greek
      // still stripped (that part is free and deterministic).
      const text = stripOriginalLanguageQuotes(contentRef.current?.textContent ?? '')
      const fallback: SpeechSegment[] = text.trim() ? [{ text, lang: 'de' }] : []
      segmentsRef.current = fallback
      speak(fallback, startOffsetFromScroll(fallback))
    } catch {
      setError('Vorlesen fehlgeschlagen.')
      setStatus('idle')
    }
  }, [nuggetId, isOwner, contentRef, speak, startOffsetFromScroll])

  const stop = useCallback(() => {
    window.speechSynthesis.cancel()
    setStatus('idle')
  }, [])

  const toggle = useCallback(() => {
    if (statusRef.current === 'idle') { start(); return }
    if (statusRef.current === 'playing') { window.speechSynthesis.pause(); setStatus('paused'); return }
    if (statusRef.current === 'paused') { window.speechSynthesis.resume(); setStatus('playing') }
  }, [start])

  // Manual scroll while actively reading interrupts and resumes at the new
  // position (debounced so a long scroll gesture doesn't restart mid-drag).
  useEffect(() => {
    let timer: number | null = null
    const onScroll = () => {
      if (statusRef.current !== 'playing') return
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        if (statusRef.current !== 'playing' || !segmentsRef.current) return
        speak(segmentsRef.current, startOffsetFromScroll(segmentsRef.current))
      }, SCROLL_RESTART_DELAY)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [speak, startOffsetFromScroll])

  // Lock-screen / Control Center transport (play, pause, stop) tied to the
  // same actions — no seek handlers, Web Speech has no scrubbing to back them.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({ title: nuggetTitle || 'Nugget', artist: 'Nuggets' })
  }, [nuggetTitle])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = status === 'playing' ? 'playing' : status === 'paused' ? 'paused' : 'none'
  }, [status])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.setActionHandler('play', toggle)
    navigator.mediaSession.setActionHandler('pause', toggle)
    navigator.mediaSession.setActionHandler('stop', stop)
    return () => {
      navigator.mediaSession.setActionHandler('play', null)
      navigator.mediaSession.setActionHandler('pause', null)
      navigator.mediaSession.setActionHandler('stop', null)
    }
  }, [toggle, stop])

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
