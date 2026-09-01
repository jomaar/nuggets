'use client'

import { Volume2, Play, Pause, Square } from 'lucide-react'
import type { SpeechControls } from './useSpeech'

/**
 * "Vorlesen" — the control surface for the read-aloud state machine, which
 * lives in {@link useSpeech} on the reading page. Purely presentational and
 * therefore free to unmount with the settings panel: closing the panel hides
 * these buttons but keeps the reading going (reopen it to pause or stop).
 *
 * Speech comes from the browser's built-in synthesis (Web Speech API; free,
 * on-device). ⚠️ iOS suspends it as soon as Safari is backgrounded or the
 * screen locks — this cannot play like a podcast in the background, and no
 * Media Session wiring changes that (see useSpeech's notes).
 */
export default function SpeechPlayer({ status, error, toggle, stop }: SpeechControls) {
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
