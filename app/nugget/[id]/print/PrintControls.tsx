'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { ArrowLeft, Printer } from 'lucide-react'

/**
 * Screen-only action bar for the PDF print view.
 *
 * - Sets document.title to the nugget title while mounted so the browser's
 *   "Save as PDF" dialog proposes a sensible filename, and restores the
 *   previous title on unmount.
 * - Renders a back link plus a "Save as PDF" button that triggers the system
 *   print dialog. The whole bar carries the `no-print` class so it never shows
 *   up in the generated PDF (hidden via the @media print rule in globals.css).
 */
export default function PrintControls({ title, backHref }: { title: string; backHref: string }) {
  useEffect(() => {
    const previous = document.title
    if (title) document.title = title
    return () => {
      document.title = previous
    }
  }, [title])

  return (
    <div className="no-print flex items-center justify-between gap-2 mb-6">
      <Link
        href={backHref}
        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg"
        style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
      >
        <ArrowLeft size={16} /> Zurück
      </Link>
      <button
        onClick={() => window.print()}
        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg"
        style={{ background: 'var(--accent)', color: 'white', border: '1px solid var(--accent)' }}
      >
        <Printer size={16} /> Als PDF sichern
      </button>
    </div>
  )
}
