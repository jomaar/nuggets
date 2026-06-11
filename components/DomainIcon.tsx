import { Cross, Briefcase, HeartPulse, BookOpen, Tag, type LucideIcon } from 'lucide-react'

/**
 * Maps a domain slug to a Lucide line icon. Unknown slugs fall back to a
 * neutral tag icon so future domains still render something.
 */
const DOMAIN_ICONS: Record<string, LucideIcon> = {
  faith:    Cross,       // Glaube & Bibel
  business: Briefcase,   // Business & Technik
  health:   HeartPulse,  // Gesundheit & Fitness
  books:    BookOpen,    // Bücher & Ideen
}

/**
 * A distinct accent colour per domain. Known slugs get a hand-picked colour;
 * unknown / future slugs get a stable colour from the palette by hashing the
 * slug — so adding a 5th, 6th, 7th domain needs no code change and the colour
 * stays consistent across renders.
 */
const DOMAIN_COLORS: Record<string, string> = {
  business: '#2563EB', // blue
  books:    '#7C3AED', // violet
  health:   '#DC2626', // red
  faith:    '#CA8A04', // gold
}
const COLOR_PALETTE = [
  '#2563EB', '#7C3AED', '#DC2626', '#CA8A04',
  '#0891B2', '#16A34A', '#DB2777', '#EA580C',
]

/** The colour for a domain slug (hand-picked, else deterministic from palette). */
export function domainColor(slug: string): string {
  if (DOMAIN_COLORS[slug]) return DOMAIN_COLORS[slug]
  let hash = 0
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) >>> 0
  return COLOR_PALETTE[hash % COLOR_PALETTE.length]
}

interface DomainIconProps {
  slug: string
  size?: number
  className?: string
  /** Render in the domain's own colour instead of inheriting the text colour. */
  colored?: boolean
}

/**
 * Renders the Lucide icon for a domain. By default it inherits the surrounding
 * text colour (currentColor); with `colored`, it uses the domain's own colour.
 */
export default function DomainIcon({ slug, size = 14, className, colored = false }: DomainIconProps) {
  const Icon = DOMAIN_ICONS[slug] ?? Tag
  return (
    <Icon
      size={size}
      strokeWidth={1.75}
      className={className}
      color={colored ? domainColor(slug) : undefined}
    />
  )
}
