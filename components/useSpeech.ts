'use client'

import { useState, useEffect, useRef, useCallback, type RefObject } from 'react'
import { stripOriginalLanguageQuotes, type SpeechSegment } from '@/lib/speechText'

const LANG_TAG: Record<SpeechSegment['lang'], string> = { de: 'de-DE', en: 'en-US', la: 'la' }

/** How much text to sample at the reading position to locate it in the spoken text. */
const PROBE_LEN = 140
/** Below this many usable characters a probe is too ambiguous to match on. */
const MIN_PROBE_LEN = 24

export type SpeechStatus = 'idle' | 'loading' | 'playing' | 'paused'

export interface SpeechControls {
  status: SpeechStatus
  error: string | null
  toggle: () => void
  stop: () => void
}

/** Collapse whitespace, keeping a map from each kept char back to its source index. */
function normalizeWithMap(text: string): { norm: string; map: number[] } {
  let norm = ''
  const map: number[] = []
  let lastWasSpace = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (/\s/.test(ch)) {
      if (lastWasSpace || norm.length === 0) continue
      norm += ' '
      map.push(i)
      lastWasSpace = true
    } else {
      norm += ch
      map.push(i)
      lastWasSpace = false
    }
  }
  return { norm, map }
}

/**
 * "Vorlesen" — the speech state machine behind the read-aloud control.
 *
 * Lives as a hook on the reading page rather than inside the button component
 * so playback SURVIVES closing the "Ansicht" settings panel: the panel (and
 * with it the button) unmounts, but this state — and the utterance queue — does
 * not. Closing the panel to get the text back is the normal thing to do while
 * listening, so it must not stop the reading.
 *
 * Playback starts where the reader currently is, sampled ONCE per Play tap
 * ({@link startOffsetFromScroll}). Scrolling while it reads deliberately does
 * NOT interrupt or reposition anything — following along means scrolling, and
 * an earlier version that restarted on scroll made listening-while-reading
 * impossible. To jump: stop, scroll, press play again.
 */
export function useSpeech({ nuggetId, contentRef, stickyRef, isOwner }: {
  nuggetId: string
  contentRef: RefObject<HTMLDivElement | null>
  stickyRef: RefObject<HTMLDivElement | null>
  isOwner: boolean
}): SpeechControls {
  const [status, setStatus] = useState<SpeechStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const segmentsRef = useRef<SpeechSegment[] | null>(null)
  const statusRef = useRef<SpeechStatus>('idle')
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

  /**
   * Character offset into the spoken text matching the first line of text
   * actually visible below the sticky bar (which INCLUDES the expanded settings
   * panel, so reading starts under the panel, not behind it).
   *
   * Located by sampling the text at that point and searching for it in the
   * spoken text — not by proportional mapping, which drifted: the spoken text
   * has Hebrew/Greek quotes stripped out, so DOM offsets and spoken offsets run
   * at different rates and the start landed above the visible line in exactly
   * the quote-heavy nuggets this app is full of. Falls back to proportional
   * when the sample can't be matched (too short, or oddly split).
   */
  const startOffsetFromScroll = useCallback((segments: SpeechSegment[]): number => {
    const root = contentRef.current
    if (!root) return 0
    const full = segments.map(s => s.text).join('')
    if (!full) return 0

    const topY = (stickyRef.current?.getBoundingClientRect().bottom ?? 0) + 4
    const rootRect = root.getBoundingClientRect()
    if (rootRect.top >= topY) return 0 // reading area starts below — nothing scrolled past yet

    const doc = document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
      caretRangeFromPoint?: (x: number, y: number) => Range | null
    }
    // Probe downward from the first uncovered line: the sticky bar and its
    // expanded settings panel sit ON TOP of the text, so a point at their edge
    // resolves to a node inside the panel, not the content. Step down until the
    // caret actually lands in the reading text (a few lines is plenty).
    const x = rootRect.left + Math.min(24, rootRect.width / 2)
    let node: Node | null = null
    let nodeOffset = 0
    for (let y = topY; y < topY + 240 && !node; y += 8) {
      let candidate: Node | null = null
      let offset = 0
      if (typeof doc.caretPositionFromPoint === 'function') {
        const pos = doc.caretPositionFromPoint(x, y)
        candidate = pos?.offsetNode ?? null
        offset = pos?.offset ?? 0
      } else if (typeof doc.caretRangeFromPoint === 'function') {
        const range = doc.caretRangeFromPoint(x, y)
        candidate = range?.startContainer ?? null
        offset = range?.startOffset ?? 0
      }
      if (candidate && root.contains(candidate)) { node = candidate; nodeOffset = offset }
    }
    if (!node) return 0

    // Walk to the caret's text node, tracking how far into the document it is
    // (for the proportional fallback), then collect the sample from there on.
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let domOffset = 0
    let reached = false
    let probe = ''
    let n: Node | null
    while ((n = walker.nextNode())) {
      const value = n.textContent ?? ''
      if (!reached) {
        if (n === node) {
          reached = true
          domOffset += Math.min(nodeOffset, value.length)
          probe += value.slice(nodeOffset)
        } else {
          domOffset += value.length
        }
      } else {
        probe += value
      }
      if (reached && probe.length >= PROBE_LEN) break
    }
    if (!reached) return 0

    // Match against the spoken text on equal terms: same Hebrew/Greek stripping,
    // same whitespace squashing (the DOM collapses whitespace the source keeps).
    const probeNorm = normalizeWithMap(stripOriginalLanguageQuotes(probe.slice(0, PROBE_LEN))).norm.trim()
    if (probeNorm.length >= MIN_PROBE_LEN) {
      const { norm: fullNorm, map } = normalizeWithMap(full)
      const at = fullNorm.indexOf(probeNorm)
      if (at !== -1) return map[at] ?? 0
    }

    const domTotalLen = root.textContent?.length || 1
    return Math.round(Math.min(1, Math.max(0, domOffset / domTotalLen)) * full.length)
  }, [contentRef, stickyRef])

  const speak = useCallback((segments: SpeechSegment[], fromOffset = 0) => {
    window.speechSynthesis.cancel()
    let cursor = 0
    const queue: SpeechSegment[] = []
    for (const seg of segments) {
      const segEnd = cursor + seg.text.length
      if (segEnd > fromOffset) {
        queue.push({ text: seg.text.slice(Math.max(0, fromOffset - cursor)), lang: seg.lang })
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

  return { status, error, toggle, stop }
}
