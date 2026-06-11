import { TextStats } from '@/lib/textStats'

/**
 * Compact, reusable length read-out for a nugget body:
 * "1.311 Zeichen · 211 Wörter · 64 Absätze".
 *
 * Shared by the add, edit and read views so the meter looks and counts the
 * same everywhere. Switches to the accent colour once `warn` is set (used by
 * the add form past its soft length threshold).
 */
export default function TextStatsBar({
  stats,
  warn = false,
  className = '',
}: {
  stats: TextStats
  warn?: boolean
  className?: string
}) {
  return (
    <div
      className={`flex items-center gap-2 text-xs ${className}`}
      style={{ color: warn ? 'var(--accent)' : 'var(--muted)' }}
    >
      <span>{stats.chars.toLocaleString('de-DE')} Zeichen</span>
      <span style={{ opacity: 0.4 }}>·</span>
      <span>{stats.words.toLocaleString('de-DE')} Wörter</span>
      <span style={{ opacity: 0.4 }}>·</span>
      <span>{stats.paragraphs} Absätze</span>
    </div>
  )
}
