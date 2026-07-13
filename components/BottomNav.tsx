'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bookmark, Plus, List, Network, Tags, type LucideIcon } from 'lucide-react'

const links: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: '/',         label: 'Lesezeichen', Icon: Bookmark },
  { href: '/add',      label: 'Neu',      Icon: Plus },
  { href: '/all',      label: 'Alle',     Icon: List },
  { href: '/concepts', label: 'Konzepte', Icon: Tags },
  { href: '/graph',    label: 'Netz',     Icon: Network },
]

export default function BottomNav() {
  const path = usePathname()
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 flex justify-around items-center px-4 pt-1 z-50"
      style={{
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        boxShadow: '0 -1px 8px rgba(0,0,0,0.04)',
        // Keep the home-indicator inset itself (taps there trigger the iOS
        // home gesture) but trim the extra padding to a minimum.
        paddingBottom: 'calc(0.25rem + env(safe-area-inset-bottom))',
      }}
    >
      {links.map(({ href, label, Icon }) => {
        const active = path === href
        return (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-0.5 min-w-[60px] transition-colors"
            style={{ color: active ? 'var(--accent)' : 'var(--muted)' }}
          >
            <Icon size={22} strokeWidth={active ? 2.25 : 1.75} />
            <span className="text-[10px] tracking-wide">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
