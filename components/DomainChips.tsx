import DomainIcon from './DomainIcon'

interface Domain {
  id: string
  name: string
  slug: string
  icon: string | null
}

/**
 * Short label for tighter layouts: the part before " & " (e.g.
 * "Business & Technik" → "Business"), falling back to the full name.
 */
function shortName(name: string): string {
  return (name.split(/\s*&\s*/)[0] || name).trim()
}

/**
 * Adaptive domain selector. Renders one chip per domain, scaling to however
 * many domains exist, and shows progressively more depending on width:
 *   - narrow (phone): coloured icon only
 *   - medium (sm+):   icon + short name
 *   - wide (lg+):     icon + full name
 * The selected chip is filled with the accent colour; unselected chips show the
 * domain's own colour on the icon. `title` keeps the full name reachable even in
 * icon-only mode.
 */
export default function DomainChips({
  domains,
  selectedId,
  onSelect,
  variant = 'adaptive',
}: {
  domains: Domain[]
  selectedId: string
  onSelect: (id: string) => void
  /** 'adaptive' scales the label with width; 'full' always shows the full name
   *  (used where the choice must stay explicit, e.g. the pre-save dialog). */
  variant?: 'adaptive' | 'full'
}) {
  const full = variant === 'full'
  return (
    <div className="flex flex-wrap gap-1.5">
      {domains.map(d => {
        const selected = selectedId === d.id
        return (
          <button
            key={d.id}
            type="button"
            onClick={() => onSelect(d.id)}
            title={d.name}
            className={`inline-flex items-center gap-1.5 rounded-full transition-all ${
              full ? 'px-3 py-1.5 text-sm' : 'px-2.5 py-1 text-xs'
            }`}
            style={{
              background: selected ? 'var(--accent)' : 'var(--surface)',
              color:      selected ? 'white'         : 'var(--ink)',
              border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
            }}
          >
            <DomainIcon slug={d.slug} size={full ? 14 : 15} colored={!selected} />
            {full ? (
              <span>{d.name}</span>
            ) : (
              <>
                <span className="hidden sm:inline lg:hidden">{shortName(d.name)}</span>
                <span className="hidden lg:inline">{d.name}</span>
              </>
            )}
          </button>
        )
      })}
    </div>
  )
}
