import { Cross, Briefcase, HeartPulse, BookOpen, Tag, type LucideIcon } from 'lucide-react'

/**
 * Maps a domain slug to a Lucide line icon. Monochrome icons inherit the
 * surrounding text color (currentColor), so they stay visually consistent with
 * labels and pills instead of the old multi-color emoji. Unknown slugs fall
 * back to a neutral tag icon so future domains still render something.
 */
const DOMAIN_ICONS: Record<string, LucideIcon> = {
  faith:    Cross,       // Glaube & Bibel
  business: Briefcase,   // Business & Technik
  health:   HeartPulse,  // Gesundheit & Fitness
  books:    BookOpen,    // Bücher & Ideen
}

interface DomainIconProps {
  slug: string
  size?: number
  className?: string
}

/** Renders the Lucide icon for a domain, inheriting the current text color. */
export default function DomainIcon({ slug, size = 14, className }: DomainIconProps) {
  const Icon = DOMAIN_ICONS[slug] ?? Tag
  return <Icon size={size} strokeWidth={1.75} className={className} />
}
