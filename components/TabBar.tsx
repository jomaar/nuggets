'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { Radar, X } from 'lucide-react'
import { useTabs, type PeekSlotIndex } from './TabsContext'

/**
 * Spinnennetz Stufe 2 — the persistent tab strip: Haupt (whatever is routed)
 * · Naheliegendes (once triggered) · up to 3 Peek pills. Sticky at the very
 * top, above the per-nugget action bar (app/nugget/[id]/page.tsx,
 * app/edit/[id]/page.tsx — both read its measured height back via the
 * `--tabbar-h` CSS var, same "flash-free CSS var" convention as
 * --nugget-font-size in app/layout.tsx).
 *
 * Renders null — zero footprint, zero visual change — until there is
 * actually more than the Haupt tab, and only on the routes tabs are
 * meaningful for (/nugget/[id], /edit/[id]). Matches the existing "aufklappende
 * Zeile statt permanentes Chrome" principle: reading stays undisturbed by
 * default.
 */
export default function TabBar() {
  const pathname = usePathname()
  const tabs = useTabs()
  const barRef = useRef<HTMLDivElement>(null)

  const onTabsRoute = /^\/(nugget|edit)\//.test(pathname ?? '')
  const visible = onTabsRoute && tabs.hasExtraTabs

  // Measures its own height whenever it toggles visible/hidden or its content
  // changes — the strip is `flex-wrap`, so a row of pills that no longer fits
  // (a third peek title, a long Naheliegendes count) grows the bar to two
  // lines instead of scrolling sideways, which would hide tabs off-screen
  // with no visible cue they exist. Bounded by the 5-tab cap (Haupt +
  // Naheliegendes + ≤3 peeks), so worst case is two short rows, never a
  // runaway height. Publishes the measured height as a CSS var the sticky
  // bars below read back — mirrors ScrollJumpButton's ResizeObserver-driven
  // geometry pattern.
  useEffect(() => {
    if (!visible) {
      document.documentElement.style.setProperty('--tabbar-h', '0px')
      return
    }
    const el = barRef.current
    if (!el) return
    const update = () => {
      document.documentElement.style.setProperty('--tabbar-h', `${el.getBoundingClientRect().height}px`)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [visible])

  if (!visible) return null

  const activateHaupt = () => tabs.setActiveTab({ kind: 'haupt' })
  const activateNearby = () => tabs.setActiveTab({ kind: 'nearby' })
  const activatePeek = (slot: PeekSlotIndex) => tabs.setActiveTab({ kind: 'peek', slot })
  const closePeek = (e: React.MouseEvent, slot: PeekSlotIndex) => {
    e.stopPropagation()
    tabs.closePeek(slot)
  }

  return (
    <div
      ref={barRef}
      className="sticky top-0 z-40 -mx-4 px-4 flex items-center flex-wrap gap-1.5"
      style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', paddingTop: '0.4rem', paddingBottom: '0.4rem' }}
    >
      <Pill active={tabs.activeTab.kind === 'haupt'} onClick={activateHaupt}>
        Haupt
      </Pill>

      {tabs.nearby && (
        <Pill active={tabs.activeTab.kind === 'nearby'} onClick={activateNearby}>
          <Radar size={13} />
          Naheliegendes
          {tabs.nearby.loading ? (
            <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'currentColor' }} />
          ) : (
            <span className="tabular-nums opacity-70">{tabs.nearby.results.length}</span>
          )}
          <button
            type="button"
            onClick={e => { e.stopPropagation(); tabs.closeNearby() }}
            aria-label="Naheliegendes schließen"
            className="flex items-center justify-center -mr-1 opacity-70 hover:opacity-100"
          >
            <X size={13} />
          </button>
        </Pill>
      )}

      {tabs.peeks.map((peek, i) => {
        if (!peek) return null
        const slot = i as PeekSlotIndex
        const active = tabs.activeTab.kind === 'peek' && tabs.activeTab.slot === slot
        return (
          <Pill key={slot} active={active} onClick={() => activatePeek(slot)}>
            <span className="max-w-[7rem] truncate">{peek.title || 'Lädt…'}</span>
            <button
              type="button"
              onClick={e => closePeek(e, slot)}
              aria-label={`${peek.title} schließen`}
              className="flex items-center justify-center -mr-1 opacity-70 hover:opacity-100"
            >
              <X size={13} />
            </button>
          </Pill>
        )
      })}
    </div>
  )
}

/**
 * A `role="button"` div, NOT a real `<button>` — several pills need a
 * nested close `<button>` (Naheliegendes, peek pills), and a `<button>`
 * inside a `<button>` is invalid HTML: the browser's parser silently
 * restructures it, which desyncs from React's tree and can make the inner
 * close button unreliable to tap. `tabIndex`/`onKeyDown` keep it keyboard-
 * operable despite not being a real button element.
 */
function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap flex-shrink-0 transition-all cursor-pointer"
      style={{
        background: active ? 'var(--accent)' : 'var(--surface)',
        color: active ? 'white' : 'var(--ink)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
      }}
    >
      {children}
    </div>
  )
}
