'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/',      label: 'Heute',   icon: '◈' },
  { href: '/add',   label: 'Neu',     icon: '+' },
  { href: '/all',   label: 'Alle',    icon: '≡' },
]

export default function BottomNav() {
  const path = usePathname()
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 flex justify-around items-center px-4 py-3 z-50"
      style={{
        background: 'rgba(245,240,232,0.92)',
        backdropFilter: 'blur(12px)',
        borderTop: '1px solid var(--border)',
      }}
    >
      {links.map(({ href, label, icon }) => {
        const active = path === href
        return (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-0.5 min-w-[60px] transition-all"
            style={{ color: active ? 'var(--accent)' : 'var(--muted)' }}
          >
            <span className="text-xl leading-none" style={{ fontWeight: active ? 600 : 400 }}>
              {icon}
            </span>
            <span className="text-[10px] tracking-wide uppercase">
              {label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
